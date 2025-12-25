// Backward compatibility - re-export from qstash module
// This file can be removed once all imports are updated

export { publishNext as chainNext, CHAIN_ENDPOINTS } from "./qstash";

// Legacy function - keeping for backward compatibility
// Use verifyAndParseBody from qstash.ts instead
export function verifyChainOrCron(request: Request): boolean {
  // Check chain secret (legacy)
  const chainSecret = request.headers.get("x-chain-secret");
  if (chainSecret && chainSecret === process.env.CHAIN_SECRET) {
    return true;
  }

  // Check cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  // Check local dev header
  if (request.headers.get("x-local-dev") === "true") {
    if (process.env.NODE_ENV === "development") {
      return true;
    }
  }

  // Allow if no secrets configured (local dev)
  if (!process.env.CHAIN_SECRET && !process.env.CRON_SECRET) {
    return true;
  }

  return false;
}
