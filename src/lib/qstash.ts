// QStash client for reliable job chaining
// Replaces self-triggering fetch() to avoid Vercel 508 errors

import { Client, Receiver } from "@upstash/qstash";

// Check if we're in local dev mode (no QStash configured)
const isLocalDev =
  process.env.NODE_ENV === "development" && !process.env.QSTASH_TOKEN;

// QStash client for publishing messages
const qstashClient = isLocalDev
  ? null
  : new Client({
      token: process.env.QSTASH_TOKEN!,
    });

// QStash receiver for verifying incoming messages
const qstashReceiver = isLocalDev
  ? null
  : new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
    });

/**
 * Get the base URL for the application
 */
function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "http://localhost:3021";
}

/**
 * Publish a message to trigger the next job phase via QStash.
 * In local dev, falls back to direct fetch.
 */
export async function publishNext(
  endpoint: string,
  body: object,
  options?: { delay?: number }
): Promise<void> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${endpoint}`;

  console.log(`[QSTASH] Publishing to: ${url}`);

  if (isLocalDev || !qstashClient) {
    // Local dev: use direct fetch (same behavior as before)
    console.log("[QSTASH] Local dev mode - using direct fetch");
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-local-dev": "true",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`Local chain to ${endpoint} returned ${response.status}`);
      } else {
        console.log(`Local chain to ${endpoint} triggered successfully`);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.log(`Local chain to ${endpoint} sent (timed out waiting)`);
      } else {
        console.error(`Local chain to ${endpoint} failed:`, error);
      }
    }
    return;
  }

  // Production: use QStash for reliable delivery
  try {
    const result = await qstashClient.publishJSON({
      url,
      body,
      retries: 3,
      delay: options?.delay, // delay in seconds
    });

    console.log(`[QSTASH] Message published: ${result.messageId}`);
  } catch (error) {
    console.error(`[QSTASH] Failed to publish to ${endpoint}:`, error);
    throw error;
  }
}

/**
 * Verify that a request is from QStash (production) or local dev.
 * Returns true if verified, false otherwise.
 */
export async function verifyQStashRequest(request: Request): Promise<boolean> {
  // Check for local dev header
  if (request.headers.get("x-local-dev") === "true") {
    if (process.env.NODE_ENV === "development") {
      console.log("[QSTASH] Local dev request - skipping verification");
      return true;
    }
  }

  // Check for cron secret (initial trigger from Vercel cron)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (authHeader === `Bearer ${cronSecret}`) {
    console.log("[QSTASH] Cron request verified");
    return true;
  }

  // Allow if no secrets configured (local dev without QStash)
  if (
    !process.env.QSTASH_CURRENT_SIGNING_KEY &&
    !process.env.CRON_SECRET &&
    process.env.NODE_ENV === "development"
  ) {
    console.log("[QSTASH] No secrets configured - allowing request");
    return true;
  }

  // Verify QStash signature
  if (!qstashReceiver) {
    console.error("[QSTASH] Receiver not configured");
    return false;
  }

  const signature = request.headers.get("upstash-signature");
  if (!signature) {
    console.error("[QSTASH] No signature header");
    return false;
  }

  try {
    const body = await request.text();
    await qstashReceiver.verify({
      signature,
      body,
      url: request.url,
    });
    console.log("[QSTASH] Signature verified");

    // Restore body for downstream processing
    // Note: We need to handle this in the calling code
    return true;
  } catch (error) {
    console.error("[QSTASH] Signature verification failed:", error);
    return false;
  }
}

/**
 * Helper to verify and parse QStash request body
 */
export async function verifyAndParseBody<T>(
  request: Request
): Promise<{ verified: boolean; body?: T; rawBody?: string }> {
  const clonedRequest = request.clone();

  // Check for local dev header first
  if (request.headers.get("x-local-dev") === "true") {
    if (process.env.NODE_ENV === "development") {
      const body = await request.json();
      return { verified: true, body };
    }
  }

  // Check for cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (authHeader === `Bearer ${cronSecret}`) {
    try {
      const body = await request.json();
      return { verified: true, body };
    } catch {
      return { verified: true, body: undefined };
    }
  }

  // Allow if no secrets configured (local dev)
  if (
    !process.env.QSTASH_CURRENT_SIGNING_KEY &&
    !process.env.CRON_SECRET &&
    process.env.NODE_ENV === "development"
  ) {
    try {
      const body = await request.json();
      return { verified: true, body };
    } catch {
      return { verified: true, body: undefined };
    }
  }

  // Verify QStash signature
  if (!qstashReceiver) {
    return { verified: false };
  }

  const signature = request.headers.get("upstash-signature");
  if (!signature) {
    return { verified: false };
  }

  try {
    const rawBody = await clonedRequest.text();
    await qstashReceiver.verify({
      signature,
      body: rawBody,
      url: request.url,
    });

    const body = rawBody ? JSON.parse(rawBody) : undefined;
    return { verified: true, body, rawBody };
  } catch (error) {
    console.error("[QSTASH] Verification failed:", error);
    return { verified: false };
  }
}

// Endpoint paths for chaining (same as before)
export const CHAIN_ENDPOINTS = {
  archive: "/api/job/archive",
  subpage: "/api/job/subpage",
  finalize: "/api/job/finalize",
} as const;
