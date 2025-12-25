import { NextResponse } from "next/server";
import { kv } from "@/lib/kv";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const full = url.searchParams.get("full") === "true";

  try {
    // Clear current job reference
    await kv.del("current_job", "last_job");

    // Find and delete all job-related keys
    const jobKeys = await kv.keys("job:*");
    if (jobKeys.length > 0) {
      await kv.del(...jobKeys);
    }

    let seenDeleted = 0;
    // If full reset, also clear seen posts
    if (full) {
      await kv.del("seen_posts", "last_check");
      seenDeleted = 1;
    }

    return NextResponse.json({
      success: true,
      message: full ? "Full reset complete (including seen posts)" : "Job state cleared",
      deletedJobKeys: jobKeys.length + 2,
      seenPostsCleared: full,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
