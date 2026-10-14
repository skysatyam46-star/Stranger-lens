import { WebsiteSnapshot } from "@/lib/content-extractor";
import { EvidenceRef } from "@/services/ai/analysisSchema";
import { ValidatedEvidenceRef } from "@/types/validatedAnalysis";
import { extractSearchableTextsFromSnapshot } from "@/services/ai/evidenceValidator";

/**
 * Normalizes text for lenient whitespace, line breaks, and punctuation matching.
 */
export function normalizeTextForMatching(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[^\w\s]/gi, "") // strip punctuation for normalized comparison
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Validates a single AI EvidenceRef against the WebsiteSnapshot.
 * Returns a ValidatedEvidenceRef with status 'verified' or 'rejected'.
 */
export function validateSingleEvidence(
  ref: EvidenceRef,
  snapshot: WebsiteSnapshot
): ValidatedEvidenceRef {
  if (!ref || !ref.text || typeof ref.text !== "string" || ref.text.trim().length === 0) {
    return {
      source: ref?.source || "unknown",
      element: ref?.element,
      text: ref?.text || "",
      reason: ref?.reason,
      relevance: ref?.relevance || "weak",
      status: "rejected",
    };
  }

  // Reject any evidence explicitly attributed to a non-homepage supporting page
  const rawSource = (ref.source || "").trim().toLowerCase();
  if (
    rawSource.startsWith("supporting") ||
    /^\/[a-z0-9_-]+/i.test(rawSource) ||
    /^https?:\/\//i.test(rawSource) ||
    /\b(pricing_page|features_page|about_page|customers_page|docs_page|security_page|supporting_page)\b/i.test(
      rawSource
    )
  ) {
    return {
      source: ref.source || "unknown",
      element: ref.element,
      text: ref.text.trim(),
      reason: ref.reason,
      relevance: "weak",
      status: "rejected",
    };
  }

  const rawAiText = ref.text.trim();
  const searchableTexts = extractSearchableTextsFromSnapshot(snapshot);

  // 1. Check for Exact Match
  for (const src of searchableTexts) {
    if (src.includes(rawAiText)) {
      return {
        source: ref.source || "website",
        element: ref.element,
        text: rawAiText,
        reason: ref.reason,
        relevance: ref.relevance || "strong",
        status: "verified",
        matchType: "exact",
      };
    }
  }

  // 2. Check for Normalized Match
  const normAiText = normalizeTextForMatching(rawAiText);
  if (!normAiText || normAiText.length < 2) {
    return {
      source: ref.source || "website",
      element: ref.element,
      text: rawAiText,
      reason: ref.reason,
      relevance: "weak",
      status: "rejected",
    };
  }

  // Reject AI meta-commentary paraphrases that were not exact matches in step 1
  const diagnosticParaphrasePattern =
    /\b(your homepage|the homepage|your website|the website|claims to|fails to|does not state|does not clearly|currently lacks|visitors see|without explaining|without stating)\b/i;
  if (diagnosticParaphrasePattern.test(rawAiText)) {
    return {
      source: ref.source || "website",
      element: ref.element,
      text: rawAiText,
      reason: ref.reason,
      relevance: "weak",
      status: "rejected",
    };
  }

  // Detect numeric additions or semantic fabrications (e.g., "10x" added when not in source)
  const aiDigits: string[] = rawAiText.match(/\d+(?:\.\d+)?/g) || [];

  for (const src of searchableTexts) {
    const normSrc = normalizeTextForMatching(src);
    if (!normSrc) continue;

    // A valid quote must either be contained inside a source text fragment,
    // or a substantial source fragment (>=25 chars) must account for >=80% of the candidate quote.
    const isDirectSubstring = normSrc.includes(normAiText);
    const isSubstantialCover =
      normSrc.length >= 25 &&
      normAiText.includes(normSrc) &&
      normSrc.length >= Math.ceil(normAiText.length * 0.8);

    if (isDirectSubstring || isSubstantialCover) {
      // Check numeric integrity: if AI added a digit that does not exist in source text, REJECT as semantic fabrication
      const srcDigits: string[] = src.match(/\d+(?:\.\d+)?/g) || [];
      const hasAddedDigit = aiDigits.some((d) => !srcDigits.includes(d));

      if (hasAddedDigit) {
        // AI added a numeric claim like "10x" not in source -> REJECT!
        return {
          source: ref.source || "website",
          element: ref.element,
          text: rawAiText,
          reason: ref.reason,
          relevance: ref.relevance || "weak",
          status: "rejected",
        };
      }

      return {
        source: ref.source || "website",
        element: ref.element,
        text: rawAiText,
        reason: ref.reason,
        relevance: ref.relevance || "moderate",
        status: "verified",
        matchType: "normalized",
      };
    }
  }

  // Not found in snapshot -> REJECT
  return {
    source: ref.source || "website",
    element: ref.element,
    text: rawAiText,
    reason: ref.reason,
    relevance: ref.relevance || "weak",
    status: "rejected",
  };
}

/**
 * Validates an array of EvidenceRef objects, returning only verified evidence items
 * for inclusion in findings, while attaching verified status.
 */
export function validateEvidenceList(
  refs: EvidenceRef[] | undefined,
  snapshot: WebsiteSnapshot,
  keepOnlyVerified = true
): ValidatedEvidenceRef[] {
  if (!Array.isArray(refs)) return [];

  const validatedList = refs.map((ref) => validateSingleEvidence(ref, snapshot));

  if (keepOnlyVerified) {
    return validatedList.filter((v) => v.status === "verified");
  }

  return validatedList;
}

const EXPLICIT_AUDIENCE_PATTERNS: RegExp[] = [
  /\b(?:built|designed|made|created|tailored|engineered|crafted|ideal|perfect|purpose-built)\s+for\s+[a-z0-9\s,&-]{3,}/i,
  /\bfor\s+(?:[a-z0-9-]+\s+){0,4}(?:teams|companies|businesses|enterprises|startups|agencies|founders|creators|developers|engineers|designers|marketers|sales|revops|operators|leaders|executives|professionals|freelancers|consultants|writers|researchers|scientists|clinicians|doctors|patients|students|teachers|educators|parents|gamers|traders|investors|shoppers|consumers|users|organizations|brands|stores|merchants|hosts|builders|makers|astrologers)\b/i,
  /\b(?:b2b|b2c|saas\s+teams|sales\s+teams|revenue\s+teams|product\s+teams|engineering\s+teams|design\s+teams|modern\s+teams|creators|developers|engineers|designers|marketers|founders|entrepreneurs|agencies|enterprises|small\s+businesses|freelancers|students|educators|researchers|clinicians|investors)\b/i,
  /\b(?:trusted|used|loved|chosen|backed)\s+by\s+(?:[\d,.+kmb]+\s+)?(?:[a-z0-9-]+\s+){0,3}(?:teams|companies|businesses|enterprises|startups|agencies|founders|creators|developers|engineers|designers|marketers|users|customers|clients|organizations|leaders|brands|professionals)\b/i,
  /\b(?:helps|empowers|enables|lets|allows)\s+(?:[a-z0-9-]+\s+){0,3}(?:teams|companies|businesses|creators|developers|designers|marketers|founders|users|professionals|organizations|sales|engineers)\b/i,
];

/**
 * Determines whether verified evidence items or the snapshot explicitly identify a target audience,
 * customer segment, or user role, as opposed to generic second-person copy ("your birth").
 */
export function hasExplicitAudienceEvidence(
  input: string | ValidatedEvidenceRef[] | undefined,
  snapshot?: WebsiteSnapshot
): boolean {
  if (typeof input === "string") {
    const cleaned = input.trim();
    if (!cleaned) return false;
    return EXPLICIT_AUDIENCE_PATTERNS.some((re) => re.test(cleaned));
  }

  const candidateTexts: string[] = [];
  if (Array.isArray(input)) {
    for (const item of input) {
      if (item && typeof item.text === "string" && item.text.trim()) {
        candidateTexts.push(item.text.trim());
      }
    }
  }
  if (snapshot) {
    if (snapshot.hero?.headline) candidateTexts.push(snapshot.hero.headline);
    if (snapshot.hero?.subheadline) candidateTexts.push(snapshot.hero.subheadline);
  }

  return candidateTexts.some((txt) => EXPLICIT_AUDIENCE_PATTERNS.some((re) => re.test(txt)));
}

const EXPLICIT_PRODUCT_CATEGORY_PATTERNS: RegExp[] = [
  /\b(?:platform|software|tool|tools|app|application|service|calculator|analyzer|scanner|generator|builder|assistant|engine|dashboard|workspace|crm|api|sdk|library|extension|plugin|marketplace|agency|studio|course|newsletter|community|database|directory|report|tracker|monitor|checker|audit|diagnostic|automation|analytics|operations|workflows?|system|suite|portal|network|solution)\b/i,
  /\b(?:build|deploy|automate|track|manage|monitor|analyze|calculate|generate|create|design|host|streamline|sync|route|schedule|publish|accept|process|verify|test|audit)\s+(?:your\s+|stunning\s+|modern\s+|real-time\s+|custom\s+|ai\s+)*[a-z0-9-]+\s*(?:websites?|pages?|workflows?|operations|analytics|campaigns?|leads?|deals?|payments?|invoices?|projects?|apps?|code|pipelines?|data|charts?|profiles?|scores?|reports?|listings?|stores?)\b/i,
];

/**
 * Determines whether a verified source quote explicitly names a product category,
 * tool type, or concrete functional mechanism, rather than an abstract curiosity hook
 * (such as "Find what makes your birth unusual.").
 */
export function hasExplicitProductCategoryEvidence(
  input: string | ValidatedEvidenceRef[] | undefined,
  snapshot?: WebsiteSnapshot
): boolean {
  if (typeof input === "string") {
    const cleaned = input.trim();
    if (!cleaned) return false;
    return EXPLICIT_PRODUCT_CATEGORY_PATTERNS.some((re) => re.test(cleaned));
  }

  const candidateTexts: string[] = [];
  if (Array.isArray(input)) {
    for (const item of input) {
      if (item && typeof item.text === "string" && item.text.trim()) {
        candidateTexts.push(item.text.trim());
      }
    }
  }
  if (snapshot) {
    if (snapshot.hero?.headline) candidateTexts.push(snapshot.hero.headline);
    if (snapshot.hero?.subheadline) candidateTexts.push(snapshot.hero.subheadline);
  }

  return candidateTexts.some((txt) =>
    EXPLICIT_PRODUCT_CATEGORY_PATTERNS.some((re) => re.test(txt))
  );
}

/**
 * Evaluates whether verified evidence items genuinely provide strong direct support
 * for a given dimension or if the dimension is only weakly supported or unsupported.
 */
export function evaluateEvidenceRelevanceForDimension(
  dimension: "first_impression" | "audience" | "value" | "trust" | "action" | string,
  verifiedEvidence: ValidatedEvidenceRef[],
  snapshot?: WebsiteSnapshot
): "supported" | "weak" | "unsupported" {
  if (dimension === "audience") {
    if (hasExplicitAudienceEvidence(verifiedEvidence, snapshot)) {
      return "supported";
    }
    return "unsupported";
  }

  if (dimension === "first_impression") {
    if (hasExplicitProductCategoryEvidence(verifiedEvidence, snapshot)) {
      return "supported";
    }
    if (verifiedEvidence.length > 0 || Boolean(snapshot?.hero?.headline)) {
      return "weak";
    }
    return "unsupported";
  }

  return "supported";
}
