// Tracking configuration

export const TRACKING_URLS = [
  {
    name: "牛经沧海",
    url: "https://bbs.wenxuecity.com/bbs/archive.php?SubID=cfzh&keyword=%E7%89%9B%E7%BB%8F%E6%B2%A7%E6%B5%B7&username=on",
  },
  {
    name: "长须老榕",
    url: "https://bbs.wenxuecity.com/bbs/archive.php?SubID=finance&keyword=%E9%95%BF%E9%A1%BB%E8%80%81%E6%A6%95&username=on",
  },
  {
    name: "捣乱者",
    url: "https://bbs.wenxuecity.com/bbs/archive.php?SubID=finance&pos=bbs&keyword=%E6%8D%A3%E4%B9%B1%E8%80%85&username=on",
  },
  {
    name: "方圆9888",
    url: "https://bbs.wenxuecity.com/bbs/archive.php?keyword=%E6%96%B9%E5%9C%869888&username=on&submit1=%E6%9F%A5%E8%AF%A2&act=index&SubID=finance&year=current",
  },
  {
    name: "低手只会用均线",
    url: "https://bbs.wenxuecity.com/bbs/archive.php?SubID=cfzh&keyword=%E4%BD%8E%E6%89%8B%E5%8F%AA%E4%BC%9A%E7%94%A8%E5%9D%87%E7%BA%BF&username=on",
  },
  {
    name: "ybdddnlyglny",
    url: "https://bbs.wenxuecity.com/bbs/archive.php?keyword=ybdddnlyglny&username=on&submit1=%E6%9F%A5%E8%AF%A2&act=index&SubID=cfzh&year=current",
  },
];

// Rate limiting - delay between requests in milliseconds
export const RATE_LIMIT_MS = 3000;

// Job processing configuration
export const JOB_CONFIG = {
  // Batch sizes (larger to reduce chain calls and avoid 508 loop detection)
  archiveBatchSize: 3, // Archive URLs per batch invocation
  subpageBatchSize: 5, // Subpage URLs per batch invocation

  // Timing
  rateLimitMs: RATE_LIMIT_MS, // Between requests within a batch
  jobTimeoutMs: 30 * 60 * 1000, // 30 min max job duration (for stuck detection)

  // Content fetching
  minBytesForContent: 1, // Fetch content if bytes >= this (0 = skip empty posts)

  // Date filtering
  maxAgeDays: 7, // Only include posts from the last N days
};

// Email configuration
// NOTIFICATION_EMAIL can be comma-separated for multiple recipients
// e.g., "user1@example.com,user2@example.com"
// EMAIL_FROM: Use your verified domain, or "onboarding@resend.dev" for testing
export const EMAIL_CONFIG = {
  from: process.env.EMAIL_FROM || "Webpage Tracker <onboarding@resend.dev>",
  to: (process.env.NOTIFICATION_EMAIL || "")
    .split(",")
    .map((e) => e.trim())
    .filter((e) => e.length > 0),
  subject: process.env.EMAIL_SUBJECT || "文学城论坛更新",
};

// Helper to get tracking URLs (for backward compatibility)
export function getTrackingUrls(): { keyword: string; url: string }[] {
  return TRACKING_URLS.map(({ name, url }) => ({
    keyword: name,
    url,
  }));
}

// Sleep utility for rate limiting
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
