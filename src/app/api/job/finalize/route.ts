import { NextResponse } from "next/server";
import { verifyAndParseBody } from "@/lib/qstash";
import { getJob, getAllPosts, transitionJob } from "@/lib/job";
import { markPostsAsSeen, updateLastCheck } from "@/lib/storage";
import { sendDigestWithContent } from "@/lib/email";
import { FinalizeRequest, JobPost } from "@/types/job";

export async function POST(request: Request) {
  console.log("[FINALIZE] Received request");

  // Verify QStash signature and parse body
  const { verified, body } = await verifyAndParseBody<FinalizeRequest>(request);
  if (!verified) {
    console.log("[FINALIZE] Unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = body!;
  console.log(`[FINALIZE] Processing job ${jobId}`);

  try {
    // Verify job exists and is in correct state
    const job = await getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.status !== "finalizing") {
      return NextResponse.json(
        { error: `Invalid job status: ${job.status}` },
        { status: 400 }
      );
    }

    // Get all posts
    const posts = await getAllPosts(jobId);
    console.log(`[FINALIZE] Found ${posts.length} posts to process`);

    if (posts.length === 0) {
      // No new posts, just complete
      await transitionJob(jobId, "complete", { emailSent: false });
      await updateLastCheck();

      return NextResponse.json({
        success: true,
        message: "No new posts to send",
      });
    }

    // Group posts by keyword
    const postsByKeyword = new Map<string, JobPost[]>();
    for (const post of posts) {
      const existing = postsByKeyword.get(post.keyword) || [];
      existing.push(post);
      postsByKeyword.set(post.keyword, existing);
    }

    // Send email with content
    const emailResult = await sendDigestWithContent(postsByKeyword);

    // Mark all posts as seen
    const postIds = posts.map((p) => p.id);
    await markPostsAsSeen(postIds);

    // Update last check timestamp
    await updateLastCheck();

    // Mark job as complete
    await transitionJob(jobId, "complete", {
      emailSent: emailResult.success,
      error: emailResult.error,
    });

    // Cleanup job data (optional - keep for debugging)
    // await cleanupJob(jobId);

    return NextResponse.json({
      success: true,
      totalPosts: posts.length,
      emailSent: emailResult.success,
      emailError: emailResult.error,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Finalize error:", message);

    // Mark job as failed
    await transitionJob(jobId, "failed", { error: message });

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
