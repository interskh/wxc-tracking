# Webpage Tracker

A serverless web tracker that monitors wenxuecity forum posts and sends daily email digests with full post content. Built for Vercel with multi-phase job chaining to work within serverless timeout limits.

## Features

- Tracks multiple keywords on wenxuecity.com forums
- Fetches full post content (not just titles)
- Filters to posts from last 7 days only
- Deduplicates posts across runs
- Sends aggregated email digests via Resend
- Multi-phase job architecture for serverless compatibility
- Preview endpoint to see results before email

## Architecture

```
VERCEL CRON (daily)
        |
        v
+------------------+
| /api/cron        |  <- Initialize job, queue archives
+------------------+
        |
        v (chain via fetch)
+------------------+
| /api/job/archive |  <- Batch scrape archive pages
| (multiple calls) |     Parse posts, queue subpages
+------------------+
        |
        v
+------------------+
| /api/job/subpage |  <- Fetch full post content
| (multiple calls) |     Rate-limited requests
+------------------+
        |
        v
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
| `/api/reset` | GET | Clear all job state |

## Setup

### 1. Deploy to Vercel

```bash
npm i -g vercel
vercel
```

### 2. Configure Vercel KV

1. Go to Vercel dashboard → **Storage** → **Create Database** → **KV**
2. Connect to your project (auto-sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`)

### 3. Configure Resend

1. Create account at [resend.com](https://resend.com)
2. Get API key and verify your domain
3. Set `RESEND_API_KEY` in Vercel

### 4. Environment Variables

Set in Vercel dashboard → Settings → Environment Variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `KV_REST_API_URL` | Yes | Auto-set by Vercel KV |
| `KV_REST_API_TOKEN` | Yes | Auto-set by Vercel KV |
| `RESEND_API_KEY` | Yes | Resend API key |
| `NOTIFICATION_EMAIL` | Yes | Email to receive digests |
| `CRON_SECRET` | Yes | Secret for cron endpoint |
| `CHAIN_SECRET` | Yes | Secret for internal job chaining |

Generate secrets:
```bash
openssl rand -hex 32
```

### 5. Configure Keywords

Edit `src/lib/config.ts`:

```typescript
export const TRACKING_URLS = [
  { name: "牛经沧海", url: "https://bbs.wenxuecity.com/archive/..." },
  // Add more keywords (max 6 recommended)
];
```

## Local Development

```bash
npm install
npm run dev   # Runs on port 3021
```

Test endpoints:
```bash
curl http://localhost:3021/api/cron
curl http://localhost:3021/api/preview
curl http://localhost:3021/api/job/status
```

Local dev uses an in-memory KV mock, so no Vercel KV credentials needed.

## Configuration

Key settings in `src/lib/config.ts`:

```typescript
export const JOB_CONFIG = {
  archiveBatchSize: 2,    // Archive URLs per batch
  subpageBatchSize: 2,    // Subpages per batch
  rateLimitMs: 3000,      // Delay between requests
  maxAgeDays: 7,          // Only include recent posts
  minBytesForContent: 1,  // Minimum bytes to fetch content
};
```

## Cron Schedule

Runs daily at 8:00 AM UTC. Modify in `vercel.json`:

```json
{
  "crons": [{
    "path": "/api/cron",
    "schedule": "0 8 * * *"
  }]
}
```

## Vercel Hobby Plan Limits

- 2 cron jobs per account
- 10 second function timeout (handled via job chaining)
- Daily cron execution

## Cost

Runs on free tiers:
- Vercel Hobby: Free
- Vercel KV: 3,000 requests/month free
- Resend: 100 emails/month free
