import { SERVER_LIMITS } from "@/server/config/limits";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

// In-memory rate limiting and active concurrency tracking.
// NOTE: These Maps are instance-local (scoped to the individual container process).
// In Google Cloud Run, instances scale horizontally and to zero. Limits are enforced
// per container instance, protecting against single-instance starvation and DDoS.
const rateLimitMap = new Map<string, RateLimitBucket>();
const activeConcurrencyMap = new Map<string, number>();

/**
 * Extracts a normalized client IP identifier from request headers.
 *
 * In Google Cloud Run / Google Front End (GFE) topology:
 * GFE terminates external client connections and appends the caller's IP to the
 * end of the X-Forwarded-For chain (`<untrusted_client_header>, <verified_caller_ip>`).
 * The leftmost entry (index 0) can be forged by a malicious client sending a fabricated
 * X-Forwarded-For header.
 *
 * Therefore, we inspect the rightmost non-empty IP entry in X-Forwarded-For as the
 * nearest edge-verified caller address.
 *
 * Limitations & Remaining Uncertainty:
 * - If an external CDN or multi-hop reverse proxy (e.g. Cloudflare) is layered in front
 *   without configured trusted proxy hop stripping, the rightmost entry reflects the
 *   intermediate proxy rather than the original eyeball client.
 * - In local development or environments where headers are omitted, fallbacks to
 *   X-Real-IP, CF-Connecting-IP, or "unknown-client" are used.
 */
export function getClientIp(req: Request): string {
  // 1. NextRequest IP property if populated by Next.js engine
  if ("ip" in req && typeof (req as any).ip === "string" && (req as any).ip) {
    return (req as any).ip.trim();
  }

  // 2. X-Forwarded-For: inspect rightmost entry to avoid trusting spoofed leftmost headers
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((ip) => ip.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      return parts[parts.length - 1];
    }
  }

  // 3. Fallback proxy headers
  const realIp = req.headers.get("x-real-ip");
  if (realIp && realIp.trim()) return realIp.trim();

  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  if (cfConnectingIp && cfConnectingIp.trim()) return cfConnectingIp.trim();

  return "unknown-client";
}

export interface RateLimitCheckResult {
  allowed: boolean;
  status?: number;
  error?: "RATE_LIMITED" | "CONCURRENCY_LIMITED";
  message?: string;
  retryAfterSeconds?: number;
  clientIp?: string;
}

export interface RateLimitOptions {
  scope?: string;
  maxPerMinute?: number;
  maxConcurrent?: number;
}

/**
 * Atomically verifies rate limits and acquires a concurrency slot if allowed.
 * Prevents race conditions by checking both constraints before incrementing counters.
 */
export function checkAndAcquireRateLimit(
  clientIp: string,
  options: RateLimitOptions = {}
): RateLimitCheckResult {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxPerMinute = options.maxPerMinute ?? SERVER_LIMITS.CHECK_RATE_LIMIT_PER_MINUTE;
  const maxConcurrent = options.maxConcurrent ?? SERVER_LIMITS.CHECK_MAX_CONCURRENT_PER_IP;
  const bucketKey = options.scope ? `${options.scope}:${clientIp}` : clientIp;
  const concurrencyKey = options.scope ? `${options.scope}:${clientIp}` : clientIp;

  // 1. Check Concurrency Limit FIRST
  const activeCount = activeConcurrencyMap.get(concurrencyKey) || 0;
  if (activeCount >= maxConcurrent) {
    return {
      allowed: false,
      status: 429,
      error: "CONCURRENCY_LIMITED",
      message: "Too many checks are currently running. Please wait for previous checks to finish.",
      retryAfterSeconds: 5,
      clientIp,
    };
  }

  // 2. Check Rate Limit
  let bucket = rateLimitMap.get(bucketKey);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 1, resetAt: now + windowMs };
    rateLimitMap.set(bucketKey, bucket);
  } else {
    if (bucket.count >= maxPerMinute) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      return {
        allowed: false,
        status: 429,
        error: "RATE_LIMITED",
        message: "Rate limit reached. Please wait a moment before trying again.",
        retryAfterSeconds,
        clientIp,
      };
    }
    bucket.count += 1;
  }

  // 3. Atomically acquire concurrency slot since all checks passed
  activeConcurrencyMap.set(concurrencyKey, activeCount + 1);

  // Periodic cleanup of stale rate limit buckets and hard capacity cap to prevent memory leaks
  if (rateLimitMap.size > 500) {
    for (const [key, b] of rateLimitMap.entries()) {
      if (now > b.resetAt) rateLimitMap.delete(key);
    }
    while (rateLimitMap.size > 5000) {
      const oldestKey = rateLimitMap.keys().next().value;
      if (oldestKey === undefined) break;
      rateLimitMap.delete(oldestKey);
    }
  }

  return { allowed: true, clientIp };
}

/**
 * Decrements active concurrency counter for a client IP and optional scope.
 * MUST be called inside a `finally` block whenever `checkAndAcquireRateLimit` succeeds.
 */
export function releaseConcurrencySlot(clientIp: string, scope?: string): void {
  const concurrencyKey = scope ? `${scope}:${clientIp}` : clientIp;
  const current = activeConcurrencyMap.get(concurrencyKey) || 0;
  if (current <= 1) {
    activeConcurrencyMap.delete(concurrencyKey);
  } else {
    activeConcurrencyMap.set(concurrencyKey, current - 1);
  }
}

/**
 * Backward compatibility: Checks limits without acquiring a slot.
 */
export function checkRateAndConcurrencyLimit(clientIp: string): RateLimitCheckResult {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxPerMinute = SERVER_LIMITS.CHECK_RATE_LIMIT_PER_MINUTE;
  const maxConcurrent = SERVER_LIMITS.CHECK_MAX_CONCURRENT_PER_IP;

  const activeCount = activeConcurrencyMap.get(clientIp) || 0;
  if (activeCount >= maxConcurrent) {
    return {
      allowed: false,
      status: 429,
      error: "CONCURRENCY_LIMITED",
      message: "Too many checks are running. Please try again shortly.",
      retryAfterSeconds: 5,
    };
  }

  let bucket = rateLimitMap.get(clientIp);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 1, resetAt: now + windowMs };
    rateLimitMap.set(clientIp, bucket);
  } else {
    if (bucket.count >= maxPerMinute) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      return {
        allowed: false,
        status: 429,
        error: "RATE_LIMITED",
        message: "Check rate limit reached. Please wait a moment before trying again.",
        retryAfterSeconds,
      };
    }
    bucket.count += 1;
  }

  return { allowed: true };
}

/**
 * Backward compatibility: Increments active concurrency counter for a client IP.
 */
export function acquireConcurrencySlot(clientIp: string, scope?: string): void {
  const concurrencyKey = scope ? `${scope}:${clientIp}` : clientIp;
  const current = activeConcurrencyMap.get(concurrencyKey) || 0;
  activeConcurrencyMap.set(concurrencyKey, current + 1);
}

/**
 * Reset in-memory rate limiter maps (intended exclusively for automated testing).
 */
export function _resetRateLimiterForTesting(): void {
  rateLimitMap.clear();
  activeConcurrencyMap.clear();
}

