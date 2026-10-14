import { NextRequest, NextResponse } from "next/server";
import {
  getServerReport,
  extractEntitlementTokenFromHeaders,
  verifyServerEntitlement,
  PAYMENT_INFRASTRUCTURE_BLOCKER,
} from "@/server/security/reportAccess";

export const dynamic = "force-dynamic";

/**
 * GET /api/report/[reportId]
 * Serves premium Full Report data ONLY after verifying a valid server-side payment entitlement.
 * Fails closed (403 Forbidden) for unpaid or unverified requests.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ reportId: string }> }
) {
  const { reportId } = await context.params;
  const stored = getServerReport(reportId);

  if (!stored) {
    return NextResponse.json(
      {
        success: false,
        unlocked: false,
        error: "REPORT_NOT_FOUND",
        message: "Report not found or session has expired. Please run a new website check.",
      },
      { status: 404 }
    );
  }

  // Strictly verify server-side entitlement header; never trust query/client flags
  const token = extractEntitlementTokenFromHeaders(req.headers);
  const entitlement = verifyServerEntitlement(reportId, token);

  if (!entitlement.authorized) {
    return NextResponse.json(
      {
        success: false,
        unlocked: false,
        reportId,
        error: "PAYMENT_REQUIRED",
        reason: entitlement.reason || "UNVERIFIED_ENTITLEMENT",
        checkoutEnabled: entitlement.checkoutEnabled,
        blocker: entitlement.blocker || PAYMENT_INFRASTRUCTURE_BLOCKER,
        message:
          "Full Report access requires a verified server-side payment entitlement.",
      },
      { status: 403 }
    );
  }

  const analysisPayload = stored.supportingContext
    ? {
        ...stored.fullAnalysis,
        supportingContext: stored.supportingContext,
      }
    : stored.fullAnalysis;

  return NextResponse.json(
    {
      success: true,
      unlocked: true,
      reportId: stored.reportId,
      normalizedUrl: stored.normalizedUrl,
      domain: stored.domain,
      entitlement: {
        unlocked: true,
        tier: "paid",
        checkoutEnabled: entitlement.checkoutEnabled,
      },
      snapshot: stored.snapshot,
      analysis: analysisPayload,
      ...(stored.supportingContext
        ? { supportingContext: stored.supportingContext }
        : {}),
    },
    { status: 200 }
  );
}
