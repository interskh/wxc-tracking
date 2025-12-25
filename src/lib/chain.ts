// Self-triggering job chaining via fetch()
// No external dependencies - uses fire-and-forget pattern

function getBaseUrl(): string {
  // Check for explicit base URL first
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL;
  }

  // Vercel provides VERCEL_URL in production (without protocol)
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // Vercel also provides VERCEL_PROJECT_PRODUCTION_URL for production deployments
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  // Local development
  return "http://localhost:3021";
}

interface ChainOptions {
  delay?: number; // Delay in ms before triggering (not used in fetch, but for future)
}

/**
 * Chain to the next job phase via fetch.
 * We await the fetch to ensure it's sent, but don't wait for completion.
 * KV state is the source of truth - if the chain fails, stuck job detection
 * will retry on the next cron.
 */
export async function chainNext(
  endpoint: string,
  body: object,
  _options?: ChainOptions
): Promise<void> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${endpoint}`;

  console.log(`[CHAIN] Base URL: ${baseUrl}`);
  console.log(`[CHAIN] Full URL: ${url}`);

  try {
    // Use a short timeout - we just want to ensure the request is sent
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-chain-secret": process.env.CHAIN_SECRET || "",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`Chain to ${endpoint} returned ${response.status}`);
    } else {
      console.log(`Chain to ${endpoint} triggered successfully`);
    }
  } catch (error) {
    // Log but don't throw - KV state is truth, stuck detection will recover
    if (error instanceof Error && error.name === "AbortError") {
      console.log(`Chain to ${endpoint} sent (timed out waiting for response)`);
    } else {
      console.error(`Chain to ${endpoint} failed:`, error);
    }
  }
}

/**
 * Verify that a request is from an internal chain or cron.
 * Checks for CHAIN_SECRET header or CRON_SECRET authorization.
 */
export function verifyChainOrCron(request: Request): boolean {
  // Check chain secret
  const chainSecret = request.headers.get("x-chain-secret");
  if (chainSecret && chainSecret === process.env.CHAIN_SECRET) {
    return true;
  }

  // Check cron secret (for initial trigger)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  // Allow if no secrets configured (local dev)
  if (!process.env.CHAIN_SECRET && !process.env.CRON_SECRET) {
    return true;
  }

  return false;
}

// Endpoint paths for chaining
export const CHAIN_ENDPOINTS = {
  archive: "/api/job/archive",
  subpage: "/api/job/subpage",
  finalize: "/api/job/finalize",
} as const;
