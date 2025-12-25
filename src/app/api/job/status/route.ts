import { NextResponse } from "next/server";
import { getJob, getCurrentJob, getAllPosts } from "@/lib/job";
import { kv } from "@/lib/kv";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");

  try {
    // Get specific job or current job
    const job = jobId ? await getJob(jobId) : await getCurrentJob();

    if (!job) {
      return NextResponse.json({
        success: true,
        job: null,
        message: jobId ? "Job not found" : "No active job",
      });
    }

    // Get posts if requested
    const includePosts = url.searchParams.get("posts") === "true";
    const posts = includePosts ? await getAllPosts(job.id) : undefined;

    // Get queue lengths
    const [archiveQueueLen, subpageQueueLen] = await Promise.all([
      kv.llen(`job:${job.id}:archive_queue`).catch(() => 0),
      kv.llen(`job:${job.id}:subpage_queue`).catch(() => 0),
    ]);

    return NextResponse.json({
      success: true,
      job: {
        ...job,
        pendingArchives: archiveQueueLen,
        pendingSubpages: subpageQueueLen,
      },
      posts: posts?.length,
      postsData: includePosts ? posts : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
