import { NextResponse } from "next/server";
import { getJob, getCurrentJob, getAllPosts } from "@/lib/job";
import { getCheckInfo, getSeenPostIds } from "@/lib/storage";
import { kv } from "@/lib/kv";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");

  try {
    // Get specific job or current job
    const job = jobId ? await getJob(jobId) : await getCurrentJob();

    if (!job) {
      // Still show storage info even if no job
      const checkInfo = await getCheckInfo();
      const showSeenSample = url.searchParams.get("debug") === "true";
      let seenSample: string[] | undefined;
      if (showSeenSample) {
        const seenIds = await getSeenPostIds();
        seenSample = Array.from(seenIds).slice(0, 20);
      }

      return NextResponse.json({
        success: true,
        job: null,
        message: jobId ? "Job not found" : "No active job",
        storage: {
          lastCheck: checkInfo.lastCheck,
          seenPostsCount: checkInfo.seenCount,
          seenSample: showSeenSample ? seenSample : undefined,
        },
      });
    }

    // Get posts if requested
    const includePosts = url.searchParams.get("posts") === "true";
    const posts = includePosts ? await getAllPosts(job.id) : undefined;

    // Get queue lengths and seen posts info
    const [archiveQueueLen, subpageQueueLen, checkInfo] = await Promise.all([
      kv.llen(`job:${job.id}:archive_queue`).catch(() => 0),
      kv.llen(`job:${job.id}:subpage_queue`).catch(() => 0),
      getCheckInfo(),
    ]);

    // If debug mode, also get sample of seen post IDs
    const showSeenSample = url.searchParams.get("debug") === "true";
    let seenSample: string[] | undefined;
    if (showSeenSample) {
      const seenIds = await getSeenPostIds();
      seenSample = Array.from(seenIds).slice(0, 20); // First 20 IDs
    }

    return NextResponse.json({
      success: true,
      job: {
        ...job,
        pendingArchives: archiveQueueLen,
        pendingSubpages: subpageQueueLen,
      },
      posts: posts?.length,
      postsData: includePosts ? posts : undefined,
      storage: {
        lastCheck: checkInfo.lastCheck,
        seenPostsCount: checkInfo.seenCount,
        seenSample: showSeenSample ? seenSample : undefined,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
