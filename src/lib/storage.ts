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
    return new Set(ids as string[]);
  } catch {
    // KV not configured yet, return empty set
    return new Set();
  }
}

// Mark post IDs as seen
export async function markPostsAsSeen(postIds: string[]): Promise<void> {
  if (postIds.length === 0) return;

  try {
    // Add each ID to the set (sadd accepts variable args via apply)
    for (const id of postIds) {
      await kv.sadd(SEEN_POSTS_KEY, id);
    }
  } catch (error) {
    console.error("Failed to mark posts as seen:", error);
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
