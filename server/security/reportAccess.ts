import crypto from "node:crypto";
import { FinalValidatedAnalysis } from "@/types/validatedAnalysis";
import { SupportingContext } from "@/types/supportingContext";
import { WebsiteSnapshot } from "@/lib/content-extractor";
import { AnalysisData } from "@/components/ResultsScreen";

export interface StoredServerReport {
  reportId: string;
  normalizedUrl: string;
  domain: string;
  createdAt: number;
  snapshot: WebsiteSnapshot;
  fullAnalysis: FinalValidatedAnalysis;
  supportingContext?: SupportingContext;
}

export interface LockedPreviewCounts {
  actionSteps: number;
  secondaryFixes: number;
  copyRewrites: number;
  totalRisks: number;
}

export interface EntitlementCheckResult {
  authorized: boolean;
  tier: "free" | "paid";
  checkoutEnabled: boolean;
  blocker: string | null;
  reason?: string;
}

const REPORT_TTL_MS = 60 * 60 * 1000; // 1 hour server-side retention
const MAX_STORED_REPORTS = 500;

const serverReportStore = new Map<string, StoredServerReport>();
const verifiedEntitlementStore = new Map<
  string,
  { reportId: string; tokenHash: string; grantedAt: number; plan: "single" | "pack" }
>();

export const PAYMENT_INFRASTRUCTURE_BLOCKER =
  "Live Paddle webhook verification (PADDLE_API_KEY, PADDLE_WEBHOOK_SECRET) and persistent database entitlement storage are not configured in this environment. Paid report unlock fails closed.";

/**
 * Checks whether production payment verification infrastructure is configured.
 * Fails closed (returns false) unless verified server-side credentials are present.
 */
export function isPaymentInfrastructureConfigured(): boolean {
  if (typeof process === "undefined" || !process.env) return false;
  const hasPaddleKey = Boolean(process.env.PADDLE_API_KEY?.trim());
  const hasWebhookSecret = Boolean(process.env.PADDLE_WEBHOOK_SECRET?.trim());
  return hasPaddleKey && hasWebhookSecret;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function pruneExpiredReports(): void {
  const now = Date.now();
  for (const [id, entry] of serverReportStore.entries()) {
    if (now - entry.createdAt > REPORT_TTL_MS) {
      serverReportStore.delete(id);
    }
  }
  if (serverReportStore.size > MAX_STORED_REPORTS) {
    const oldestKey = serverReportStore.keys().next().value;
    if (oldestKey) serverReportStore.delete(oldestKey);
  }
}

/**
 * Saves the complete validated report server-side so free API responses never need
 * to transmit premium report sections to the client browser.
 */
export function saveServerReport(params: {
  normalizedUrl: string;
  domain: string;
  snapshot: WebsiteSnapshot;
  fullAnalysis: FinalValidatedAnalysis;
  supportingContext?: SupportingContext;
}): StoredServerReport {
  pruneExpiredReports();
  const reportId = crypto.randomUUID();
  const record: StoredServerReport = {
    reportId,
    normalizedUrl: params.normalizedUrl,
    domain: params.domain,
    createdAt: Date.now(),
    snapshot: params.snapshot,
    fullAnalysis: params.fullAnalysis,
    ...(params.supportingContext ? { supportingContext: params.supportingContext } : {}),
  };
  serverReportStore.set(reportId, record);
  return record;
}

export function getServerReport(reportId: string): StoredServerReport | null {
  if (!reportId || typeof reportId !== "string") return null;
  pruneExpiredReports();
  return serverReportStore.get(reportId) || null;
}

/**
 * Issues a cryptographically random server-side entitlement token for a specific reportId.
 * Used only after verified server-side payment confirmation (or in isolated authorization tests).
 */
export function grantVerifiedServerEntitlement(
  reportId: string,
  plan: "single" | "pack" = "single"
): string {
  const rawToken = `sl_ent_${crypto.randomBytes(24).toString("hex")}`;
  verifiedEntitlementStore.set(reportId, {
    reportId,
    tokenHash: hashToken(rawToken),
    grantedAt: Date.now(),
    plan,
  });
  return rawToken;
}

export function extractEntitlementTokenFromHeaders(
  headers?: Headers | Record<string, string | undefined> | null
): string | null {
  if (!headers) return null;
  if (typeof (headers as Headers).get === "function") {
    const h = headers as Headers;
    const auth = h.get("authorization") || h.get("Authorization");
    if (auth && /^Bearer\s+(.+)$/i.test(auth.trim())) {
      return auth.trim().replace(/^Bearer\s+/i, "").trim();
    }
    const custom = h.get("x-entitlement-token");
    return custom ? custom.trim() : null;
  }
  const rec = headers as Record<string, string | undefined>;
  const auth = rec.authorization || rec.Authorization;
  if (auth && /^Bearer\s+(.+)$/i.test(auth.trim())) {
    return auth.trim().replace(/^Bearer\s+/i, "").trim();
  }
  return rec["x-entitlement-token"]?.trim() || null;
}

/**
 * Verifies whether a request is authorized to access the Full Report for `reportId`.
 * Fails closed: client-side booleans or unverified tokens are strictly rejected.
 */
export function verifyServerEntitlement(
  reportId: string | undefined | null,
  token: string | undefined | null
): EntitlementCheckResult {
  const checkoutEnabled = isPaymentInfrastructureConfigured();

  if (!reportId || !token || typeof token !== "string" || !token.startsWith("sl_ent_")) {
    return {
      authorized: false,
      tier: "free",
      checkoutEnabled,
      blocker: checkoutEnabled ? null : PAYMENT_INFRASTRUCTURE_BLOCKER,
      reason: "MISSING_OR_INVALID_ENTITLEMENT_TOKEN",
    };
  }

  const record = verifiedEntitlementStore.get(reportId);
  if (!record) {
    return {
      authorized: false,
      tier: "free",
      checkoutEnabled,
      blocker: checkoutEnabled ? null : PAYMENT_INFRASTRUCTURE_BLOCKER,
      reason: "NO_VERIFIED_ENTITLEMENT_FOR_REPORT",
    };
  }

  const candidateHash = hashToken(token.trim());
  const expectedBuf = Buffer.from(record.tokenHash, "hex");
  const candidateBuf = Buffer.from(candidateHash, "hex");

  if (
    expectedBuf.length !== candidateBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, candidateBuf)
  ) {
    return {
      authorized: false,
      tier: "free",
      checkoutEnabled,
      blocker: checkoutEnabled ? null : PAYMENT_INFRASTRUCTURE_BLOCKER,
      reason: "ENTITLEMENT_SIGNATURE_MISMATCH",
    };
  }

  return {
    authorized: true,
    tier: "paid",
    checkoutEnabled: true,
    blocker: null,
  };
}

export function computeLockedPreviewCounts(
  analysis: FinalValidatedAnalysis
): LockedPreviewCounts {
  const secondaryFixes = Array.isArray(analysis.other_improvements)
    ? analysis.other_improvements.length
    : 0;
  const actionSteps = Math.min(3, 1 + secondaryFixes);
  const hasPrimaryCopy = Boolean(
    analysis.priority_fix?.clearer_direction &&
      analysis.priority_fix.clearer_direction.trim().length > 0
  );
  const secondaryCopyCount = Array.isArray(analysis.other_improvements)
    ? analysis.other_improvements.filter((i) => Boolean(i.copyable_suggestion?.trim())).length
    : 0;
  const copyRewrites = (hasPrimaryCopy ? 1 : 0) + secondaryCopyCount;
  const totalRisks = Array.isArray(analysis.risks) ? analysis.risks.length : 0;

  return {
    actionSteps,
    secondaryFixes,
    copyRewrites,
    totalRisks,
  };
}

/**
 * Strips all Full-Report (Sections 04–06) premium fields from FinalValidatedAnalysis
 * so free API responses contain ONLY Free Report data (Sections 01–03).
 */
export function redactAnalysisForFreeTier(
  analysis: FinalValidatedAnalysis
): FinalValidatedAnalysis {
  return {
    analysis_version: analysis.analysis_version,
    scoring_version: analysis.scoring_version,
    overall_score: analysis.overall_score,
    overall_status: analysis.overall_status,
    verdict: {
      text: analysis.verdict.text,
    },
    // Section 06 (5-second detailed breakdown) explanations redacted for free tier; keep only status & primary evidence needed for Section 02 findings
    first_seconds: {
      what_is_this: {
        status: analysis.first_seconds.what_is_this.status,
        explanation: "",
        evidence_available: analysis.first_seconds.what_is_this.evidence_available,
        evidence: analysis.first_seconds.what_is_this.evidence.slice(0, 1),
      },
      who_is_it_for: {
        status: analysis.first_seconds.who_is_it_for.status,
        explanation: "",
        evidence_available: analysis.first_seconds.who_is_it_for.evidence_available,
        evidence: analysis.first_seconds.who_is_it_for.evidence.slice(0, 1),
      },
      what_will_i_get: {
        status: analysis.first_seconds.what_will_i_get.status,
        explanation: "",
        evidence_available: analysis.first_seconds.what_will_i_get.evidence_available,
        evidence: analysis.first_seconds.what_will_i_get.evidence.slice(0, 1),
      },
      why_should_i_care: {
        status: analysis.first_seconds.why_should_i_care.status,
        explanation: "",
        evidence_available: analysis.first_seconds.why_should_i_care.evidence_available,
        evidence: analysis.first_seconds.why_should_i_care.evidence.slice(0, 1),
      },
      what_should_i_do_next: {
        status: analysis.first_seconds.what_should_i_do_next.status,
        explanation: "",
        evidence_available: analysis.first_seconds.what_should_i_do_next.evidence_available,
        evidence: analysis.first_seconds.what_should_i_do_next.evidence.slice(0, 1),
      },
    },
    // Section 06 Visitor Impression is premium-only
    visitor_thought: {
      text: "",
      confidence: "low",
    },
    website_message: analysis.website_message,
    signals: analysis.signals,
    // Section 02 Biggest Issue uses only the #1 primary risk; secondary risks (Section 06) are redacted
    risks: Array.isArray(analysis.risks) ? analysis.risks.slice(0, 1) : [],
    // Section 03 Your #1 Priority Fix is included in Free Preview
    priority_fix: analysis.priority_fix,
    // Section 04 & 05 Secondary Improvements & Copy-Ready Rewrites are premium-only
    other_improvements: [],
  };
}

/**
 * Strips all Full-Report (Sections 04–06) fields from frontend AnalysisData
 * so React state/props and browser DOM never hold premium report content for unpaid users.
 */
export function redactFrontendDataForFreeTier(
  data: AnalysisData,
  lockedPreviewCounts?: LockedPreviewCounts
): AnalysisData {
  const primaryClear = data.evidence?.clearFindings?.slice(0, 1) || [];
  const primaryMissing = data.evidence?.missingFindings?.slice(0, 2) || [];

  return {
    ...data,
    firstSeconds: [],
    visitorThought: "",
    evidence: {
      locationTag: data.evidence.locationTag,
      homepageExcerpt: data.evidence.homepageExcerpt,
      clearFindings: primaryClear,
      missingFindings: primaryMissing,
    },
    risks: Array.isArray(data.risks) ? data.risks.slice(0, 1) : [],
    otherImprovements: [],
    supportingContext: undefined,
    isFreeTierOnly: true,
    lockedPreviewCounts: lockedPreviewCounts ?? {
      actionSteps: Math.min(3, 1 + (data.otherImprovements?.length || 0)),
      secondaryFixes: data.otherImprovements?.length || 0,
      copyRewrites:
        (data.recommendation?.strongerDirection ? 1 : 0) +
        (data.otherImprovements?.filter((i) => Boolean(i.copyableSuggestion)).length || 0),
      totalRisks: data.risks?.length || 1,
    },
  };
}

export function _clearReportStoreForTesting(): void {
  serverReportStore.clear();
  verifiedEntitlementStore.clear();
}
