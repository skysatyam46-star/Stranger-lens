import { NextRequest, NextResponse } from "next/server";
import { validateUrl, checkSsrf } from "@/lib/url-validator";
import { fetchWebsiteHomepage } from "@/lib/website-fetcher";
import { setCachedFetch } from "@/lib/fetch-cache";
import {
  getClientIp,
  checkAndAcquireRateLimit,
  releaseConcurrencySlot,
} from "@/server/security/rateLimiter";
import { SERVER_LIMITS } from "@/server/config/limits";

export const dynamic = "force-dynamic";

/**
 * POST /api/check/verify
 * Stage 2 Pre-Scan Reachability Check:
 * Verifies that the website exists and is reachable before starting the full scan animation.
 */
export async function POST(req: NextRequest) {
  // 0. Rate Limiting & Concurrency Protection
  const clientIp = getClientIp(req);
  const limitCheck = checkAndAcquireRateLimit(clientIp, {
    scope: "verify",
    maxPerMinute: SERVER_LIMITS.VERIFY_RATE_LIMIT_PER_MINUTE,
    maxConcurrent: SERVER_LIMITS.VERIFY_MAX_CONCURRENT_PER_IP,
  });

  if (!limitCheck.allowed) {
    const headers: Record<string, string> = {};
    if (limitCheck.retryAfterSeconds) {
      headers["Retry-After"] = String(limitCheck.retryAfterSeconds);
    }
    return NextResponse.json(
      {
        success: false,
        reachable: false,
        error: limitCheck.error || "RATE_LIMITED",
        message: limitCheck.message || "Too many verification requests. Please try again shortly.",
      },
      { status: 429, headers }
    );
  }

  try {
    let body: { url?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_URL",
          message: "Invalid or missing JSON payload in request body",
          originalUrl: "",
        },
        { status: 400 }
      );
    }

    const rawUrl = typeof body.url === "string" ? body.url.trim() : "";

    // 1. URL Format Validation
    const validation = validateUrl(rawUrl);
    if (!validation.isValid || !validation.normalizedUrl) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error || "INVALID_URL",
          message: validation.message || "Please enter a valid website URL",
          originalUrl: rawUrl,
        },
        { status: 400 }
      );
    }

    // 2. SSRF Security Policy Check & Host DNS Reachability
    const ssrfCheck = await checkSsrf(validation.normalizedUrl);
    if (!ssrfCheck.isSafe) {
      const isDnsError = ssrfCheck.isDnsFailure;
      return NextResponse.json(
        {
          success: false,
          reachable: false,
          error: isDnsError ? "FETCH_FAILED" : "SSRF_BLOCKED",
          message: isDnsError
            ? (ssrfCheck.reason || "Unable to reach website host. Please verify the domain name.")
            : (ssrfCheck.reason || "Access to internal or private addresses is prohibited"),
          originalUrl: rawUrl,
          normalizedUrl: validation.normalizedUrl,
        },
        { status: isDnsError ? 502 : 422 }
      );
    }

    // 3. Fast Reachability Fetch
    const fetchResult = await fetchWebsiteHomepage(
      rawUrl,
      validation.normalizedUrl,
      {
        timeoutMs: 6000,
        maxRedirects: 4,
        maxSizeBytes: 3 * 1024 * 1024,
      }
    );

    if (!fetchResult.success) {
      let httpStatus = 502;
      if (fetchResult.error === "INVALID_URL") httpStatus = 400;
      if (fetchResult.error === "SSRF_BLOCKED") httpStatus = 422;
      if (fetchResult.error === "FETCH_TIMEOUT" || fetchResult.error === "WEBSITE_FETCH_TIMEOUT") httpStatus = 504;
      if (fetchResult.error === "WEBSITE_RESPONSE_TOO_LARGE") httpStatus = 413;

      return NextResponse.json(
        {
          success: false,
          reachable: false,
          error: fetchResult.error,
          message: fetchResult.message,
          originalUrl: rawUrl,
          normalizedUrl: validation.normalizedUrl,
        },
        { status: httpStatus }
      );
    }

    // Cache the successful fetch result so the subsequent /api/check call does not have to re-fetch
    setCachedFetch(validation.normalizedUrl, fetchResult);

    return NextResponse.json(
      {
        success: true,
        reachable: true,
        originalUrl: rawUrl,
        normalizedUrl: fetchResult.normalizedUrl,
        finalUrl: fetchResult.finalUrl,
        domain: fetchResult.domain,
        status: fetchResult.status,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Error in /api/check/verify endpoint:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      {
        success: false,
        reachable: false,
        error: "FETCH_FAILED",
        message: "Unable to verify website reachability. Please try again.",
      },
      { status: 500 }
    );
  } finally {
    releaseConcurrencySlot(clientIp, "verify");
  }
}
