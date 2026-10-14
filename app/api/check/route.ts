import { NextRequest, NextResponse } from "next/server";
import { validateUrl, checkSsrf } from "@/lib/url-validator";
import { fetchWebsiteHomepage } from "@/lib/website-fetcher";
import { extractWebsiteSnapshot } from "@/lib/content-extractor";
import { analyzeWebsite } from "@/services/ai/analyzeWebsite";
import { validateAndScoreAnalysis } from "@/services/validation/analysisValidator";
import { generateSupportingPageContext } from "@/services/ai/supportingContextAnalyzer";
import { getCachedFetch, setCachedFetch } from "@/lib/fetch-cache";
import {
  getClientIp,
  checkAndAcquireRateLimit,
  releaseConcurrencySlot,
} from "@/server/security/rateLimiter";
import { isSupportingPagesEnabled, SERVER_LIMITS } from "@/server/config/limits";
import {
  saveServerReport,
  redactAnalysisForFreeTier,
  computeLockedPreviewCounts,
  extractEntitlementTokenFromHeaders,
  verifyServerEntitlement,
  isPaymentInfrastructureConfigured,
  PAYMENT_INFRASTRUCTURE_BLOCKER,
} from "@/server/security/reportAccess";

export const dynamic = "force-dynamic";

/**
 * GET /api/check
 * Health check & diagnostic endpoint for URL checker API
 */
export async function GET() {
  return NextResponse.json({
    status: "online",
    service: "StrangerLens Full Backend Pipeline (Validation, Fetching, Extraction, AI & Scoring)",
    phase: "Phase 1, Phase 2, Phase 3, Phase 4 & Multi-Page Phase 2 - Backend",
    supportingPagesEnabled: isSupportingPagesEnabled(),
    endpoints: {
      "POST /api/check": "Validates URL, checks SSRF safety, normalizes URL, fetches primary homepage, extracts WebsiteSnapshot, runs AI Analysis and Evidence Validation & Deterministic Scoring on the homepage, and optionally generates supporting-page context when enabled.",
    },
  });
}

/**
 * POST /api/check
 * Primary Backend Route (Phase 1 + Phase 2 + Phase 3 + Phase 4):
 * Accepts JSON payload `{ "url": "example.com" }`
 * Validates, normalizes, checks SSRF security rules, fetches website homepage, performs content extraction, runs AI analysis, and executes deterministic scoring & evidence validation.
 */
export async function POST(req: NextRequest) {
  // 0. Rate Limiting & Concurrency Protection (Enforced before expensive processing)
  const clientIp = getClientIp(req);
  const limitCheck = checkAndAcquireRateLimit(clientIp, {
    scope: "check",
    maxPerMinute: SERVER_LIMITS.CHECK_RATE_LIMIT_PER_MINUTE,
    maxConcurrent: SERVER_LIMITS.CHECK_MAX_CONCURRENT_PER_IP,
  });

  if (!limitCheck.allowed) {
    const headers: Record<string, string> = {};
    if (limitCheck.retryAfterSeconds) {
      headers["Retry-After"] = String(limitCheck.retryAfterSeconds);
    }
    return NextResponse.json(
      {
        success: false,
        error: limitCheck.error || "RATE_LIMITED",
        message: limitCheck.message || "Too many checks are currently running. Please try again shortly.",
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

    const rawUrl = typeof body.url === "string" ? body.url : "";

    // 1. URL Validation & Structure Check
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

    // 2. SSRF Security Policy Check & Host Reachability
    const ssrfCheck = await checkSsrf(validation.normalizedUrl);
    if (!ssrfCheck.isSafe) {
      const isDnsError = ssrfCheck.isDnsFailure;
      return NextResponse.json(
        {
          success: false,
          error: isDnsError ? "FETCH_FAILED" : "SSRF_BLOCKED",
          message: ssrfCheck.reason || "Access to internal or private addresses is prohibited",
          originalUrl: rawUrl,
          normalizedUrl: validation.normalizedUrl,
        },
        { status: isDnsError ? 502 : 422 }
      );
    }

    // 3. Fetch Website Homepage (Use pre-scan cache if available)
    const pipelineController = new AbortController();
    const pipelineTimer = setTimeout(
      () => pipelineController.abort(),
      SERVER_LIMITS.ANALYSIS_TOTAL_TIMEOUT_MS
    );

    try {
      let fetchResult = getCachedFetch(validation.normalizedUrl);

      if (!fetchResult) {
        fetchResult = await fetchWebsiteHomepage(
          rawUrl,
          validation.normalizedUrl,
          {
            timeoutMs: SERVER_LIMITS.WEBSITE_FETCH_TIMEOUT_MS,
            maxRedirects: SERVER_LIMITS.WEBSITE_MAX_REDIRECTS,
            maxSizeBytes: SERVER_LIMITS.WEBSITE_MAX_RESPONSE_BYTES,
            signal: pipelineController.signal,
          }
        );

        if (fetchResult.success) {
          setCachedFetch(validation.normalizedUrl, fetchResult);
        }
      }

      if (!fetchResult.success) {
        let httpStatus = 502;
        if (fetchResult.error === "INVALID_URL") httpStatus = 400;
        if (fetchResult.error === "SSRF_BLOCKED") httpStatus = 422;
        if (fetchResult.error === "FETCH_TIMEOUT" || fetchResult.error === "WEBSITE_FETCH_TIMEOUT") httpStatus = 504;
        if (fetchResult.error === "WEBSITE_RESPONSE_TOO_LARGE") httpStatus = 413;

        return NextResponse.json(fetchResult, { status: httpStatus });
      }

      // 4. Phase 2: Deterministic Content Extraction (Primary Homepage)
      const snapshot = extractWebsiteSnapshot(fetchResult.html, {
        baseUrl: fetchResult.finalUrl,
      });

      // 5. Phase 3: AI Analysis Engine (Primary Homepage ONLY)
      const rawAiAnalysis = await analyzeWebsite(snapshot);

      // 6. Phase 4: Evidence Validation & Deterministic Scoring (Primary Homepage ONLY)
      const finalValidatedAnalysis = validateAndScoreAnalysis(rawAiAnalysis, snapshot);

      // 7. Multi-Page Phase 2: Optional Supporting-Page Context Integration
      //    Strictly isolated from homepage scoring and disabled by default (ENABLE_SUPPORTING_PAGES_ANALYSIS=false).
      //    Any failure inside supporting-page discovery, fetching, or synthesis never fails the homepage report.
      let optionalSupportingResult: Awaited<
        ReturnType<typeof generateSupportingPageContext>
      > = {};

      if (isSupportingPagesEnabled() && !pipelineController.signal.aborted) {
        optionalSupportingResult = await generateSupportingPageContext(
          snapshot,
          fetchResult.finalUrl,
          fetchResult.html,
          { signal: pipelineController.signal }
        );
      }

      // Omit raw HTML string from public API payload to prevent massive payloads,
      // memory pressure, and sensitive DOM leakage over the wire
      const { html: _omittedHtml, ...safeFetchMetadata } = fetchResult;

      const storedReport = saveServerReport({
        normalizedUrl: fetchResult.finalUrl,
        domain: fetchResult.domain,
        snapshot,
        fullAnalysis: finalValidatedAnalysis,
        supportingContext: optionalSupportingResult.supportingContext,
      });

      const lockedPreviewCounts = computeLockedPreviewCounts(finalValidatedAnalysis);
      const requestedReportId =
        typeof (body as any).reportId === "string"
          ? (body as any).reportId
          : storedReport.reportId;
      const token = extractEntitlementTokenFromHeaders(req.headers);
      const entitlement = verifyServerEntitlement(requestedReportId, token);

      if (!entitlement.authorized) {
        return NextResponse.json(
          {
            ...safeFetchMetadata,
            reportId: storedReport.reportId,
            entitlement: {
              unlocked: false,
              tier: "free",
              checkoutEnabled: isPaymentInfrastructureConfigured(),
              blocker: isPaymentInfrastructureConfigured()
                ? null
                : PAYMENT_INFRASTRUCTURE_BLOCKER,
            },
            lockedPreviewCounts,
            snapshot,
            analysis: redactAnalysisForFreeTier(finalValidatedAnalysis),
          },
          { status: 200 }
        );
      }

      const analysisPayload = optionalSupportingResult.supportingContext
        ? {
            ...finalValidatedAnalysis,
            supportingContext: optionalSupportingResult.supportingContext,
          }
        : finalValidatedAnalysis;

      return NextResponse.json(
        {
          ...safeFetchMetadata,
          reportId: storedReport.reportId,
          entitlement: {
            unlocked: true,
            tier: "paid",
            checkoutEnabled: true,
            blocker: null,
          },
          lockedPreviewCounts,
          snapshot,
          analysis: analysisPayload,
          ...(optionalSupportingResult.supportingContext
            ? { supportingContext: optionalSupportingResult.supportingContext }
            : {}),
          ...(optionalSupportingResult.supportingPagesBundle
            ? { supportingPages: optionalSupportingResult.supportingPagesBundle.pages }
            : {}),
        },
        { status: 200 }
      );
    } finally {
      clearTimeout(pipelineTimer);
    }
  } catch (error: unknown) {
    console.error("Error in /api/check endpoint:", error instanceof Error ? error.message : "Unknown error");

    const err = error as any;
    const isAiConfigError =
      err?.code === "AI_PROVIDER_NOT_CONFIGURED" ||
      err?.code === "AI_PROVIDER_AUTH_ERROR" ||
      (typeof err?.message === "string" &&
        (err.message.includes("Analysis is temporarily unavailable") ||
         err.message.includes("high demand") ||
         err.message.includes("503") ||
         err.message.includes("429") ||
         err.message.includes("RESOURCE_EXHAUSTED") ||
         err.message.includes("Quota exceeded") ||
         err.message.includes("rate-limits")));

    if (isAiConfigError) {
      return NextResponse.json(
        {
          success: false,
          error: "AI_QUOTA_EXCEEDED",
          message: "AI model API quota or rate limit has been exceeded. Please try again later or check API configuration.",
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "SERVER_ERROR",
        message: "An unexpected server error occurred while processing the website check. Please try again.",
      },
      { status: 500 }
    );
  } finally {
    releaseConcurrencySlot(clientIp, "check");
  }
}
