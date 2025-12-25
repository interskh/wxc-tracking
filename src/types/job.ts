// Job state machine types

export type JobStatus =
  | "idle"
  | "discovering"
  | "fetching"
  | "finalizing"
  | "complete"
  | "failed";

export interface Job {
  id: string;
  status: JobStatus;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;

  // Progress tracking
  archiveUrlsTotal: number;
  archiveUrlsComplete: number;
  subpagesTotal: number;
  subpagesComplete: number;

  // Results
  totalNewPosts: number;
  emailSent: boolean;
}

export interface JobPost {
  id: string;
  title: string;
  url: string;
  author: string;
  date: string;
  bytes: number;
  keyword: string; // Which tracking URL found this
  forum: string; // Forum name from the post (e.g., "财富智汇")
  status: "pending" | "fetched" | "skipped";
  content?: string; // Full content after subpage fetch
  fetchError?: string;
}

export interface ArchiveBatchRequest {
  jobId: string;
  batchIndex: number;
}

export interface SubpageBatchRequest {
  jobId: string;
  batchIndex: number;
}

export interface FinalizeRequest {
  jobId: string;
}

export interface JobStatusResponse {
  job: Job | null;
  posts?: JobPost[];
  pendingSubpages?: number;
}
