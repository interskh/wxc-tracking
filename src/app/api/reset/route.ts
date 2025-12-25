import { NextResponse } from "next/server";
import { kv } from "@/lib/kv";

export async function POST() {
  try {
    // Clear current job reference
    await kv.del("current_job");

    // Find and delete all job-related keys
    const jobKeys = await kv.keys("job:*");
    if (jobKeys.length > 0) {
      await kv.del(...jobKeys);
    }

    return NextResponse.json({
      success: true,
      message: "All job state cleared",
      deletedKeys: jobKeys.length + 1,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// Also support GET for easy browser testing
export async function GET() {
  return POST();
}
