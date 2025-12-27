import { kv } from "./kv";

const SEEN_POSTS_KEY = "seen_posts";
const LAST_CHECK_KEY = "last_check";

export interface CheckResult {
  lastCheck: string | null;
  seenCount: number;
}

// Get all seen post IDs
export async function getSeenPostIds(): Promise<Set<string>> {
  try {
    const ids = await kv.smembers(SEEN_POSTS_KEY);
    console.log(`[STORAGE] smembers returned ${Array.isArray(ids) ? ids.length : 'non-array'} IDs`);
    if (!ids || !Array.isArray(ids)) {
      console.error("[STORAGE] smembers returned invalid data:", typeof ids);
      return new Set();
    }
    return new Set(ids as string[]);
  } catch (error) {
    console.error("[STORAGE] Failed to get seen posts:", error);
    return new Set();
  }
}

// Mark post IDs as seen
export async function markPostsAsSeen(postIds: string[]): Promise<void> {
  if (postIds.length === 0) return;

  console.log(`[STORAGE] Marking ${postIds.length} posts as seen`);
  console.log(`[STORAGE] Sample IDs: ${postIds.slice(0, 5).join(', ')}`);

  try {
    // Add all IDs at once (more efficient)
    const added = await kv.sadd(SEEN_POSTS_KEY, ...postIds);
    console.log(`[STORAGE] Actually added ${added} new IDs to seen set`);
  } catch (error) {
    console.error("[STORAGE] Failed to mark posts as seen:", error);
  }
}

// Update last check timestamp
export async function updateLastCheck(): Promise<void> {
  try {
    await kv.set(LAST_CHECK_KEY, new Date().toISOString());
  } catch (error) {
    console.error("Failed to update last check:", error);
  }
}

// Get last check info
export async function getCheckInfo(): Promise<CheckResult> {
  try {
    const [lastCheck, seenCount] = await Promise.all([
      kv.get<string>(LAST_CHECK_KEY),
      kv.scard(SEEN_POSTS_KEY),
    ]);
    return { lastCheck, seenCount };
  } catch {
    return { lastCheck: null, seenCount: 0 };
  }
}

// Clear all data (for testing/reset)
export async function clearAllData(): Promise<void> {
  try {
    await kv.del(SEEN_POSTS_KEY, LAST_CHECK_KEY);
  } catch (error) {
    console.error("Failed to clear data:", error);
  }
}
