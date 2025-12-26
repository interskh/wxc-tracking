# Webpage Tracker

A serverless web tracker that monitors wenxuecity forum posts and sends daily email digests with full post content. Built for Vercel with Upstash QStash for reliable job chaining within serverless timeout limits.

## Features

- Tracks multiple keywords on wenxuecity.com forums and blogs
- Fetches full post content (not just titles)
- Filters to posts from last 3 days only
- Deduplicates posts across runs
- Sends aggregated email digests via Resend
- Multi-phase job architecture with QStash for serverless compatibility
- Preview endpoint to see results before email
- Supports multiple email recipients

## Architecture

```
VERCEL CRON (6am PST / 14:00 UTC daily)
        |
        v
+------------------+
| /api/cron        |  <- Initialize job, queue archives
+------------------+
        |
        v (via QStash)
+------------------+
| /api/job/archive |  <- Batch scrape archive pages
| (multiple calls) |     Parse posts, queue subpages
+------------------+
        |
        v (via QStash)
+------------------+
| /api/job/subpage |  <- Fetch full post content
| (multiple calls) |     Rate-limited requests
+------------------+
        |
        v (via QStash)
+------------------+
| /api/job/finalize|  <- Send email, mark posts seen
+------------------+
```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/cron` | GET | Trigger job (add `?force=true` to force new) |
| `/api/preview` | GET | Preview digest HTML |
| `/api/job/status` | GET | Check job status |
| `/api/reset` | GET | Clear job state (add `?full=true` to also clear seen posts) |

## Setup

### 1. Deploy to Vercel

```bash
npm i -g vercel
vercel
```

### 2. Add Upstash Redis

1. Go to [Upstash Console](https://console.upstash.com) → Create Database
2. Copy the REST URL and token
3. Add to Vercel environment variables:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

### 3. Add Upstash QStash

1. Go to [Upstash Console](https://console.upstash.com) → QStash
2. Copy the token and signing keys
3. Add to Vercel environment variables:
   - `QSTASH_TOKEN`
   - `QSTASH_CURRENT_SIGNING_KEY`
   - `QSTASH_NEXT_SIGNING_KEY`

### 4. Configure Resend

1. Create account at [resend.com](https://resend.com)
2. Get API key and verify your domain
3. Set `RESEND_API_KEY` in Vercel

### 5. Environment Variables

Set in Vercel dashboard → Settings → Environment Variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `UPSTASH_REDIS_REST_URL` | Yes | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Upstash Redis REST token |
| `QSTASH_TOKEN` | Yes | QStash token for job publishing |
| `QSTASH_CURRENT_SIGNING_KEY` | Yes | QStash signature verification |
| `QSTASH_NEXT_SIGNING_KEY` | Yes | QStash signature verification (rotation) |
| `RESEND_API_KEY` | Yes | Resend API key |
| `NOTIFICATION_EMAIL` | Yes | Email(s) to receive digests (comma-separated) |
| `EMAIL_SUBJECT` | No | Custom email subject (default: 文学城论坛更新) |
| `CRON_SECRET` | Yes | Secret for cron endpoint |

Generate secrets:
```bash
openssl rand -hex 32
```

### 6. Configure Tracking Sources

Edit `src/lib/config.ts`:

```typescript
const PRODUCTION_URLS = [
  // Forum archives
  { name: "牛经沧海", url: "https://bbs.wenxuecity.com/bbs/archive.php?..." },
  // Blog pages (add type: "blog")
  { name: "亮线留痕", url: "https://blog.wenxuecity.com/myblog/82458/all.html", type: "blog" },
];
```

## Local Development

```bash
npm install
cp .env.example .env  # Add your CRON_SECRET
npm run dev           # Runs on port 3021
```

Local dev uses a shorter `DEV_URLS` config (2 sources) for faster testing. The full `PRODUCTION_URLS` (10 sources) runs in production.

Test endpoints:
```bash
# Trigger job (requires auth)
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  "http://localhost:3021/api/cron?force=true"

# Check results (no auth)
curl http://localhost:3021/api/preview
curl http://localhost:3021/api/job/status
curl http://localhost:3021/api/reset
curl "http://localhost:3021/api/reset?full=true"  # Full reset including seen posts
```

Local dev uses Upstash for state, so you need Redis credentials in `.env`.

## Production Usage

Replace `YOUR_DOMAIN` with your Vercel deployment URL (e.g., `wxc-tracking.vercel.app`) and `YOUR_CRON_SECRET` with your `CRON_SECRET` environment variable value.

### Trigger a job manually
```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://YOUR_DOMAIN/api/cron
```

### Force start a new job (even if one is running)
```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  "https://YOUR_DOMAIN/api/cron?force=true"
```

### Check job status (no auth required)
```bash
curl https://YOUR_DOMAIN/api/job/status
```

### Preview digest HTML (no auth required)
```bash
curl https://YOUR_DOMAIN/api/preview
```

### Reset job state (no auth required)
```bash
curl https://YOUR_DOMAIN/api/reset

# Full reset including seen posts history
curl "https://YOUR_DOMAIN/api/reset?full=true"
```

## Configuration

Key settings in `src/lib/config.ts`:

```typescript
export const JOB_CONFIG = {
  archiveBatchSize: 3,    // Archive URLs per batch
  subpageBatchSize: 5,    // Subpages per batch
  rateLimitMs: 3000,      // Delay between requests (3s)
  maxAgeDays: 3,          // Only include recent posts
  minBytesForContent: 1,  // Minimum bytes to fetch content (0 = skip empty)
};

export const EMAIL_CONFIG = {
  from: "Webpage Tracker <tracker@yourdomain.com>",
  to: ["user1@example.com", "user2@example.com"],  // From NOTIFICATION_EMAIL
  subject: "文学城论坛更新",  // From EMAIL_SUBJECT
};
```

## Cron Schedule

Runs daily at 6:00 AM PST (14:00 UTC). Modify in `vercel.json`:

```json
{
  "crons": [{
    "path": "/api/cron",
    "schedule": "0 14 * * *"
  }]
}
```

## Cost

Runs on free tiers:
- **Vercel Hobby**: Free (Pro recommended for 60s timeout)
- **Upstash Redis**: 10,000 commands/day free
- **Upstash QStash**: 1,000 messages/day free
- **Resend**: 100 emails/month free

## Why QStash?

Previous versions used self-triggering `fetch()` calls for job chaining, which caused Vercel's 508 "Loop Detected" error. QStash provides:

- Reliable message delivery with automatic retries
- Signature verification for security
- No loop detection issues
- Built-in delay and scheduling
- Same Upstash account as Redis
