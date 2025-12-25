import { NextResponse } from "next/server";
import { createJob, getCurrentJob, checkStuckJob, transitionJob } from "@/lib/job";
import { chainNext, CHAIN_ENDPOINTS } from "@/lib/chain";

// Verify cron secret for security
function verifyCronSecret(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // If no secret configured, allow (for local testing)
  if (!cronSecret) return true;

  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  console.log("[CRON] Starting cron job...");

  // Verify the request is from Vercel Cron
  if (!verifyCronSecret(request)) {
    console.log("[CRON] Unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const forceNew = url.searchParams.get("force") === "true";

  try {
    // Check for existing job (skip if force=true)
    const existingJob = forceNew ? null : await getCurrentJob();
    console.log("[CRON] Existing job:", existingJob?.id || "none", "force:", forceNew);

    if (existingJob) {
      // Check if it's stuck
      const { isStuck } = await checkStuckJob();

      if (isStuck) {
        // Mark stuck job as failed and create new one
        await transitionJob(existingJob.id, "failed", {
          error: "Job timed out - marked as stuck",
        });
      } else {
        // Job is still running, don't create a new one
        return NextResponse.json({
          success: true,
          message: "Job already in progress",
          jobId: existingJob.id,
          status: existingJob.status,
        });
      }
    }

    // Create new job
    const job = await createJob();
    console.log("[CRON] Created job:", job.id);

    // Chain to first archive batch
    console.log("[CRON] Chaining to archive...");
    await chainNext(CHAIN_ENDPOINTS.archive, { jobId: job.id, batchIndex: 0 });
    console.log("[CRON] Chain complete");

    return NextResponse.json({
      success: true,
      message: "Job started",
      jobId: job.id,
      archiveUrls: job.archiveUrlsTotal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Cron error:", message);

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
