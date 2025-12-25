import { kv as vercelKv } from "@vercel/kv";

// In-memory store for local development without Vercel KV
const memoryStore = new Map<string, unknown>();
const memoryLists = new Map<string, string[]>();
const memorySets = new Map<string, Set<string>>();

const isLocalDev =
  process.env.NODE_ENV === "development" && !process.env.KV_REST_API_URL;

// KV interface matching what we use
interface KVStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options?: { ex?: number }): Promise<"OK">;
  del(...keys: string[]): Promise<number>;
  hgetall<T>(key: string): Promise<T | null>;
  hget<T>(key: string, field: string): Promise<T | null>;
  hset(key: string, value: Record<string, unknown>): Promise<number>;
  lpush(key: string, ...values: string[]): Promise<number>;
  rpush(key: string, ...values: string[]): Promise<number>;
  lpop<T>(key: string, count?: number): Promise<T | null>;
  llen(key: string): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  sadd(key: string, ...members: string[]): Promise<number>;
  sismember(key: string, member: string): Promise<number>;
  smembers(key: string): Promise<string[]>;
  scard(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
}

// Mock KV implementation for local development
const localKv: KVStore = {
  async get<T>(key: string): Promise<T | null> {
    return (memoryStore.get(key) as T) ?? null;
  },

  async set(
    key: string,
    value: unknown,
    _options?: { ex?: number }
  ): Promise<"OK"> {
    memoryStore.set(key, value);
    // Note: TTL (options.ex) is ignored in local dev - memory clears on restart anyway
    return "OK";
  },

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (
        memoryStore.has(key) ||
        memoryLists.has(key) ||
        memorySets.has(key)
      ) {
        deleted++;
      }
      memoryStore.delete(key);
      memoryLists.delete(key);
      memorySets.delete(key);
    }
    return deleted;
  },

  async hgetall<T>(key: string): Promise<T | null> {
    return (memoryStore.get(key) as T) ?? null;
  },

  async hget<T>(key: string, field: string): Promise<T | null> {
    const hash = memoryStore.get(key) as Record<string, unknown> | undefined;
    if (!hash) return null;
    return (hash[field] as T) ?? null;
  },

  async hset(key: string, value: Record<string, unknown>): Promise<number> {
    const existing = (memoryStore.get(key) as Record<string, unknown>) || {};
    memoryStore.set(key, { ...existing, ...value });
    return Object.keys(value).length;
  },

  async lpush(key: string, ...values: string[]): Promise<number> {
    const list = memoryLists.get(key) || [];
    list.unshift(...values);
    memoryLists.set(key, list);
    return list.length;
  },

  async rpush(key: string, ...values: string[]): Promise<number> {
    const list = memoryLists.get(key) || [];
    list.push(...values);
    memoryLists.set(key, list);
    return list.length;
  },

  async lpop<T>(key: string, count?: number): Promise<T | null> {
    const list = memoryLists.get(key) || [];
    if (list.length === 0) return null;

    if (count) {
      const items = list.splice(0, count);
      memoryLists.set(key, list);
      return items as unknown as T;
    }

    const item = list.shift();
    memoryLists.set(key, list);
    return (item as T) ?? null;
  },

  async llen(key: string): Promise<number> {
    return memoryLists.get(key)?.length ?? 0;
  },

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const list = memoryLists.get(key) || [];
    const end = stop === -1 ? list.length : stop + 1;
    return list.slice(start, end);
  },

  async sadd(key: string, ...members: string[]): Promise<number> {
    const set = memorySets.get(key) || new Set();
    let added = 0;
    for (const member of members) {
      if (!set.has(member)) {
        set.add(member);
        added++;
      }
    }
    memorySets.set(key, set);
    return added;
  },

  async sismember(key: string, member: string): Promise<number> {
    const set = memorySets.get(key);
    return set?.has(member) ? 1 : 0;
  },

  async smembers(key: string): Promise<string[]> {
    const set = memorySets.get(key);
    return set ? Array.from(set) : [];
  },

  async scard(key: string): Promise<number> {
    const set = memorySets.get(key);
    return set?.size ?? 0;
  },

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
    const allKeys = [
      ...memoryStore.keys(),
      ...memoryLists.keys(),
      ...memorySets.keys(),
    ];
    return [...new Set(allKeys)].filter((k) => regex.test(k));
  },
};

// Export the appropriate KV implementation
// Cast to our interface to avoid union type issues
export const kv: KVStore = isLocalDev ? localKv : (vercelKv as unknown as KVStore);

// Helper to check if using local dev mode
export const isUsingLocalKv = isLocalDev;
