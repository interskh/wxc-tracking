import { kv } from "./kv";
import { Job, JobPost, JobStatus } from "@/types/job";
import { JOB_CONFIG, TRACKING_URLS } from "./config";

// KV key helpers
const keys = {
  job: (id: string) => `job:${id}`,
  posts: (id: string) => `job:${id}:posts`,
  archiveQueue: (id: string) => `job:${id}:archive_queue`,
  subpageQueue: (id: string) => `job:${id}:subpage_queue`,
  currentJob: "current_job",
  lastJob: "last_job", // Persists after completion for preview
};

// Generate unique job ID
export function generateJobId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Create a new job
export async function createJob(): Promise<Job> {
  const id = generateJobId();
  const now = new Date().toISOString();

  const job: Job = {
    id,
    status: "discovering",
    startedAt: now,
    updatedAt: now,
    archiveUrlsTotal: TRACKING_URLS.length,
    archiveUrlsComplete: 0,
    subpagesTotal: 0,
    subpagesComplete: 0,
    totalNewPosts: 0,
    emailSent: false,
  };

  // Initialize job and queue archive URLs
  const archiveUrls = TRACKING_URLS.map((t) => JSON.stringify(t));

  await kv.set(keys.job(id), job, { ex: 86400 }); // 24h TTL
  await kv.set(keys.currentJob, id);
  await kv.set(keys.lastJob, id); // Keep reference for preview after completion
  await kv.rpush(keys.archiveQueue(id), ...archiveUrls);

  return job;
}

// Get current active job (or last completed job for preview)
export async function getCurrentJob(): Promise<Job | null> {
  try {
    // Try current job first (in-progress)
    let jobId = await kv.get<string>(keys.currentJob);

    // Fall back to last job (completed) for preview
    if (!jobId) {
      jobId = await kv.get<string>(keys.lastJob);
    }

    if (!jobId) return null;
    return await kv.get<Job>(keys.job(jobId));
  } catch {
    return null;
  }
}

// Get job by ID
export async function getJob(jobId: string): Promise<Job | null> {
  try {
    return await kv.get<Job>(keys.job(jobId));
  } catch {
    return null;
  }
}

// Update job
export async function updateJob(
  jobId: string,
  updates: Partial<Job>
): Promise<void> {
  const job = await getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  const updated = {
    ...job,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await kv.set(keys.job(jobId), updated, { ex: 86400 });
}

// Transition job status
export async function transitionJob(
  jobId: string,
  newStatus: JobStatus,
  extra?: Partial<Job>
): Promise<void> {
  const updates: Partial<Job> = { status: newStatus, ...extra };

  if (newStatus === "complete" || newStatus === "failed") {
    updates.completedAt = new Date().toISOString();
  }

  await updateJob(jobId, updates);

  // Clear current job reference on completion
  if (newStatus === "complete" || newStatus === "failed") {
    await kv.del(keys.currentJob);
  }
}

// Get next batch of archive URLs
export async function getArchiveBatch(
  jobId: string
): Promise<{ name: string; url: string }[]> {
  const batch: { name: string; url: string }[] = [];

  for (let i = 0; i < JOB_CONFIG.archiveBatchSize; i++) {
    const item = await kv.lpop<string>(keys.archiveQueue(jobId));
    if (!item) break;
    batch.push(JSON.parse(item));
  }

  return batch;
}

// Check if archive queue is empty
export async function isArchiveQueueEmpty(jobId: string): Promise<boolean> {
  const len = await kv.llen(keys.archiveQueue(jobId));
  return len === 0;
}

// Add posts to job
export async function addPosts(jobId: string, posts: JobPost[]): Promise<void> {
  if (posts.length === 0) return;

  const postsMap: Record<string, string> = {};
  for (const post of posts) {
    postsMap[post.id] = JSON.stringify(post);
  }

  await kv.hset(keys.posts(jobId), postsMap);
}

// Queue posts for subpage fetching
export async function queueSubpages(
  jobId: string,
  postIds: string[]
): Promise<void> {
  if (postIds.length === 0) return;
  await kv.rpush(keys.subpageQueue(jobId), ...postIds);

  // Update subpages total
  const job = await getJob(jobId);
  if (job) {
    await updateJob(jobId, {
      subpagesTotal: job.subpagesTotal + postIds.length,
    });
  }
}

// Get next batch of subpage post IDs
export async function getSubpageBatch(jobId: string): Promise<string[]> {
  const batch: string[] = [];

  for (let i = 0; i < JOB_CONFIG.subpageBatchSize; i++) {
    const postId = await kv.lpop<string>(keys.subpageQueue(jobId));
    if (!postId) break;
    batch.push(postId);
  }

  return batch;
}

// Check if subpage queue is empty
export async function isSubpageQueueEmpty(jobId: string): Promise<boolean> {
  const len = await kv.llen(keys.subpageQueue(jobId));
  return len === 0;
}

// Get a post by ID
export async function getPost(
  jobId: string,
  postId: string
): Promise<JobPost | null> {
  const data = await kv.hget<string>(keys.posts(jobId), postId);
  if (!data) return null;
  return JSON.parse(data);
}

// Update a post
export async function updatePost(
  jobId: string,
  postId: string,
  updates: Partial<JobPost>
): Promise<void> {
  const post = await getPost(jobId, postId);
  if (!post) throw new Error(`Post ${postId} not found in job ${jobId}`);

  const updated = { ...post, ...updates };
  await kv.hset(keys.posts(jobId), { [postId]: JSON.stringify(updated) });
}

// Get all posts for a job
export async function getAllPosts(jobId: string): Promise<JobPost[]> {
  const data = await kv.hgetall<Record<string, string>>(keys.posts(jobId));
  if (!data) return [];

  return Object.values(data).map((v) => JSON.parse(v));
}

// Cleanup job data
export async function cleanupJob(jobId: string): Promise<void> {
  await kv.del(
    keys.job(jobId),
    keys.posts(jobId),
    keys.archiveQueue(jobId),
    keys.subpageQueue(jobId)
  );
}

// Check for stuck job (for recovery)
export async function checkStuckJob(): Promise<{
  isStuck: boolean;
  jobId?: string;
}> {
  const job = await getCurrentJob();
  if (!job) return { isStuck: false };

  const elapsed = Date.now() - new Date(job.updatedAt).getTime();
  const isStuck = elapsed > JOB_CONFIG.jobTimeoutMs;

  return { isStuck, jobId: job.id };
}
