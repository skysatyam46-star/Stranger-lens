import { WebsiteSnapshot, CTAItem } from "@/lib/content-extractor";
import {
  SupportingPageRecord,
  SupportingPagesBundle,
} from "@/lib/supporting-page-fetcher";
import {
  canonicalizeSupportingUrl,
  isExcludedSupportingPath,
  isSameWebsiteDomain,
  normalizeSupportingPathname,
} from "@/lib/supporting-page-discovery";
import {
  extractSearchableTextsFromSnapshot,
  isEvidenceGrounded,
} from "@/services/ai/evidenceValidator";
import {
  EvidenceClaimBasis,
  RawSupportingContextAIOutput,
  SourceEvidence,
  SupportingContext,
  SupportingContextSection,
  SupportingCtaDestinationContext,
  SupportingPageAnalyzedSummary,
} from "@/types/supportingContext";

/**
 * Normalizes a URL for matching against fetched SupportingPageRecords.
 */
function normalizeUrlKey(rawUrl: string, baseUrl: string): string {
  if (!rawUrl) return "";
  try {
    const parsed = new URL(rawUrl.trim(), baseUrl);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = normalizeSupportingPathname(parsed.pathname);
    return `${host}${path}`;
  } catch {
    return rawUrl.trim().toLowerCase().replace(/\/+$/, "");
  }
}

/**
 * Classifies whether a verified supporting-page excerpt represents a website-published
 * credibility claim (testimonials, metrics, awards, certifications, customer names)
 * vs. a directly observed structural/explanatory element.
 */
export function inferClaimBasis(
  excerpt: string,
  page: SupportingPageRecord
): EvidenceClaimBasis {
  const lower = excerpt.toLowerCase();
  const isTestimonialMatch = page.snapshot.trustSignals.testimonials.some(
    (t) =>
      t.quote.toLowerCase().includes(lower) ||
      lower.includes(t.quote.toLowerCase())
  );
  const isStatMatch = page.snapshot.trustSignals.statsAndMetrics.some((s) =>
    lower.includes(s.toLowerCase())
  );
  const isBadgeMatch = page.snapshot.trustSignals.badgesAndCertifications.some(
    (b) => lower.includes(b.toLowerCase())
  );
  const hasCredibilityClaimKeywords =
    /\b(trusted by|customers|users|uptime|soc\s?2|iso\s?27001|gdpr|hipaa|certified|award|guaranteed|saved|\d+%|\$\d+)\b/i.test(
      excerpt
    );

  if (
    isTestimonialMatch ||
    isStatMatch ||
    isBadgeMatch ||
    hasCredibilityClaimKeywords
  ) {
    return "website_published_claim";
  }
  return "directly_observed_element";
}

/**
 * Sanitizes AI text in trustContext so website-published claims are never presented
 * as independently verified third-party facts.
 */
export function qualifyTrustAssessmentText(
  rawText: string,
  hasPublishedClaims: boolean
): string {
  if (!rawText || typeof rawText !== "string") return "";
  let cleaned = rawText
    .trim()
    .replace(
      /\b(independently verified|verified fact|proven fact|conclusively proves|proves that|confirms that they are|guarantees that)\b/gi,
      "published on the website as"
    )
    .replace(/\b(verified customer testimonials)\b/gi, "published customer testimonials")
    .replace(/\b(verified compliance|verified certifications)\b/gi, "published compliance statements");

  if (
    hasPublishedClaims &&
    !/not independently verified/i.test(cleaned)
  ) {
    cleaned = `${cleaned.replace(/\.?\s*$/, "")} (reflecting website-published claims observed on the page, not independently verified).`;
  }

  return cleaned;
}

/**
 * Validates and cleans a list of candidate SourceEvidence items against the map of
 * actually fetched supporting pages.
 *
 * Enforces:
 * - `sourceUrl` MUST match one of the fetched supporting pages (never the homepage or an unfetched URL).
 * - `excerpt` MUST be grounded in THAT SPECIFIC supporting page's extracted WebsiteSnapshot.
 * - Cross-page misattribution (quoting Page A while citing Page B, or quoting the homepage) is rejected.
 */
export function validateSourceEvidenceList(
  rawEvidence:
    | Array<{
        sourceUrl?: string;
        excerpt?: string;
        interpretation?: string;
        claimBasis?: EvidenceClaimBasis;
      }>
    | undefined,
  pagesByUrlKey: Map<
    string,
    { page: SupportingPageRecord; searchableTexts: string[] }
  >,
  homepageUrlKey: string,
  homepageFinalUrl: string,
  options: { enforceClaimBasis?: boolean } = {}
): SourceEvidence[] {
  if (!Array.isArray(rawEvidence) || rawEvidence.length === 0) {
    return [];
  }

  const verified: SourceEvidence[] = [];
  const seenKeys = new Set<string>();

  for (const item of rawEvidence) {
    if (!item || typeof item !== "object") continue;
    const rawSourceUrl =
      typeof item.sourceUrl === "string" ? item.sourceUrl.trim() : "";
    const rawExcerpt =
      typeof item.excerpt === "string" ? item.excerpt.trim() : "";
    const rawInterpretation =
      typeof item.interpretation === "string"
        ? item.interpretation.trim()
        : undefined;

    if (!rawSourceUrl || !rawExcerpt || rawExcerpt.length < 4) continue;

    const candidateUrlKey = normalizeUrlKey(rawSourceUrl, homepageFinalUrl);
    // Never allow homepage URL as a supporting-page sourceUrl
    if (!candidateUrlKey || candidateUrlKey === homepageUrlKey) {
      continue;
    }

    const matchedEntry = pagesByUrlKey.get(candidateUrlKey);
    if (!matchedEntry) {
      // Unknown or unfetched URL -> reject
      continue;
    }

    const { page, searchableTexts } = matchedEntry;

    // Verify the excerpt is genuinely grounded in THIS specific supporting page's snapshot
    if (!isEvidenceGrounded(rawExcerpt, searchableTexts)) {
      continue;
    }

    const dedupeKey = `${page.finalUrl}|${rawExcerpt.toLowerCase()}`;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);

    const claimBasis: EvidenceClaimBasis =
      options.enforceClaimBasis || item.claimBasis
        ? inferClaimBasis(rawExcerpt, page)
        : inferClaimBasis(rawExcerpt, page);

    let safeInterpretation = rawInterpretation;
    if (safeInterpretation && options.enforceClaimBasis) {
      safeInterpretation = qualifyTrustAssessmentText(
        safeInterpretation,
        claimBasis === "website_published_claim"
      );
    }

    verified.push({
      sourceUrl: page.finalUrl,
      excerpt: rawExcerpt,
      ...(safeInterpretation ? { interpretation: safeInterpretation } : {}),
      claimBasis,
    });
  }

  return verified.slice(0, 5);
}

/**
 * Builds deterministic fallback evidence from fetched supporting pages for message consistency
 * when AI output is unavailable or ungrounded.
 */
function buildDeterministicMessageConsistency(
  homepageSnapshot: WebsiteSnapshot,
  pages: SupportingPageRecord[]
): SupportingContextSection {
  const evidence: SourceEvidence[] = [];

  for (const page of pages) {
    const candidateExcerpt =
      page.snapshot.hero.headline ||
      page.snapshot.hero.subheadline ||
      page.snapshot.valueProps.featureCards[0]?.title ||
      page.snapshot.meta.description;

    if (candidateExcerpt && candidateExcerpt.trim().length >= 4) {
      evidence.push({
        sourceUrl: page.finalUrl,
        excerpt: candidateExcerpt.trim(),
        interpretation: `Observed on the ${page.pageType.replace(/_/g, " ")} page (${page.path}).`,
        claimBasis: "directly_observed_element",
      });
    }
  }

  if (evidence.length === 0) {
    return {
      status: "insufficient_evidence",
      assessment:
        "Supporting pages were fetched, but insufficient headline or value-proposition text was extracted to compare against the homepage message.",
      evidence: [],
    };
  }

  const homepageHeadline = homepageSnapshot.hero.headline?.trim();
  const pageCategories = pages.map((p) => p.pageType.replace(/_/g, " ")).join(", ");

  return {
    status: "clarifies_homepage",
    assessment: homepageHeadline
      ? `Fetched supporting pages (${pageCategories}) provide additional product and offer details alongside the homepage headline (“${homepageHeadline.slice(0, 120)}”).`
      : `Fetched supporting pages (${pageCategories}) provide additional product and offer context.`,
    evidence: evidence.slice(0, 3),
  };
}

/**
 * Builds deterministic fallback trust context from fetched supporting pages
 * when AI output is unavailable or ungrounded.
 */
function buildDeterministicTrustContext(
  pages: SupportingPageRecord[]
): SupportingContextSection {
  const evidence: SourceEvidence[] = [];

  for (const page of pages) {
    const snap = page.snapshot;
    if (snap.trustSignals.testimonials.length > 0) {
      const t = snap.trustSignals.testimonials[0];
      evidence.push({
        sourceUrl: page.finalUrl,
        excerpt: t.quote,
        interpretation:
          "Website-published customer testimonial observed on supporting page (not independently verified).",
        claimBasis: "website_published_claim",
      });
    } else if (snap.trustSignals.socialProofHeadings.length > 0) {
      evidence.push({
        sourceUrl: page.finalUrl,
        excerpt: snap.trustSignals.socialProofHeadings[0],
        interpretation:
          "Website-published social proof heading observed on supporting page (not independently verified).",
        claimBasis: "website_published_claim",
      });
    } else if (snap.trustSignals.statsAndMetrics.length > 0) {
      evidence.push({
        sourceUrl: page.finalUrl,
        excerpt: snap.trustSignals.statsAndMetrics[0],
        interpretation:
          "Website-published metric observed on supporting page (not independently verified).",
        claimBasis: "website_published_claim",
      });
    } else if (
      (page.pageType === "about" ||
        page.pageType === "security" ||
        page.pageType === "customers" ||
        page.pageType === "how_it_works") &&
      snap.hero.headline
    ) {
      evidence.push({
        sourceUrl: page.finalUrl,
        excerpt: snap.hero.headline,
        interpretation: `Directly observed ${page.pageType.replace(/_/g, " ")} heading on supporting page.`,
        claimBasis: inferClaimBasis(snap.hero.headline, page),
      });
    }
  }

  if (evidence.length === 0) {
    return {
      status: "insufficient_evidence",
      assessment:
        "No additional customer testimonials, compliance disclosures, or company credibility statements were identified on the inspected supporting pages.",
      evidence: [],
    };
  }

  const hasPublished = evidence.some(
    (e) => e.claimBasis === "website_published_claim"
  );

  return {
    status: "observed",
    assessment: qualifyTrustAssessmentText(
      `Inspected supporting pages contain ${hasPublished ? "website-published credibility statements and proof elements" : "additional company and product information"}`,
      hasPublished
    ),
    evidence: evidence.slice(0, 3),
  };
}

/**
 * Evaluates the homepage's primary CTA destination safely using only verified homepage CTA links
 * and already-fetched supporting pages. Never follows auth, signup, checkout, or external flows.
 */
export function evaluatePrimaryCtaDestination(
  homepageSnapshot: WebsiteSnapshot,
  homepageFinalUrl: string,
  pagesByUrlKey: Map<
    string,
    { page: SupportingPageRecord; searchableTexts: string[] }
  >,
  rawAiCtaDestination?: RawSupportingContextAIOutput["ctaDestination"]
): {
  ctaDestination: SupportingCtaDestinationContext;
  limitationNote?: string;
} {
  const primaryCta: CTAItem | undefined =
    homepageSnapshot.hero.primaryCta ||
    homepageSnapshot.ctas.find((c) => c.type === "primary") ||
    homepageSnapshot.hero.secondaryCta;

  if (!primaryCta || !primaryCta.text) {
    return {
      ctaDestination: {
        inspectable: false,
        assessment:
          "No primary call-to-action link was identified on the homepage to inspect.",
        evidence: [],
      },
      limitationNote:
        "Homepage primary CTA destination could not be inspected because no primary CTA link was extracted.",
    };
  }

  const ctaText = primaryCta.text.trim();
  const rawHref = primaryCta.href?.trim();

  if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("javascript:")) {
    return {
      ctaDestination: {
        ctaText,
        destinationUrl: rawHref || undefined,
        inspectable: false,
        assessment: `The homepage primary CTA (“${ctaText}”) does not link to a separate inspectable URL.`,
        evidence: [],
      },
      limitationNote: `Primary CTA (“${ctaText}”) uses an in-page anchor or interactive trigger rather than a standalone supporting page.`,
    };
  }

  let resolvedUrl: string;
  try {
    resolvedUrl = new URL(rawHref, homepageFinalUrl).href;
  } catch {
    return {
      ctaDestination: {
        ctaText,
        destinationUrl: rawHref,
        inspectable: false,
        assessment: `The homepage primary CTA (“${ctaText}”) target URL could not be resolved safely.`,
        evidence: [],
      },
    };
  }

  // Check if CTA points to external domain / subdomain (e.g. app.domain.com/signup, calendly.com, etc.)
  if (!isSameWebsiteDomain(resolvedUrl, homepageFinalUrl)) {
    return {
      ctaDestination: {
        ctaText,
        destinationUrl: resolvedUrl,
        inspectable: false,
        assessment: `The homepage primary CTA (“${ctaText}”) points to a separate host or application domain (${resolvedUrl}), which is intentionally not followed during safe supporting-page inspection.`,
        evidence: [],
      },
      limitationNote: `Primary CTA (“${ctaText}”) points to a separate host (${resolvedUrl}) and was not followed.`,
    };
  }

  // Check if CTA points to an authentication, signup, checkout, or excluded interactive flow
  let pathname = "/";
  try {
    pathname = normalizeSupportingPathname(new URL(resolvedUrl).pathname);
  } catch {
    pathname = "/";
  }

  const exclusion = isExcludedSupportingPath(pathname, ctaText);
  if (exclusion.excluded) {
    return {
      ctaDestination: {
        ctaText,
        destinationUrl: resolvedUrl,
        inspectable: false,
        assessment: `The homepage primary CTA (“${ctaText}”) points to an account, signup, checkout, or non-supporting flow (${pathname}), which is intentionally not executed or crawled.`,
        evidence: [],
      },
      limitationNote: `Primary CTA (“${ctaText}” → ${pathname}) points to a signup, authentication, checkout, or utility flow that is intentionally not followed.`,
    };
  }

  // Check if the CTA destination is among the safely fetched supporting pages
  const targetKey = normalizeUrlKey(resolvedUrl, homepageFinalUrl);
  const matchedEntry = pagesByUrlKey.get(targetKey);

  if (!matchedEntry) {
    return {
      ctaDestination: {
        ctaText,
        destinationUrl: resolvedUrl,
        inspectable: false,
        assessment: `The homepage primary CTA (“${ctaText}”) links to ${pathname}, which was not among the fetched supporting pages in this check.`,
        evidence: [],
      },
      limitationNote: `Primary CTA destination (${pathname}) was not among the fetched supporting pages.`,
    };
  }

  const { page, searchableTexts } = matchedEntry;
  const homepageUrlKey = normalizeUrlKey(homepageFinalUrl, homepageFinalUrl);

  // Validate AI evidence for this specific CTA destination page
  let verifiedEvidence = validateSourceEvidenceList(
    rawAiCtaDestination?.evidence,
    new Map([[targetKey, matchedEntry]]),
    homepageUrlKey,
    homepageFinalUrl
  );

  // Fallback to deterministic evidence from the destination page's hero headline & primary CTA
  if (verifiedEvidence.length === 0) {
    if (page.snapshot.hero.headline) {
      verifiedEvidence.push({
        sourceUrl: page.finalUrl,
        excerpt: page.snapshot.hero.headline,
        interpretation: `Headline on the CTA destination page (${page.path}).`,
        claimBasis: "directly_observed_element",
      });
    }
    if (page.snapshot.hero.primaryCta?.text) {
      verifiedEvidence.push({
        sourceUrl: page.finalUrl,
        excerpt: page.snapshot.hero.primaryCta.text,
        interpretation: `Next-step action button on the CTA destination page (${page.path}).`,
        claimBasis: "directly_observed_element",
      });
    } else if (
      verifiedEvidence.length === 0 &&
      searchableTexts.length > 0 &&
      searchableTexts[0]
    ) {
      verifiedEvidence.push({
        sourceUrl: page.finalUrl,
        excerpt: searchableTexts[0],
        interpretation: `Observed content on the CTA destination page (${page.path}).`,
        claimBasis: "directly_observed_element",
      });
    }
  }

  const hasClearHeadline = Boolean(
    page.snapshot.hero.headline && page.snapshot.hero.headline.trim().length > 5
  );
  const hasNextCta = Boolean(
    page.snapshot.hero.primaryCta?.text || page.snapshot.ctas.length > 0
  );

  const purposeClear =
    typeof rawAiCtaDestination?.purposeClear === "boolean"
      ? rawAiCtaDestination.purposeClear
      : hasClearHeadline;
  const alignsWithCtaWording =
    typeof rawAiCtaDestination?.alignsWithCtaWording === "boolean"
      ? rawAiCtaDestination.alignsWithCtaWording
      : hasClearHeadline;
  const nextActionUnderstandable =
    typeof rawAiCtaDestination?.nextActionUnderstandable === "boolean"
      ? rawAiCtaDestination.nextActionUnderstandable
      : hasNextCta;

  const aiAssessment =
    typeof rawAiCtaDestination?.assessment === "string"
      ? rawAiCtaDestination.assessment.trim()
      : "";

  const assessment =
    aiAssessment && verifiedEvidence.length > 0
      ? aiAssessment
      : `The homepage primary CTA (“${ctaText}”) leads to ${page.path}, which displays ${
          page.snapshot.hero.headline
            ? `the heading “${page.snapshot.hero.headline.slice(0, 120)}”`
            : "supporting page content"
        }${
          page.snapshot.hero.primaryCta?.text
            ? ` and a clear next action (“${page.snapshot.hero.primaryCta.text}”).`
            : "."
        }`;

  return {
    ctaDestination: {
      ctaText,
      destinationUrl: page.finalUrl,
      inspectable: true,
      purposeClear,
      alignsWithCtaWording,
      nextActionUnderstandable,
      assessment,
      evidence: verifiedEvidence,
    },
  };
}

/**
 * Validates raw supporting-context AI output against the fetched supporting pages
 * and builds the final strictly typed `SupportingContext` result.
 */
export function validateAndBuildSupportingContext(
  homepageSnapshot: WebsiteSnapshot,
  homepageFinalUrl: string,
  bundle: SupportingPagesBundle,
  rawAiOutput: RawSupportingContextAIOutput | null,
  options: { aiErrorMessage?: string } = {}
): SupportingContext {
  const limitations: string[] = [];

  // Record any failed supporting-page fetch attempts honestly
  const failedAttempts = bundle.attempts.filter((a) => !a.success);
  for (const failed of failedAttempts) {
    limitations.push(
      `Supporting page ${failed.url} (${failed.pageType}) could not be analyzed: ${
        failed.message || failed.error || "fetch failed"
      }.`
    );
  }

  if (options.aiErrorMessage) {
    limitations.push(
      "AI supporting-context synthesis was unavailable; supporting findings reflect deterministic page extraction only."
    );
  }

  const homepageUrlKey = normalizeUrlKey(homepageFinalUrl, homepageFinalUrl);
  const pagesByUrlKey = new Map<
    string,
    { page: SupportingPageRecord; searchableTexts: string[] }
  >();

  for (const page of bundle.pages) {
    const searchableTexts = extractSearchableTextsFromSnapshot(page.snapshot);
    const key1 = normalizeUrlKey(page.url, homepageFinalUrl);
    const key2 = normalizeUrlKey(page.finalUrl, homepageFinalUrl);
    if (key1) pagesByUrlKey.set(key1, { page, searchableTexts });
    if (key2) pagesByUrlKey.set(key2, { page, searchableTexts });
  }

  const pagesAnalyzed: SupportingPageAnalyzedSummary[] = bundle.pages.map(
    (p) => ({
      url: p.finalUrl,
      category: p.pageType,
      ...(p.snapshot.meta.title
        ? { title: p.snapshot.meta.title }
        : p.snapshot.hero.headline
        ? { title: p.snapshot.hero.headline }
        : {}),
    })
  );

  // Evaluate primary CTA destination (works even if 0 supporting pages were fetched)
  const { ctaDestination, limitationNote: ctaLimitation } =
    evaluatePrimaryCtaDestination(
      homepageSnapshot,
      homepageFinalUrl,
      pagesByUrlKey,
      rawAiOutput?.ctaDestination
    );
  if (ctaLimitation) {
    limitations.push(ctaLimitation);
  }

  // If no supporting pages were successfully fetched, return unavailable status
  if (bundle.pages.length === 0) {
    if (bundle.discoveredCount === 0) {
      limitations.unshift(
        "No eligible same-domain supporting pages (such as pricing, features, product, customers, or about) were discovered on the homepage."
      );
    } else {
      limitations.unshift(
        "Supporting pages were discovered on the homepage, but none could be safely fetched within security and timeout limits."
      );
    }

    return {
      status: "unavailable",
      pagesAnalyzed: [],
      ctaDestination,
      limitations,
    };
  }

  // 1. Validate Message Consistency
  const verifiedConsistencyEvidence = validateSourceEvidenceList(
    rawAiOutput?.messageConsistency?.evidence,
    pagesByUrlKey,
    homepageUrlKey,
    homepageFinalUrl
  );

  let messageConsistency: SupportingContextSection;
  const rawConsistencyAssessment =
    typeof rawAiOutput?.messageConsistency?.assessment === "string"
      ? rawAiOutput.messageConsistency.assessment.trim()
      : "";

  if (rawConsistencyAssessment && verifiedConsistencyEvidence.length > 0) {
    const validStatuses = [
      "consistent",
      "clarifies_homepage",
      "divergent",
      "insufficient_evidence",
    ] as const;
    const rawStatus = rawAiOutput?.messageConsistency?.status;
    messageConsistency = {
      status:
        rawStatus && validStatuses.includes(rawStatus as any)
          ? rawStatus
          : "clarifies_homepage",
      assessment: rawConsistencyAssessment,
      evidence: verifiedConsistencyEvidence,
    };
  } else {
    messageConsistency = buildDeterministicMessageConsistency(
      homepageSnapshot,
      bundle.pages
    );
  }

  // 2. Validate Trust Context (enforcing website-published claim qualification)
  const verifiedTrustEvidence = validateSourceEvidenceList(
    rawAiOutput?.trustContext?.evidence,
    pagesByUrlKey,
    homepageUrlKey,
    homepageFinalUrl,
    { enforceClaimBasis: true }
  );

  let trustContext: SupportingContextSection;
  const rawTrustAssessment =
    typeof rawAiOutput?.trustContext?.assessment === "string"
      ? rawAiOutput.trustContext.assessment.trim()
      : "";

  if (rawTrustAssessment && verifiedTrustEvidence.length > 0) {
    const hasPublishedClaims = verifiedTrustEvidence.some(
      (e) => e.claimBasis === "website_published_claim"
    );
    trustContext = {
      status: "observed",
      assessment: qualifyTrustAssessmentText(
        rawTrustAssessment,
        hasPublishedClaims
      ),
      evidence: verifiedTrustEvidence,
    };
  } else {
    trustContext = buildDeterministicTrustContext(bundle.pages);
  }

  const status =
    failedAttempts.length > 0 || Boolean(options.aiErrorMessage)
      ? "partial"
      : "available";

  return {
    status,
    pagesAnalyzed,
    messageConsistency,
    trustContext,
    ctaDestination,
    limitations,
  };
}
