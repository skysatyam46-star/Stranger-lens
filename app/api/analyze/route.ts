import { NextRequest, NextResponse } from "next/server";
import { analyzeWebsite } from "@/services/ai/analyzeWebsite";
import { extractWebsiteSnapshot } from "@/lib/content-extractor";
import { validateAndScoreAnalysis } from "@/services/validation/analysisValidator";
import { fetchWebsiteHomepage } from "@/lib/website-fetcher";
import { validateUrl, checkSsrf } from "@/lib/url-validator";
import {
  getClientIp,
  checkAndAcquireRateLimit,
  releaseConcurrencySlot,
} from "@/server/security/rateLimiter";
import { SERVER_LIMITS } from "@/server/config/limits";
import {
  saveServerReport,
  redactAnalysisForFreeTier,
  extractEntitlementTokenFromHeaders,
  verifyServerEntitlement,
  isPaymentInfrastructureConfigured,
  PAYMENT_INFRASTRUCTURE_BLOCKER,
} from "@/server/security/reportAccess";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
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
        { error: "Please enter a valid website URL" },
        { status: 400 }
      );
    }

    const url = typeof body?.url === "string" ? body.url : "";

    if (!url) {
      return NextResponse.json(
        { error: "Please enter a valid website URL" },
        { status: 400 }
      );
    }

    const validation = validateUrl(url);
    if (!validation.isValid || !validation.normalizedUrl) {
      return NextResponse.json(
        { error: validation.message || "Invalid URL provided" },
        { status: 400 }
      );
    }

    const ssrfCheck = await checkSsrf(validation.normalizedUrl);
    if (!ssrfCheck.isSafe) {
      return NextResponse.json(
        { error: ssrfCheck.reason || "Access to internal or private addresses is prohibited" },
        { status: ssrfCheck.isDnsFailure ? 502 : 422 }
      );
    }

    // Fetch and analyze
    const fetchResult = await fetchWebsiteHomepage(url, validation.normalizedUrl);
    if (!fetchResult.success) {
      return NextResponse.json(
        { error: fetchResult.message || "Failed to fetch website" },
        { status: 502 }
      );
    }

    const snapshot = extractWebsiteSnapshot(fetchResult.html, {
      baseUrl: fetchResult.finalUrl,
    });

    const aiAnalysis = await analyzeWebsite(snapshot);
    const validated = validateAndScoreAnalysis(aiAnalysis, snapshot);

    const stored = saveServerReport({
      normalizedUrl: fetchResult.finalUrl,
      domain: fetchResult.domain,
      snapshot,
      fullAnalysis: validated,
    });

    const token = extractEntitlementTokenFromHeaders(req.headers);
    const entitlement = verifyServerEntitlement(stored.reportId, token);

    if (!entitlement.authorized) {
      return NextResponse.json({
        ...redactAnalysisForFreeTier(validated),
        reportId: stored.reportId,
        entitlement: {
          unlocked: false,
          tier: "free",
          checkoutEnabled: isPaymentInfrastructureConfigured(),
          blocker: isPaymentInfrastructureConfigured() ? null : PAYMENT_INFRASTRUCTURE_BLOCKER,
        },
      });
    }

    return NextResponse.json(validated);
  } catch (error: any) {
    console.error("Analysis error in /api/analyze:", error);
    if (
      error?.code === "AI_PROVIDER_NOT_CONFIGURED" ||
      error?.code === "AI_PROVIDER_AUTH_ERROR" ||
      (typeof error?.message === "string" &&
        error.message.includes("Analysis is temporarily unavailable"))
    ) {
      return NextResponse.json(
        {
          error: "AI_PROVIDER_NOT_CONFIGURED",
          message: "Analysis is temporarily unavailable. Please try again later.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Failed to analyze website. Please check the URL and try again." },
      { status: 500 }
    );
  } finally {
    releaseConcurrencySlot(clientIp, "check");
  }
}
