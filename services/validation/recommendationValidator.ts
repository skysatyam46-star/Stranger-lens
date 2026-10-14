import { WebsiteSnapshot } from "@/lib/content-extractor";
import { EvidenceRef } from "@/services/ai/analysisSchema";
import { ValidatedEvidenceRef } from "@/types/validatedAnalysis";
import { extractSearchableTextsFromSnapshot } from "@/services/ai/evidenceValidator";
import { validateEvidenceList } from "./evidenceValidator";

export interface PriorityFixInput {
  title: string;
  reason: string;
  impact?: "high" | "medium";
  what_you_say_now?: string;
  clearer_direction?: string;
  current_direction?: string;
  suggested_direction?: string;
  evidence_refs?: EvidenceRef[];
}

export interface OtherImprovementInput {
  title: string;
  explanation: string;
  why_it_matters?: string;
  what_to_improve?: string;
  copyable_suggestion?: string;
  evidence_refs?: EvidenceRef[];
}

const GENERIC_RECOMMENDATION_TITLES = [
  "improve your website",
  "make it better",
  "fix website",
  "update copy",
  "redesign page",
  "improve ux",
];

/**
 * Detects repetitive words, repeated phrases/sentences, nonsensical AI output,
 * or accidentally leaked raw environment-variable tokens.
 */
export function hasRepetitiveOrNonsensicalText(rawText: string | undefined): boolean {
  if (!rawText || typeof rawText !== "string") return true;
  const text = rawText.replace(/\s+/g, " ").trim();
  if (text.length < 8) return true;

  // 1. Reject leaked environment variable names or code/JSON artifacts
  if (
    /\b(?:NEXT_PUBLIC_[A-Z0-9_]+|process\.env\.[A-Za-z0-9_]+|GEMINI_API_KEY|GROQ_API_KEY|PADDLE_[A-Z0-9_]+|OPENAI_API_KEY)\b/.test(
      text
    ) ||
    /^(?:\{|\[|```|undefined|null|NaN\b)/i.test(text) ||
    /\b(?:lorem ipsum|asdf|qwerty|placeholder text|insert text here)\b/i.test(text)
  ) {
    return true;
  }

  // 2. Reject immediate consecutive repeated words (e.g. "clarity clarity", "the the", "value value")
  if (/\b([a-z]{3,})\s+\1\b/i.test(text)) {
    return true;
  }

  // 3. Reject repeated 3-word phrases within the same text block
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length >= 6) {
    const trigrams = new Map<string, number>();
    for (let i = 0; i <= words.length - 3; i++) {
      const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      const nextCount = (trigrams.get(trigram) || 0) + 1;
      if (nextCount >= 2) {
        return true;
      }
      trigrams.set(trigram, nextCount);
    }
  }

  // 4. Reject excessive single-word repetition in longer sentences
  const contentWords = words.filter((w) => w.length >= 4);
  if (contentWords.length >= 8) {
    const counts = new Map<string, number>();
    for (const w of contentWords) {
      const c = (counts.get(w) || 0) + 1;
      if (c >= 4 || c / contentWords.length > 0.35) {
        return true;
      }
      counts.set(w, c);
    }
  }

  // 5. Reject duplicate sentences
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim())
    .filter((s) => s.length >= 12);
  if (sentences.length >= 2) {
    const uniqueSentences = new Set(sentences);
    if (uniqueSentences.size < sentences.length) {
      return true;
    }
  }

  return false;
}

/**
 * Sanitizes an explanation to ensure it is non-repetitive, free of raw env var tokens,
 * and concise (max 2 sentences / maxChars). Falls back to `fallbackText` if invalid.
 */
export function sanitizeConciseExplanation(
  rawText: string | undefined,
  fallbackText: string,
  maxSentences = 2,
  maxChars = 260
): string {
  if (!rawText || hasRepetitiveOrNonsensicalText(rawText)) {
    return fallbackText;
  }

  const cleaned = rawText.replace(/\s+/g, " ").trim();
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  let concise = sentences.slice(0, maxSentences).join(" ");
  if (concise.length > maxChars) {
    if (sentences[0] && sentences[0].length <= maxChars) {
      concise = sentences[0];
    } else {
      const truncated = concise.slice(0, maxChars - 1).replace(/\s+\S*$/, "").trim();
      concise = /[.!?]$/.test(truncated) ? truncated : `${truncated}.`;
    }
  }

  return /[.!?]$/.test(concise) ? concise : `${concise}.`;
}

/**
 * Checks whether a recommendation or suggested replacement introduces
 * unverified statistics, customer counts, ratings, certifications,
 * testimonials, or guarantees that do not exist in the WebsiteSnapshot.
 */
export function containsUnverifiedFabricatedClaim(
  candidateText: string | undefined,
  snapshot: WebsiteSnapshot
): boolean {
  if (!candidateText || !candidateText.trim()) return false;
  const text = candidateText.trim();
  const searchablePool = extractSearchableTextsFromSnapshot(snapshot)
    .join(" ")
    .toLowerCase();

  // 1. Check any numbers in candidateText that are tied to metrics, percentages, multipliers, datasets, or social proof
  const metricNumberPatterns: RegExp[] = [
    /\b(\d[\d,.]*[kmb]?)\+?\s*(?:users|customers|teams|companies|clients|developers|businesses|creators|organizations|downloads|reviews|stars|countries|enterprises|leaders|brands|profiles|records|charts|analyses|datasets|data\s+points|scans|reports|websites|accounts|members|subscribers|patients|students|professionals|experts|scientists)\b/gi,
    /\b(\d+(?:\.\d+)?)%\b/gi,
    /\b(\d+(?:\.\d+)?)x\b/gi,
    /\$(\d[\d,.]*[kmb]?)\b/gi,
    /\bfortune\s*(\d+)\b/gi,
    /\b(\d+)\s*-\s*day\s+(?:free\s+)?trial\b/gi,
  ];

  for (const regex of metricNumberPatterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const fullToken = match[0].toLowerCase().trim();
      const rawNumber = (match[1] || "").toLowerCase().trim();
      if (
        !searchablePool.includes(fullToken) &&
        (!rawNumber || !searchablePool.includes(rawNumber))
      ) {
        return true;
      }
    }
  }

  // 2. Check written quantities (e.g., "thousands of customers", "millions of profiles", "hundreds of teams", "X million", "5 million")
  const writtenQuantityRegex =
    /\b(?:(dozens|hundreds|thousands|tens\s+of\s+thousands|hundreds\s+of\s+thousands|millions|billions|trillions|countless)\s+of|(\d[\d,.]*|[xXnN])\s+(?:million|billion|thousand|trillion))\b/gi;
  let wMatch: RegExpExecArray | null;
  while ((wMatch = writtenQuantityRegex.exec(text)) !== null) {
    const phrase = wMatch[0].toLowerCase().replace(/\s+/g, " ").trim();
    const qtyWord = (wMatch[1] || wMatch[2] || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (!searchablePool.includes(phrase) && (!qtyWord || !searchablePool.includes(qtyWord))) {
      return true;
    }
  }

  // 2b. Check fabricated "verified database", revenue/conversion statistics, and unsupported capabilities
  const unverifiedClaimPatterns: Array<{ pattern: RegExp; poolCheck: RegExp }> = [
    {
      pattern: /\b(?:verified\s+database|database\s+of\s+(?:[xXnN]|\d|millions|thousands|hundreds)|verified\s+(?:profiles|records|dataset|users|customers))\b/i,
      poolCheck: /\b(?:verified\s+database|verified\s+profiles|verified\s+records|verified\s+dataset)\b/i,
    },
    {
      pattern: /\b(?:increase\s+(?:conversions?|revenue|sales)\s+by|boost\s+(?:conversions?|revenue|sales)|double\s+your\s+(?:revenue|conversions?)|(?:\d+x|10x)\s+(?:roi|revenue|conversions?))\b/i,
      poolCheck: /\b(?:increase\s+conversions|boost\s+conversions|increase\s+revenue|boost\s+revenue|roi)\b/i,
    },
    {
      pattern: /\b(?:comparison\s+charts|real-time\s+predictive\s+analytics|ai-powered\s+forecasting\s+engine)\b/i,
      poolCheck: /\b(?:comparison\s+charts|real-time\s+predictive\s+analytics|ai-powered\s+forecasting\s+engine)\b/i,
    },
  ];

  for (const check of unverifiedClaimPatterns) {
    if (check.pattern.test(text) && !check.poolCheck.test(searchablePool)) {
      return true;
    }
  }

  // 3. Check ratings, awards, security certifications, scientific validation, accuracy, superlatives, and trial/guarantee promises
  const claimChecks: Array<{ pattern: RegExp; poolCheck: RegExp }> = [
    {
      pattern: /\b(?:4\.\d\/5|5-star|#1\s+rated|award-winning|g2\s+leader)\b/i,
      poolCheck: /\b(?:4\.\d\/5|5-star|#1\s+rated|award-winning|g2)\b/i,
    },
    {
      pattern: /\b(?:soc\s*2|iso\s*27001|hipaa|gdpr\s+compliant|pci-dss|bank-grade|military-grade)\b/i,
      poolCheck: /\b(?:soc\s*2|soc2|iso\s*27001|hipaa|gdpr|pci-dss|bank-grade|military-grade)\b/i,
    },
    {
      pattern: /\b(?:no credit card required|instant setup|100%\s+guaranteed|money-back guarantee|risk-free trial|free forever)\b/i,
      poolCheck: /\b(?:no credit card|instant setup|100%\s+guaranteed|money-back|risk-free|free forever)\b/i,
    },
    {
      pattern: /\b(?:exact\s+mathematical|mathematically\s+(?:proven|verified|exact)|scientifically\s+(?:proven|validated|verified)|clinically\s+(?:proven|validated)|peer-reviewed|independently\s+verified|verified\s+by\s+experts|100%\s+accurate|guaranteed\s+accuracy|proven\s+to\s+increase)\b/i,
      poolCheck: /\b(?:exact\s+mathematical|mathematically\s+proven|scientifically\s+proven|clinically\s+proven|peer-reviewed|100%\s+accurate)\b/i,
    },
    {
      pattern: /\b(?:world's\s+(?:largest|first|most|best|only|leading)|largest\s+(?:global\s+)?database|global\s+astronomical\s+profiles|official\s+partner\s+of|industry-leading|market-leading)\b/i,
      poolCheck: /\b(?:world's\s+(?:largest|first|most|best|only|leading)|largest\s+(?:global\s+)?database|global\s+astronomical\s+profiles|official\s+partner|industry-leading|market-leading)\b/i,
    },
  ];

  for (const check of claimChecks) {
    if (check.pattern.test(text) && !check.poolCheck.test(searchablePool)) {
      return true;
    }
  }

  // Never allow suggestions to claim independent verification even if numbers exist on the homepage
  if (/\b(?:independently\s+verified|verified\s+fact|proven\s+fact)\b/i.test(text)) {
    return true;
  }

  // 4. Check for fabricated testimonial attributions (e.g., "... - Sarah, CEO")
  const fakeTestimonialAttribution =
    /\s+[-–—]\s*[A-Z][a-zA-Z\s,.'"]*\b(?:CEO|Founder|Co-Founder|CTO|VP|Director|Manager|Head|Customer|Client|Engineer)\b/;
  if (fakeTestimonialAttribution.test(text)) {
    const hasMatchingTestimonial = (snapshot.trustSignals?.testimonials || []).some(
      (t) =>
        (t.author && text.toLowerCase().includes(t.author.toLowerCase())) ||
        (t.quote && text.toLowerCase().includes(t.quote.toLowerCase()))
    );
    if (!hasMatchingTestimonial) {
      return true;
    }
  }

  return false;
}

/**
 * Attempts to remove unsupported quantitative, scientific, or verification clauses
 * from a suggested copy string while preserving legitimate source-supported copy.
 * Returns null if the suggestion cannot be safely sanitized.
 */
export function sanitizeSuggestedCopy(
  candidateText: string | undefined,
  snapshot: WebsiteSnapshot
): string | null {
  if (!candidateText || !candidateText.trim()) return null;

  const searchablePool = extractSearchableTextsFromSnapshot(snapshot)
    .join(" ")
    .toLowerCase();

  let cleaned = candidateText
    .trim()
    .replace(/\b(?:independently\s+verified|verified\s+fact|proven\s+fact)\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!searchablePool.includes("exact mathematical")) {
    cleaned = cleaned.replace(/\bexact\s+mathematical\s+/gi, "");
  }
  if (!searchablePool.includes("scientifically proven")) {
    cleaned = cleaned.replace(/\bscientifically\s+(?:proven|validated|verified)\s+/gi, "");
  }

  if (!containsUnverifiedFabricatedClaim(cleaned, snapshot)) {
    return cleaned.length >= 6 ? cleaned : null;
  }

  // Try stripping trailing unsupported comparison or scale clauses (e.g. "compared to thousands of global astronomical profiles")
  const clauseStripped = cleaned
    .replace(
      /\s*(?:,\s*)?(?:compared\s+to|across|against|backed\s+by|trusted\s+by|used\s+by|from\s+a\s+database\s+of|among)\s+(?:the\s+)?(?:dozens|hundreds|thousands|tens\s+of\s+thousands|hundreds\s+of\s+thousands|millions|billions|trillions|\d[\d,.]*[kmb]?\+?)[^.!?]*/gi,
      ""
    )
    .replace(
      /\s*\([^)]*(?:no credit card|instant setup|soc\s*2|iso\s*27001|guaranteed|free forever|\d+%)[^)]*\)/gi,
      ""
    )
    .replace(/\s+([.!?])$/, "$1")
    .replace(/\s+/g, " ")
    .trim();

  const words = clauseStripped.split(/\s+/).filter(Boolean);
  if (
    clauseStripped.length >= 18 &&
    words.length >= 4 &&
    !containsUnverifiedFabricatedClaim(clauseStripped, snapshot)
  ) {
    return /[.!?→]$/.test(clauseStripped) ? clauseStripped : `${clauseStripped}.`;
  }

  return null;
}

function buildFallbackPriorityFixForWeakness(
  brand: string,
  heroText: string,
  hasHeroOrTitle: boolean,
  weakestSignalKey?: string
) {
  let fallbackTitle = "Clarify primary value proposition in hero headline";
  let fallbackReason =
    "First-time visitors decide whether to stay within the first few seconds of scanning the hero headline.";
  let fallbackDirection = `State clearly what ${brand} accomplishes for the visitor in plain language.`;

  if (weakestSignalKey === "trust") {
    fallbackTitle = "Add verifiable proof and credibility context";
    fallbackReason =
      "Visitors can scan the initial premise, but limited verifiable proof or customer evidence in the accessible homepage content reduces credibility.";
    fallbackDirection =
      "If you have verified customer feedback, recognizable client logos, or methodology credentials, consider displaying them near the primary call to action.";
  } else if (weakestSignalKey === "audience") {
    fallbackTitle = "Explicitly define who this product is built for";
    fallbackReason =
      "Visitors cannot immediately tell from the accessible hero copy if this product is designed for their specific role or use case.";
    fallbackDirection = `Add clear audience framing in the hero section stating who ${brand} serves.`;
  } else if (weakestSignalKey === "action") {
    fallbackTitle = "Clarify the primary next action and call to action";
    fallbackReason =
      "First-time visitors hesitate when the primary entry path or next step is ambiguous.";
    fallbackDirection = `Make the primary button action obvious and directly tied to ${brand}'s core outcome.`;
  } else if (weakestSignalKey === "value") {
    fallbackTitle = "Make the primary visitor outcome more concrete";
    fallbackReason =
      "Visitors evaluate solutions based on the specific outcome they will achieve rather than abstract descriptions.";
    fallbackDirection = `State clearly the primary outcome ${brand} delivers for its target users.`;
  }

  return {
    title: fallbackTitle,
    reason: fallbackReason,
    impact: "high" as const,
    what_you_say_now: hasHeroOrTitle ? heroText : "Current headline excerpt unavailable",
    clearer_direction: fallbackDirection,
    current_direction: hasHeroOrTitle ? heroText : "Current headline excerpt unavailable",
    suggested_direction: fallbackDirection,
    evidence_available: hasHeroOrTitle,
    evidence: [] as ValidatedEvidenceRef[],
  };
}

/**
 * Validates Priority Fix object against WebsiteSnapshot.
 */
export function validatePriorityFix(
  priorityFix: PriorityFixInput | undefined,
  snapshot: WebsiteSnapshot,
  weakestSignalKey?: string,
  weakestSignalScore?: number,
  allSignalScores?: Record<string, number>
): {
  title: string;
  reason: string;
  impact: "high" | "medium";
  what_you_say_now: string;
  clearer_direction: string;
  current_direction: string;
  suggested_direction: string;
  evidence_available: boolean;
  evidence: ValidatedEvidenceRef[];
} {
  const brand = snapshot.navigation.brandName || "the website";
  const hasHeroOrTitle = Boolean(
    (snapshot.hero.headline && snapshot.hero.headline.trim()) ||
      (snapshot.meta.title && snapshot.meta.title.trim())
  );
  const heroText = snapshot.hero.headline
    ? `${snapshot.hero.headline}${snapshot.hero.subheadline ? " — " + snapshot.hero.subheadline : ""}`
    : snapshot.meta.title || "Current headline excerpt unavailable";

  const rawTitle = (priorityFix?.title || "").trim();
  const isGenericTitle =
    !rawTitle ||
    hasRepetitiveOrNonsensicalText(rawTitle) ||
    GENERIC_RECOMMENDATION_TITLES.some(
      (g) => rawTitle.toLowerCase() === g || rawTitle.toLowerCase().includes(g)
    );

  // Check if AI's priority_fix targets an already-clear signal (>=80) while ignoring a severely weak signal (<50)
  let isMisalignedWithWeakest = false;
  if (
    !isGenericTitle &&
    weakestSignalKey &&
    weakestSignalScore !== undefined &&
    weakestSignalScore < 50 &&
    allSignalScores
  ) {
    const lowerTitle = rawTitle.toLowerCase();
    const targetsTrust = /\b(trust|proof|testimonial|logo|credential|social proof)\b/.test(lowerTitle);
    const targetsAudience = /\b(audience|persona|who it is for|built for)\b/.test(lowerTitle);
    const targetsAction = /\b(cta|call to action|button label)\b/.test(lowerTitle);

    if (targetsTrust && (allSignalScores.trust ?? 0) >= 80 && weakestSignalKey !== "trust") {
      isMisalignedWithWeakest = true;
    } else if (
      targetsAudience &&
      (allSignalScores.audience ?? 0) >= 80 &&
      weakestSignalKey !== "audience"
    ) {
      isMisalignedWithWeakest = true;
    } else if (
      targetsAction &&
      (allSignalScores.action ?? 0) >= 80 &&
      weakestSignalKey !== "action"
    ) {
      isMisalignedWithWeakest = true;
    }
  }

  if (!priorityFix || isGenericTitle || isMisalignedWithWeakest) {
    return buildFallbackPriorityFixForWeakness(
      brand,
      heroText,
      hasHeroOrTitle,
      weakestSignalKey
    );
  }

  const verifiedEvidence = validateEvidenceList(priorityFix.evidence_refs, snapshot, true);
  const rawWhatYouSay = priorityFix.what_you_say_now || priorityFix.current_direction || "";

  // Ground what_you_say_now: ONLY use verified source quotes or actual extracted hero text.
  // Never pass unverified AI paraphrases as source quotes.
  let groundedWhatYouSay = hasHeroOrTitle ? heroText : "Current headline excerpt unavailable";
  if (rawWhatYouSay.trim()) {
    const checkEv = validateEvidenceList([{ source: "hero", text: rawWhatYouSay }], snapshot, true);
    if (checkEv.length > 0) {
      groundedWhatYouSay = rawWhatYouSay.trim();
    } else if (verifiedEvidence.length > 0 && verifiedEvidence[0].text) {
      groundedWhatYouSay = verifiedEvidence[0].text;
    }
  } else if (verifiedEvidence.length > 0 && verifiedEvidence[0].text) {
    groundedWhatYouSay = verifiedEvidence[0].text;
  }

  const rawClearerDirection =
    priorityFix.clearer_direction ||
    priorityFix.suggested_direction ||
    `Clarify main benefit for ${brand}`;

  // Sanitize clearer_direction against fabricated statistics, testimonials, certifications, guarantees, or repetition
  let clearerDirection = rawClearerDirection.trim();
  const sanitizedPrimaryCopy = !hasRepetitiveOrNonsensicalText(clearerDirection)
    ? sanitizeSuggestedCopy(clearerDirection, snapshot)
    : null;
  if (sanitizedPrimaryCopy) {
    clearerDirection = sanitizedPrimaryCopy;
  } else {
    const isTrustFocused =
      weakestSignalKey === "trust" ||
      /\b(trust|proof|testimonial|logo|credential|social proof|case study)\b/i.test(rawTitle);

    clearerDirection = isTrustFocused
      ? "If you have verified customer feedback, case studies, or recognizable client logos, consider displaying them near the primary call to action."
      : `State clearly what ${brand} does, who it serves, and the primary outcome visitors can expect.`;
  }

  const impact =
    weakestSignalScore !== undefined && weakestSignalScore < 65
      ? "high"
      : priorityFix.impact || (weakestSignalKey ? "high" : "medium");

  const sanitizedReason = sanitizeConciseExplanation(
    priorityFix.reason && !containsUnverifiedFabricatedClaim(priorityFix.reason, snapshot)
      ? priorityFix.reason
      : undefined,
    "Helps first-time visitors immediately classify the product value."
  );

  return {
    title: rawTitle,
    reason: sanitizedReason,
    impact,
    what_you_say_now: groundedWhatYouSay,
    clearer_direction: clearerDirection,
    current_direction: groundedWhatYouSay,
    suggested_direction: clearerDirection,
    evidence_available: verifiedEvidence.length > 0 || Boolean(snapshot.hero.headline),
    evidence: verifiedEvidence,
  };
}

/**
 * Validates array of Other Improvements. Filters out generic titles, avoids duplicating priority fix,
 * strips fabricated statistics/claims, prevents contradicting clear signals, and limits max count to 3.
 */
export function validateOtherImprovements(
  improvements: OtherImprovementInput[] | undefined,
  snapshot: WebsiteSnapshot,
  priorityFixTitle?: string,
  allSignalScores?: Record<string, number>
): Array<{
  title: string;
  explanation: string;
  why_it_matters?: string;
  what_to_improve?: string;
  copyable_suggestion?: string;
  evidence_available: boolean;
  evidence: ValidatedEvidenceRef[];
}> {
  if (!Array.isArray(improvements)) return [];

  const validList: Array<{
    title: string;
    explanation: string;
    why_it_matters?: string;
    what_to_improve?: string;
    copyable_suggestion?: string;
    evidence_available: boolean;
    evidence: ValidatedEvidenceRef[];
  }> = [];

  const seenTitles = new Set<string>();
  if (priorityFixTitle) {
    seenTitles.add(priorityFixTitle.toLowerCase().trim());
  }

  for (const item of improvements) {
    if (validList.length >= 3) break; // Maximum 3 recommendations
    if (!item || !item.title || hasRepetitiveOrNonsensicalText(item.title)) continue;

    const lowerTitle = item.title.toLowerCase().trim();

    // Skip generic recommendations
    if (GENERIC_RECOMMENDATION_TITLES.some((g) => lowerTitle === g || lowerTitle.includes(g))) {
      continue;
    }

    // Skip recommendations that claim a signal is missing/unclear when that signal is already strong (>= 85)
    if (allSignalScores) {
      if (
        /\b(missing cta|no call to action|unclear cta|no primary button)\b/i.test(lowerTitle) &&
        (allSignalScores.action ?? 0) >= 80
      ) {
        continue;
      }
      if (
        /\b(no target audience|missing audience|unclear who it is for)\b/i.test(lowerTitle) &&
        (allSignalScores.audience ?? 0) >= 80
      ) {
        continue;
      }
    }

    // Skip duplicate or repetitive titles
    if (seenTitles.has(lowerTitle)) continue;

    // Check similarity with already added titles
    const isTooSimilar = Array.from(seenTitles).some(
      (existing) =>
        (lowerTitle.length > 10 && existing.includes(lowerTitle)) ||
        (existing.length > 10 && lowerTitle.includes(existing))
    );
    if (isTooSimilar) continue;

    seenTitles.add(lowerTitle);

    const verifiedEv = validateEvidenceList(item.evidence_refs, snapshot, true);

    // Provide contextual defaults if missing (without fabricating claims or metrics)
    let whyItMatters =
      item.why_it_matters &&
      !hasRepetitiveOrNonsensicalText(item.why_it_matters) &&
      !containsUnverifiedFabricatedClaim(item.why_it_matters, snapshot)
        ? sanitizeConciseExplanation(item.why_it_matters, "")
        : undefined;
    let whatToImprove =
      item.what_to_improve && !hasRepetitiveOrNonsensicalText(item.what_to_improve)
        ? item.what_to_improve
        : undefined;
    let copyableSuggestion = item.copyable_suggestion;

    const lowerCombined = `${item.title} ${item.explanation}`.toLowerCase();

    if (!whyItMatters) {
      if (lowerCombined.includes("trust") || lowerCombined.includes("proof") || lowerCombined.includes("credential")) {
        whyItMatters = "First-time visitors look for verifiable proof that others rely on this product before committing attention.";
      } else if (lowerCombined.includes("audience") || lowerCombined.includes("who") || lowerCombined.includes("for")) {
        whyItMatters = "Visitors bounce quickly if they cannot tell whether the product was built for their specific role or use case.";
      } else if (lowerCombined.includes("action") || lowerCombined.includes("cta") || lowerCombined.includes("button")) {
        whyItMatters = "Unclear button labels or ambiguous commitments create hesitation at the primary conversion step.";
      } else {
        whyItMatters = "Visitors evaluate solutions based on tangible outcomes achieved, not features listed.";
      }
    }

    if (!whatToImprove || containsUnverifiedFabricatedClaim(whatToImprove, snapshot)) {
      if (lowerCombined.includes("trust") || lowerCombined.includes("proof") || lowerCombined.includes("testimonial")) {
        whatToImprove =
          "If you have verified customer feedback, recognizable client logos, or methodology credentials, consider placing them near the primary CTA.";
      } else if (lowerCombined.includes("audience") || lowerCombined.includes("who")) {
        whatToImprove = "Add a clear audience tag or role qualifier directly above or below the main headline.";
      } else if (lowerCombined.includes("action") || lowerCombined.includes("cta")) {
        whatToImprove = "Use concrete, low-friction action copy and clarify what occurs immediately after clicking.";
      } else {
        whatToImprove = "Restate the primary message to emphasize the visitor's concrete outcome.";
      }
    } else {
      whatToImprove = sanitizeConciseExplanation(
        whatToImprove,
        "Restate the primary message to emphasize the visitor's concrete outcome."
      );
    }

    // Never invent fallback copyable_suggestion templates with fake claims,
    // and strip or sanitize any AI-provided copyable_suggestion that contains unverified statistics/guarantees.
    if (copyableSuggestion) {
      const sanitizedSuggestion = !hasRepetitiveOrNonsensicalText(copyableSuggestion)
        ? sanitizeSuggestedCopy(copyableSuggestion, snapshot)
        : null;
      copyableSuggestion = sanitizedSuggestion || undefined;
    }

    const cleanExplanation = sanitizeConciseExplanation(
      item.explanation && !containsUnverifiedFabricatedClaim(item.explanation, snapshot)
        ? item.explanation
        : undefined,
      "Improves visitor comprehension and reduces decision friction."
    );

    validList.push({
      title: item.title,
      explanation: cleanExplanation,
      why_it_matters: whyItMatters,
      what_to_improve: whatToImprove,
      copyable_suggestion: copyableSuggestion,
      evidence_available: verifiedEv.length > 0,
      evidence: verifiedEv,
    });
  }

  return validList;
}

/**
 * Deterministically validates whether a candidate visitor impression is complete,
 * grammatically readable, and free from placeholder fragments or truncation.
 */
export function isValidVisitorImpression(text: string | undefined): boolean {
  if (!text || typeof text !== "string") return false;
  const cleaned = text
    .replace(/^[“"'\s]+|[”"'\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 22) return false;

  // Reject broken markdown fragments or trailing asterisks (e.g., "A first*")
  if (/\*+\s*$/.test(cleaned) || /_[a-z0-9]*$/i.test(cleaned)) {
    return false;
  }

  // Reject repeated template prefixes (e.g., "A first-time visitor would think: A first*")
  if (
    /a first-time visitor would (?:probably )?think:?\s*a first/i.test(cleaned) ||
    /^(?:a first-time visitor would (?:probably )?think:?)\s*$/i.test(cleaned)
  ) {
    return false;
  }

  // Reject raw HTML/DOM element prefixes or awkward meta-commentary fragments (e.g., "raises a clear question right away: H1: ...")
  if (
    /\bH[1-6]\s*:/i.test(cleaned) ||
    /\braises a clear question right away\b/i.test(cleaned) ||
    /\b(?:hero_headline|subheadline|primary_cta|evidence_refs)\s*:/i.test(cleaned)
  ) {
    return false;
  }

  // Reject placeholder strings
  if (
    /^(?:todo|tbd|placeholder|n\/a|none|null|undefined|string|visitor thought|first impression)\b/i.test(
      cleaned
    )
  ) {
    return false;
  }

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 5) return false;

  // Reject sentences ending abruptly with a dangling article, preposition, conjunction, modal, or incomplete token
  if (
    /\b(?:a|an|the|first|this|that|these|those|to|for|with|of|in|on|at|by|from|about|into|through|during|before|after|and|or|but|if|because|while|when|where|how|what|who|which|is|are|was|were|be|been|would|could|should|will|can|may|might|must|has|have|had|do|does|did)[-*:,\s]*$/i.test(
      cleaned
    )
  ) {
    return false;
  }

  return true;
}

/**
 * Validates Visitor Thought to ensure it represents a complete, readable,
 * grounded first-time visitor interpretation rather than a broken fragment or fake user quote.
 */
export function sanitizeVisitorThought(
  thoughtText: string | undefined,
  brandName: string,
  snapshot?: WebsiteSnapshot
): string {
  const safeBrand = brandName && brandName.trim() ? brandName.trim() : "this website";

  const buildGroundedFallback = (): string => {
    const headline = snapshot?.hero?.headline?.trim();
    const primaryCta = snapshot?.hero?.primaryCta?.text?.trim();
    const subheadline = snapshot?.hero?.subheadline?.trim();

    if (headline && primaryCta) {
      return `A first-time visitor scanning ${safeBrand} sees “${headline.slice(0, 100)}” and the “${primaryCta}” action, ${
        subheadline
          ? "with supporting context on what the page offers."
          : "and evaluates what happens after clicking."
      }`;
    }
    if (headline) {
      return `A first-time visitor scanning ${safeBrand} sees “${headline.slice(0, 110)}” and looks for clearer details on who it is built for and what happens next.`;
    }
    if (snapshot && (snapshot.stats?.cleanedTextLength ?? 0) === 0 && !snapshot.meta?.title) {
      return `A first-time visitor would scan ${safeBrand}'s homepage to understand its core product offering before taking action.`;
    }
    return `A first-time visitor would scan ${safeBrand}'s homepage to understand its core product offering before taking action.`;
  };

  if (!thoughtText || typeof thoughtText !== "string" || thoughtText.trim().length === 0) {
    return buildGroundedFallback();
  }

  let raw = thoughtText.trim();

  // Detect and strip fake testimonial attribution at the end of a quote (e.g., '- Sarah, CEO at TechCorp')
  // IMPORTANT: Require whitespace before the dash and a mandatory role/title noun so hyphenated words like 'first-time' are NEVER truncated.
  const testimonialAttributionRegex =
    /\s+[-–—]\s*[A-Z][a-zA-Z\s,.']*\b(?:CEO|Founder|Co-Founder|CTO|COO|CFO|VP|President|Director|Manager|Head|Lead|Customer|Client|Engineer|Developer|Designer|Marketer|Owner|Partner|User)\b[^.!?]*$/;

  const hadFakeAttribution = testimonialAttributionRegex.test(raw);
  if (hadFakeAttribution) {
    raw = raw.replace(testimonialAttributionRegex, "").trim();
  }

  // Strip wrapping quotation marks and stray markdown emphasis symbols
  raw = raw
    .replace(/^[“"'\s]+|[”"'\s]+$/g, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Strip duplicated or static template prefix ("A first-time visitor would think: ...")
  raw = raw
    .replace(/^(?:a first-time visitor would (?:probably )?think:\s*)+/i, "")
    .replace(/^[“"'\s]+|[”"'\s]+$/g, "")
    .trim();

  // Reject fake customer endorsement quotes (e.g. "FastFlow is amazing!") or truncated/broken fragments (e.g. "A first*")
  const isFakeEndorsement =
    hadFakeAttribution ||
    /\b(?:i've been using|i have been using|we've been using|best tool i've ever|changed my life)\b/i.test(
      raw
    );

  if (isFakeEndorsement || !isValidVisitorImpression(raw)) {
    return buildGroundedFallback();
  }

  return /[.!?]$/.test(raw) ? raw : `${raw}.`;
}
