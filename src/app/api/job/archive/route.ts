import { NextResponse } from "next/server";
import { verifyAndParseBody, publishNext, CHAIN_ENDPOINTS } from "@/lib/qstash";
import {
  getJob,
  getArchiveBatch,
  isArchiveQueueEmpty,
  addPosts,
  queueSubpages,
  updateJob,
  transitionJob,
} from "@/lib/job";
import { scrapeArchivePage, deduplicatePosts, ForumPost } from "@/lib/scraper";
import { getSeenPostIds } from "@/lib/storage";
import { sleep, JOB_CONFIG } from "@/lib/config";
import { JobPost } from "@/types/job";
import { ArchiveBatchRequest } from "@/types/job";

// Filter posts to only include those within the last N days
function filterRecentPosts(posts: ForumPost[], maxDays: number): ForumPost[] {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxDays);
  const cutoffStr = cutoffDate.toISOString().split("T")[0]; // YYYY-MM-DD

  return posts.filter((post) => {
    if (!post.date) return false;
    return post.date >= cutoffStr;
  });
}

export async function POST(request: Request) {
  console.log("[ARCHIVE] Received request");

  // Verify QStash signature and parse body
  const { verified, body } = await verifyAndParseBody<ArchiveBatchRequest>(request);
  if (!verified) {
    console.log("[ARCHIVE] Unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId, batchIndex } = body!;
  console.log(`[ARCHIVE] Processing batch ${batchIndex} for job ${jobId}`);

  try {
    // Verify job exists and is in correct state
    const job = await getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.status !== "discovering") {
      return NextResponse.json(
        { error: `Invalid job status: ${job.status}` },
        { status: 400 }
      );
    }

    // Get next batch of archive URLs
    const batch = await getArchiveBatch(jobId);

    if (batch.length === 0) {
      // No more archives - transition to fetching or complete
      const queueEmpty = await isArchiveQueueEmpty(jobId);
      if (queueEmpty) {
        // Check if we have subpages to fetch
        if (job.subpagesTotal > 0) {
          await transitionJob(jobId, "fetching");
          await publishNext(CHAIN_ENDPOINTS.subpage, { jobId, batchIndex: 0 });
        } else {
          // No subpages, go straight to finalize
          await transitionJob(jobId, "finalizing");
          await publishNext(CHAIN_ENDPOINTS.finalize, { jobId });
        }
      }
      return NextResponse.json({ success: true, message: "Queue empty" });
    }

    // Get previously seen post IDs
    const seenIds = await getSeenPostIds();
    const allNewPosts: JobPost[] = [];
    const subpagePostIds: string[] = [];

    // Process each archive URL in batch
    for (let i = 0; i < batch.length; i++) {
      const { name, url } = batch[i];

      // Rate limit between requests (skip first)
      if (i > 0) {
        await sleep(JOB_CONFIG.rateLimitMs);
      }

      try {
        console.log(`[ARCHIVE] Scraping: ${name}`);
        const posts = await scrapeArchivePage(url);
        const uniquePosts = deduplicatePosts(posts);

        // Filter to recent posts only (last N days)
        const recentPosts = filterRecentPosts(uniquePosts, JOB_CONFIG.maxAgeDays);
        console.log(`[ARCHIVE] Found ${recentPosts.length} recent posts for ${name}`);

        // Filter to new posts only
        for (const post of recentPosts) {
          if (seenIds.has(post.id)) continue;

          const jobPost: JobPost = {
            id: post.id,
            title: post.title,
            url: post.url,
            author: post.author,
            date: post.date,
            bytes: post.bytes,
            keyword: name,
            forum: post.forum,
            status: "pending",
          };

          allNewPosts.push(jobPost);

          // Queue for content fetch if has content
          if (post.bytes >= JOB_CONFIG.minBytesForContent) {
            subpagePostIds.push(post.id);
          } else {
            // No content to fetch, mark as skipped
            jobPost.status = "skipped";
          }
        }
      } catch (error) {
        console.error(`Error scraping ${name}:`, error);
        // Continue with other URLs in batch
      }
    }

    // Save discovered posts
    if (allNewPosts.length > 0) {
      await addPosts(jobId, allNewPosts);
    }

    // Queue subpages for content fetching
    if (subpagePostIds.length > 0) {
      await queueSubpages(jobId, subpagePostIds);
    }

    // Update progress
    await updateJob(jobId, {
      archiveUrlsComplete: job.archiveUrlsComplete + batch.length,
      totalNewPosts: job.totalNewPosts + allNewPosts.length,
    });

    // Chain to next batch or transition
    const queueEmpty = await isArchiveQueueEmpty(jobId);
    if (queueEmpty) {
      // Check updated job for subpage count
      const updatedJob = await getJob(jobId);
      if (updatedJob && updatedJob.subpagesTotal > 0) {
        await transitionJob(jobId, "fetching");
        await publishNext(CHAIN_ENDPOINTS.subpage, { jobId, batchIndex: 0 });
      } else {
        // No subpages, go to finalize
        await transitionJob(jobId, "finalizing");
        await publishNext(CHAIN_ENDPOINTS.finalize, { jobId });
      }
    } else {
      // More archives to process
      await publishNext(CHAIN_ENDPOINTS.archive, { jobId, batchIndex: batchIndex + 1 });
    }

    return NextResponse.json({
      success: true,
      batchIndex,
      processed: batch.length,
      newPosts: allNewPosts.length,
      queuedSubpages: subpagePostIds.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Archive batch error:", message);

    // Mark job as failed
    await transitionJob(jobId, "failed", { error: message });

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
