import { NextResponse } from "next/server";
import { verifyAndParseBody, publishNext, CHAIN_ENDPOINTS } from "@/lib/qstash";
import {
  getJob,
  getSubpageBatch,
  isSubpageQueueEmpty,
  getPost,
  updatePost,
  updateJob,
  transitionJob,
} from "@/lib/job";
import { scrapeSubpageContent } from "@/lib/scraper";
import { sleep, JOB_CONFIG } from "@/lib/config";
import { SubpageBatchRequest } from "@/types/job";

export async function POST(request: Request) {
  console.log("[SUBPAGE] Received request");

  // Verify QStash signature and parse body
  const { verified, body } = await verifyAndParseBody<SubpageBatchRequest>(request);
  if (!verified) {
    console.log("[SUBPAGE] Unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId, batchIndex } = body!;
  console.log(`[SUBPAGE] Processing batch ${batchIndex} for job ${jobId}`);

  try {
    // Verify job exists and is in correct state
    const job = await getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.status !== "fetching") {
      return NextResponse.json(
        { error: `Invalid job status: ${job.status}` },
        { status: 400 }
      );
    }

    // Get next batch of post IDs to fetch
    const postIds = await getSubpageBatch(jobId);

    if (postIds.length === 0) {
      // No more subpages - transition to finalize
      const queueEmpty = await isSubpageQueueEmpty(jobId);
      if (queueEmpty) {
        await transitionJob(jobId, "finalizing");
        await publishNext(CHAIN_ENDPOINTS.finalize, { jobId });
      }
      return NextResponse.json({ success: true, message: "Queue empty" });
    }

    let fetchedCount = 0;
    let skippedCount = 0;

    // Process each post in batch
    for (let i = 0; i < postIds.length; i++) {
      const postId = postIds[i];

      // Rate limit between requests (skip first)
      if (i > 0) {
        await sleep(JOB_CONFIG.rateLimitMs);
      }

      const post = await getPost(jobId, postId);
      if (!post) {
        console.error(`Post ${postId} not found in job ${jobId}`);
        continue;
      }

      try {
        console.log(`[SUBPAGE] Fetching: ${post.title?.substring(0, 30)}...`);
        const content = await scrapeSubpageContent(post.url);
        await updatePost(jobId, postId, {
          status: "fetched",
          content,
        });
        fetchedCount++;
        console.log(`[SUBPAGE] Fetched ${content.length} chars`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error(`Error fetching ${post.url}:`, message);

        await updatePost(jobId, postId, {
          status: "skipped",
          fetchError: message,
        });
        skippedCount++;
      }
    }

    // Update progress
    await updateJob(jobId, {
      subpagesComplete: job.subpagesComplete + postIds.length,
    });

    // Chain to next batch or transition to finalize
    const queueEmpty = await isSubpageQueueEmpty(jobId);
    if (queueEmpty) {
      await transitionJob(jobId, "finalizing");
      await publishNext(CHAIN_ENDPOINTS.finalize, { jobId });
    } else {
      await publishNext(CHAIN_ENDPOINTS.subpage, { jobId, batchIndex: batchIndex + 1 });
    }

    return NextResponse.json({
      success: true,
      batchIndex,
      processed: postIds.length,
      fetched: fetchedCount,
      skipped: skippedCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Subpage batch error:", message);

    // Mark job as failed
    await transitionJob(jobId, "failed", { error: message });

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
