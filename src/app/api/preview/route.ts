import { NextResponse } from "next/server";
import { getCurrentJob, getJob, getAllPosts } from "@/lib/job";
import { JobPost } from "@/types/job";

// Build email HTML from job posts
function buildEmailHtml(
  postsByKeyword: Map<string, JobPost[]>,
  jobId: string | null,
  jobStatus: string | null
): string {
  let totalPosts = 0;
  let htmlContent = "";

  for (const [keyword, posts] of postsByKeyword) {
    if (posts.length === 0) continue;
    totalPosts += posts.length;

    // Sort by scrapeOrder - Redis hash doesn't preserve insertion order
    const sortedPosts = [...posts].sort((a, b) => {
      return (a.scrapeOrder ?? 999) - (b.scrapeOrder ?? 999);
    });

    const postList = sortedPosts
      .map((post) => {
        // Format content preview (first 500 chars, preserve some formatting)
        let contentHtml = "";
        if (post.content) {
          const preview = post.content.substring(0, 800);
          contentHtml = `
            <div style="margin: 8px 0 16px 20px; padding: 10px; background: #f8f9fa; border-left: 3px solid #dee2e6; font-size: 14px; line-height: 1.6; white-space: pre-wrap; color: #333;">
              ${escapeHtml(preview)}${post.content.length > 800 ? "..." : ""}
            </div>`;
        } else if (post.fetchError) {
          contentHtml = `
            <div style="margin: 8px 0 16px 20px; color: #dc3545; font-size: 12px;">
              ⚠️ Error: ${escapeHtml(post.fetchError)}
            </div>`;
        } else if (post.status === "pending") {
          contentHtml = `
            <div style="margin: 8px 0 16px 20px; color: #6c757d; font-size: 12px;">
              ⏳ Content pending...
            </div>`;
        }

        return `
          <div style="margin-bottom: 4px;">
            <strong>•</strong>
            <a href="${post.url}" style="color: #0066cc; text-decoration: none;">
              ${escapeHtml(post.title || "(no title)")}
            </a>
            <span style="color: #666;"> [${escapeHtml(post.forum || post.keyword)}]</span>
            <span style="color: #999; font-size: 12px;"> (${post.date})</span>
          </div>
          ${contentHtml}`;
      })
      .join("");

    htmlContent += `
      <h3 style="margin-top: 24px; border-bottom: 1px solid #eee; padding-bottom: 8px;">
        ${escapeHtml(keyword)} (${posts.length} new)
      </h3>
      <div style="margin-left: 8px;">${postList}</div>
    `;
  }

  const statusBadge = jobStatus
    ? `<span style="background: ${getStatusColor(jobStatus)}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${jobStatus}</span>`
    : "";

  if (totalPosts === 0) {
    return `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family: sans-serif; padding: 20px;">
          <h2>No Posts Found ${statusBadge}</h2>
          <p>${jobId ? `Job: ${jobId}` : "No job has run yet. Trigger /api/cron first."}</p>
          <p style="color: #666;">Checked at ${new Date().toISOString()}</p>
        </body>
      </html>
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: sans-serif; padding: 20px;">
        <h2>Daily Digest: ${totalPosts} New Posts ${statusBadge}</h2>
        <p style="color: #666; font-size: 12px;">Job: ${jobId}</p>
        ${htmlContent}
        <hr>
        <p style="color: #666; font-size: 12px;">
          Preview generated at ${new Date().toISOString()}
        </p>
      </body>
    </html>
  `;
}

function getStatusColor(status: string): string {
  switch (status) {
    case "complete":
      return "#28a745";
    case "failed":
      return "#dc3545";
    case "discovering":
    case "fetching":
      return "#007bff";
    case "finalizing":
      return "#17a2b8";
    default:
      return "#6c757d";
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jobIdParam = url.searchParams.get("jobId");

  try {
    // Get specific job or current job
    const job = jobIdParam ? await getJob(jobIdParam) : await getCurrentJob();

    if (!job) {
      const html = buildEmailHtml(new Map(), null, null);
      return new NextResponse(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Get all posts from job
    const posts = await getAllPosts(job.id);

    // Group by keyword
    const postsByKeyword = new Map<string, JobPost[]>();
    for (const post of posts) {
      const existing = postsByKeyword.get(post.keyword) || [];
      existing.push(post);
      postsByKeyword.set(post.keyword, existing);
    }

    const html = buildEmailHtml(postsByKeyword, job.id, job.status);

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
