import { Resend } from "resend";
import { ForumPost } from "./scraper";
import { JobPost } from "@/types/job";
import { EMAIL_CONFIG } from "./config";

// Lazy initialization to avoid build-time errors
function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

export interface EmailResult {
  success: boolean;
  error?: string;
}

export async function sendNewItemsEmail(
  newPosts: ForumPost[],
  keyword: string
): Promise<EmailResult> {
  if (!process.env.RESEND_API_KEY) {
    console.log("RESEND_API_KEY not configured, skipping email");
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  if (!EMAIL_CONFIG.to) {
    console.log("NOTIFICATION_EMAIL not configured, skipping email");
    return { success: false, error: "NOTIFICATION_EMAIL not configured" };
  }

  const postList = newPosts
    .map(
      (post) =>
        `- <a href="${post.url}">${post.title}</a> (${post.date}, ${post.bytes} bytes)`
    )
    .join("<br>");

  const html = `
    <h2>New Posts Found for "${keyword}"</h2>
    <p>Found ${newPosts.length} new post(s):</p>
    <div style="font-family: sans-serif; line-height: 1.6;">
      ${postList}
    </div>
    <hr>
    <p style="color: #666; font-size: 12px;">
      Sent by Webpage Tracker at ${new Date().toISOString()}
    </p>
  `;

  try {
    const resend = getResendClient();
    if (!resend) {
      return { success: false, error: "Resend client not initialized" };
    }

    const { error } = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: EMAIL_CONFIG.to,
      subject: `${EMAIL_CONFIG.subject} - ${keyword}`,
      html,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

export async function sendAggregatedEmail(
  postsByKeyword: Map<string, ForumPost[]>
): Promise<EmailResult> {
  if (!process.env.RESEND_API_KEY || !EMAIL_CONFIG.to) {
    return { success: false, error: "Email not configured" };
  }

  let totalPosts = 0;
  let htmlContent = "";

  for (const [keyword, posts] of postsByKeyword) {
    if (posts.length === 0) continue;
    totalPosts += posts.length;

    const postList = posts
      .map(
        (post) =>
          `<li><a href="${post.url}">${post.title}</a> - ${post.author} (${post.date})</li>`
      )
      .join("");

    htmlContent += `
      <h3>${keyword} (${posts.length} new)</h3>
      <ul>${postList}</ul>
    `;
  }

  if (totalPosts === 0) {
    return { success: true }; // No email needed
  }

  const html = `
    <h2>Daily Digest: ${totalPosts} New Posts Found</h2>
    ${htmlContent}
    <hr>
    <p style="color: #666; font-size: 12px;">
      Sent by Webpage Tracker at ${new Date().toISOString()}
    </p>
  `;

  try {
    const resend = getResendClient();
    if (!resend) {
      return { success: false, error: "Resend client not initialized" };
    }

    const { error } = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: EMAIL_CONFIG.to,
      subject: `Daily Digest: ${totalPosts} New Posts Found`,
      html,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Send email digest with full post content.
 * Used by the new job-based architecture.
 */
export async function sendDigestWithContent(
  postsByKeyword: Map<string, JobPost[]>
): Promise<EmailResult> {
  if (!process.env.RESEND_API_KEY || !EMAIL_CONFIG.to) {
    console.log("Email not configured, skipping");
    return { success: false, error: "Email not configured" };
  }

  let totalPosts = 0;
  let htmlContent = "";

  for (const [keyword, posts] of postsByKeyword) {
    if (posts.length === 0) continue;
    totalPosts += posts.length;

    htmlContent += `<h3 style="margin-top: 24px; color: #333;">${keyword} (${posts.length} new)</h3>`;

    for (const post of posts) {
      const contentHtml = post.content
        ? `<div style="background: #f9f9f9; padding: 12px; margin: 8px 0; border-left: 3px solid #ddd; white-space: pre-wrap;">${escapeHtml(post.content.substring(0, 2000))}${post.content.length > 2000 ? "..." : ""}</div>`
        : post.fetchError
          ? `<p style="color: #999; font-style: italic;">Failed to fetch: ${escapeHtml(post.fetchError)}</p>`
          : `<p style="color: #999; font-style: italic;">(No content)</p>`;

      htmlContent += `
        <div style="margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #eee;">
          <h4 style="margin: 0 0 8px 0;">
            <a href="${post.url}" style="color: #0066cc; text-decoration: none;">${escapeHtml(post.title)}</a>
          </h4>
          <p style="color: #666; font-size: 12px; margin: 0 0 8px 0;">
            ${escapeHtml(post.author)} - ${post.date} - ${post.bytes} bytes
          </p>
          ${contentHtml}
        </div>
      `;
    }
  }

  if (totalPosts === 0) {
    return { success: true }; // No email needed
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333; border-bottom: 2px solid #0066cc; padding-bottom: 8px;">
          Daily Digest: ${totalPosts} New Posts Found
        </h2>
        ${htmlContent}
        <hr style="margin-top: 32px; border: none; border-top: 1px solid #eee;">
        <p style="color: #999; font-size: 11px; text-align: center;">
          Sent by Webpage Tracker at ${new Date().toISOString()}
        </p>
      </body>
    </html>
  `;

  try {
    const resend = getResendClient();
    if (!resend) {
      return { success: false, error: "Resend client not initialized" };
    }

    const { error } = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: EMAIL_CONFIG.to,
      subject: `Daily Digest: ${totalPosts} New Posts`,
      html,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

// Escape HTML special characters
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
