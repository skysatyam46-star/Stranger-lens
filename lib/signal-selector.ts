import { AnalysisData } from "@/components/ResultsScreen";

export type SignalId =
  | "first-impression"
  | "audience"
  | "value"
  | "trust"
  | "action";

export interface SignalMeta {
  id: SignalId;
  title: string;
  relevanceCategory: string;
  comprehensionQuestion: string;
  fallbackGap: string;
}

export const SIGNALS_META: Record<SignalId, SignalMeta> = {
  "first-impression": {
    id: "first-impression",
    title: "First impression",
    relevanceCategory: "Product/category understanding and initial messaging clarity",
    comprehensionQuestion: "What is this?",
    fallbackGap: "Core product category wording requires clearer specificity",
  },
  audience: {
    id: "audience",
    title: "Audience",
    relevanceCategory: "Target audience identification and customer role clarity",
    comprehensionQuestion: "Who is it for?",
    fallbackGap: "Target audience or intended user role is not explicitly stated",
  },
  value: {
    id: "value",
    title: "Value",
    relevanceCategory: "Key benefits, outcomes, and value proposition clarity",
    comprehensionQuestion: "What will I get?",
    fallbackGap: "Primary value statement could express a more concrete, measurable outcome",
  },
  trust: {
    id: "trust",
    title: "Trust",
    relevanceCategory: "Credibility signals, verifiable proof, and clarity of claims",
    comprehensionQuestion: "Why should I care?",
    fallbackGap: "Verifiable proof points, customer logos, or credentials were not detected",
  },
  action: {
    id: "action",
    title: "Action",
    relevanceCategory: "Next-step and call-to-action path clarity",
    comprehensionQuestion: "What should I do next?",
    fallbackGap: "Primary call-to-action path could set clearer expectations for next steps",
  },
};

export const SIGNAL_IDS: SignalId[] = [
  "first-impression",
  "audience",
  "value",
  "trust",
  "action",
];

/**
 * Normalizes text for matching and comparison.
 */
export function normalizeText(value?: string | null): string {
  return (value || "")
    .toLowerCase()
    .replace(/^[“"'\s]+|[”"'\s]+$/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Checks if a string is a generic placeholder or system message rather than real website copy.
 */
export function isInvalidWebsiteQuote(text?: string | null): boolean {
  if (!text) return true;
  const cleaned = text.trim();
  if (cleaned.length < 3) return true;

  const lower = cleaned.toLowerCase();
  const invalidPatterns = [
    /we scanned your/i,
    /scanned your (accessible|homepage|website)/i,
    /homepage above-the-fold content scanned on/i,
    /scanned on [a-z0-9.-]+/i,
    /extracted content/i,
    /no (homepage|website) excerpt extracted/i,
    /no headline (text )?extracted/i,
    /current headline excerpt unavailable/i,
    /specific source wording is not available/i,
    /found initial page structure/i,
    /no major communication blockers/i,
    /none/i,
    /n\/a/i,
    /unavailable/i,
  ];

  for (const pattern of invalidPatterns) {
    if (pattern.test(lower)) return true;
  }

  // Reject generic meta descriptions describing the scan process
  if (
    /^(this report reflects|some content on|client-side scripts|initial visible html)/i.test(
      lower
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Classifies any communication topic or finding into one of the 5 canonical signal IDs.
 * Uses structured category fields first, then unambiguous terminology.
 */
export function classifyTextToSignal(
  rawCategory?: string | null,
  text?: string | null
): SignalId | null {
  const normCat = (rawCategory || "").trim().toLowerCase();

  // 1. Explicit Category matching
  if (normCat) {
    if (normCat.includes("trust") || normCat.includes("credib") || normCat.includes("proof")) {
      return "trust";
    }
    if (normCat.includes("audien") || normCat.includes("role") || normCat.includes("persona")) {
      return "audience";
    }
    if (normCat.includes("value") || normCat.includes("benefit") || normCat.includes("outcome") || normCat.includes("positioning")) {
      return "value";
    }
    if (normCat.includes("action") || normCat.includes("cta") || normCat.includes("button") || normCat.includes("next_step")) {
      return "action";
    }
    if (normCat.includes("first_impression") || normCat.includes("first-impression") || normCat.includes("clarity") || normCat.includes("category")) {
      return "first-impression";
    }
  }

  // 2. Text-based semantic classification with priority order
  const normText = normalizeText(text);
  if (!normText) return null;

  // Trust / Social Proof
  if (
    /\b(trust|proof|credib|testimonial|testimonials|case study|case studies|client logos?|social proof|guarantee|certif|metrics?|credentials?|security disclosure)\b/.test(
      normText
    )
  ) {
    return "trust";
  }

  // Audience
  if (
    /\b(target audience|who it is for|who this is for|persona|user role|customer role|ideal customer|built for|for developers|for teams|for designers|for founders|for marketers)\b/.test(
      normText
    )
  ) {
    return "audience";
  }

  // Action / CTA
  if (
    /\b(call to action|call-to-action|cta button|primary cta|button label|next step|friction|sign up|start free|free trial|get started|book a demo)\b/.test(
      normText
    )
  ) {
    return "action";
  }

  // Value Proposition / Outcome
  if (
    /\b(value proposition|primary outcome|concrete outcome|measurable benefit|measurable outcome|why care|what will i get|core benefit|tangible outcome)\b/.test(
      normText
    )
  ) {
    return "value";
  }

  // First Impression / Category understanding
  if (
    /\b(first impression|product category|core purpose|what this is|what is this|main headline|h1 headline|opening hero|opening statement)\b/.test(
      normText
    )
  ) {
    return "first-impression";
  }

  return null;
}

/**
 * Extracts the explicit location or returns a safe neutral fallback.
 * Strictly prevents guessing or labeling everything as homepage.
 */
export function resolveExplicitLocation(
  ...sources: Array<string | undefined | null>
): string {
  const combined = sources.filter(Boolean).join(" ");
  if (!combined) return "Exact section not identified";

  // Check for supporting page references first
  if (/\bpricing\s*(page|table|tier|plan)?\b/i.test(combined)) {
    return "Pricing page";
  }
  if (/\b(feature|features)\s*(page|section)?\b/i.test(combined)) {
    return "Features page";
  }
  if (/\b(about|company)\s*(page|section)?\b/i.test(combined)) {
    return "About page";
  }
  if (/\b(docs|documentation)\b/i.test(combined)) {
    return "Documentation";
  }

  // Genuine homepage hero elements
  if (/\b(hero headline|main headline|primary headline|h1 headline)\b/i.test(combined)) {
    return "Home page → Hero headline";
  }
  if (/\b(hero subheadline|subheadline|sub-headline)\b/i.test(combined)) {
    return "Home page → Hero subheadline";
  }
  if (/\b(primary cta|call to action|cta button|action button)\b/i.test(combined)) {
    return "Home page → Primary CTA";
  }
  if (/\b(navigation|navbar|top navigation|header)\b/i.test(combined)) {
    return "Home page → Navigation bar";
  }
  if (/\b(hero section|above the fold|opening hero)\b/i.test(combined)) {
    return "Home page → Hero section";
  }

  return "Exact section not identified";
}

/**
 * Distinguishes genuine suggested replacement copy from an improvement instruction.
 */
export type CopyType = "SUGGESTED_REPLACEMENT_COPY" | "RECOMMENDED_DIRECTION" | "NONE";

export interface AnalyzedCopyResult {
  type: CopyType;
  label: "Suggested Replacement Copy" | "Recommended Direction" | "No Rewrite Available";
  text: string | null;
  canCopy: boolean;
}

export function analyzeCopySuggestion(candidate?: string | null): AnalyzedCopyResult {
  if (!candidate || !candidate.trim()) {
    return {
      type: "NONE",
      label: "No Rewrite Available",
      text: null,
      canCopy: false,
    };
  }

  const rawClean = candidate
    .replace(/^[“"'\s]+|[”"'\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!rawClean || isInvalidWebsiteQuote(rawClean)) {
    return {
      type: "NONE",
      label: "No Rewrite Available",
      text: null,
      canCopy: false,
    };
  }

  // Reject generic mapper fallback phrases
  if (
    /^state the specific outcome your target audience achieves\.?$/i.test(rawClean) ||
    /^trusted by teams building and growing with\b/i.test(rawClean) ||
    /^built specifically for .+ users looking to achieve results faster\.?$/i.test(rawClean) ||
    /^the clearer way to achieve your goals with\b/i.test(rawClean)
  ) {
    return {
      type: "NONE",
      label: "No Rewrite Available",
      text: null,
      canCopy: false,
    };
  }

  // Detect instructional or meta-advice directives
  const instructionalPrefixes =
    /^(add|include|integrate|place|insert|display|show|replace|clarify|restate|rewrite|ensure|make sure|highlight|feature|use concrete|state clearly|consider|focus on|avoid)\b/i;

  const isInstruction =
    instructionalPrefixes.test(rawClean) ||
    /\b(should be|recommend adding|try incorporating|instead of|your website should)\b/i.test(
      rawClean
    );

  if (isInstruction) {
    return {
      type: "RECOMMENDED_DIRECTION",
      label: "Recommended Direction",
      text: rawClean,
      canCopy: false, // Never allow copying an instruction as website text
    };
  }

  return {
    type: "SUGGESTED_REPLACEMENT_COPY",
    label: "Suggested Replacement Copy",
    text: rawClean,
    canCopy: true,
  };
}

/**
 * Returns signal-specific details for an interactive signal tab or explorer.
 * Guarantees zero cross-signal contamination.
 */
export interface SignalExplorerItem {
  id: SignalId;
  title: string;
  score: number;
  badgeText: string;
  badgeType: "clear" | "amber" | "coral";
  description: string;
  finding: string;
  evidenceQuote: string | null;
  communicationRisk: {
    title: string;
    description: string;
    severity: string;
  } | null;
  recommendation: {
    title: string;
    explanation: string;
    where: string;
  } | null;
  copyImprovement: AnalyzedCopyResult;
}

export function selectSignalDetails(
  signalId: SignalId,
  data: AnalysisData
): SignalExplorerItem {
  const signal = data.signals.find((s) => s.id === signalId);
  const meta = SIGNALS_META[signalId];

  const score = signal?.score ?? 0;
  const badgeText = signal?.badgeText ?? "Evaluated";
  const badgeType = signal?.badgeType ?? "amber";
  const description =
    signal?.description || `Evaluates ${meta.relevanceCategory.toLowerCase()}.`;

  // 1. Signal-specific finding
  let finding = "";
  // Check comprehension question corresponding to this signal
  const compIdxMap: Record<SignalId, number> = {
    "first-impression": 0,
    audience: 1,
    value: 2,
    trust: 3,
    action: 4,
  };
  const compRow = data.firstSeconds?.[compIdxMap[signalId]];
  const clearFindingForSignal = data.evidence?.clearFindings?.find(
    (f) => classifyTextToSignal(null, f) === signalId
  );
  const missingFindingForSignal = data.evidence?.missingFindings?.find(
    (f) => classifyTextToSignal(null, f) === signalId
  );

  if (score >= 70 && clearFindingForSignal) {
    finding = clearFindingForSignal;
  } else if (missingFindingForSignal) {
    finding = missingFindingForSignal;
  } else if (compRow) {
    finding = `${compRow.question}: ${compRow.label} for a first-time visitor.`;
  } else if (signal?.description) {
    finding = signal.description;
  } else {
    finding = "No additional signal-specific finding is available in this report.";
  }

  // 2. Supporting Evidence strictly relevant to this signal
  let evidenceQuote: string | null = null;
  // Look for verified quote in clear findings for this signal
  if (clearFindingForSignal) {
    const match = clearFindingForSignal.match(/[“"]([^”"]+)[”"]/);
    if (match && match[1] && !isInvalidWebsiteQuote(match[1])) {
      evidenceQuote = match[1].trim();
    }
  }
  // If not found and signal is first-impression or value, check homepageExcerpt
  if (!evidenceQuote && (signalId === "first-impression" || signalId === "value")) {
    const rawExcerpt = data.evidence?.homepageExcerpt?.replace(/^[“"'\s]+|[”"'\s]+$/g, "");
    if (rawExcerpt && !isInvalidWebsiteQuote(rawExcerpt)) {
      evidenceQuote = rawExcerpt;
    }
  }

  // 3. Communication Risk strictly matching this signal
  let communicationRisk: SignalExplorerItem["communicationRisk"] = null;
  const matchedRisk = (data.risks || []).find((r) => {
    const catSignal = classifyTextToSignal(r.category, `${r.title} ${r.description}`);
    return catSignal === signalId;
  });

  if (matchedRisk) {
    communicationRisk = {
      title: matchedRisk.title,
      description: matchedRisk.description,
      severity: matchedRisk.severity,
    };
  }

  // 4. Recommendation strictly matching this signal
  let recommendation: SignalExplorerItem["recommendation"] = null;
  let rawCopyCandidate: string | null = null;

  // Check Priority Fix first
  const prioSignal = classifyTextToSignal(
    null,
    `${data.recommendation?.subhead || ""} ${data.recommendation?.explanation || ""}`
  );

  if (prioSignal === signalId && data.recommendation) {
    recommendation = {
      title: data.recommendation.subhead || data.recommendation.title,
      explanation: data.recommendation.explanation,
      where: resolveExplicitLocation(
        data.recommendation.subhead,
        data.recommendation.currentDirection
      ),
    };
    rawCopyCandidate = data.recommendation.strongerDirection || null;
  } else {
    // Check otherImprovements
    const matchedImprovement = (data.otherImprovements || []).find((imp) => {
      const impSignal = classifyTextToSignal(
        imp.id,
        `${imp.title} ${imp.description} ${imp.whatToImprove || ""}`
      );
      return impSignal === signalId;
    });

    if (matchedImprovement) {
      recommendation = {
        title: matchedImprovement.title,
        explanation: matchedImprovement.description,
        where: resolveExplicitLocation(
          matchedImprovement.title,
          matchedImprovement.whatToImprove
        ),
      };
      rawCopyCandidate =
        matchedImprovement.copyableSuggestion ||
        matchedImprovement.whatToImprove ||
        null;
    }
  }

  // 5. Before -> Better Copy or Direction
  const copyImprovement = analyzeCopySuggestion(rawCopyCandidate);

  return {
    id: signalId,
    title: meta.title,
    score,
    badgeText,
    badgeType,
    description,
    finding,
    evidenceQuote,
    communicationRisk,
    recommendation,
    copyImprovement,
  };
}

/**
 * Resolves the primary Clarity Gap and its First Step with strict consistency.
 * Solves: A Trust gap must NEVER display an Audience improvement!
 */
export interface MainGapAndFirstStep {
  primarySignalId: SignalId;
  gapTitle: string;
  gapCategoryLabel: string;
  websiteSaysQuote: string | null;
  visitorUnderstands: string | null;
  firstStep: {
    isAvailable: boolean;
    title: string;
    explanation: string;
    where: string;
  };
}

export function resolveMainGapAndFirstStep(data: AnalysisData): MainGapAndFirstStep {
  // 1. Identify the weakest signal or highest-priority risk
  const sortedSignals = [...data.signals].sort((a, b) => a.score - b.score);
  const weakestSignal = sortedSignals[0] || { id: "first-impression", score: 70 };
  const targetSignalId: SignalId =
    SIGNAL_IDS.includes(weakestSignal.id as SignalId)
      ? (weakestSignal.id as SignalId)
      : "first-impression";

  const meta = SIGNALS_META[targetSignalId];

  // 2. Identify gap title from matched risk or missing findings
  const matchedRisk = (data.risks || []).find((r) => {
    return classifyTextToSignal(r.category, `${r.title} ${r.description}`) === targetSignalId;
  });

  const missingFinding = data.evidence?.missingFindings?.find(
    (f) => classifyTextToSignal(null, f) === targetSignalId
  );

  const gapTitle =
    matchedRisk?.title ||
    missingFinding ||
    meta.fallbackGap;

  // 3. Resolve Website Says quote
  let websiteSaysQuote: string | null = null;
  const clearFinding = data.evidence?.clearFindings?.find(
    (f) => classifyTextToSignal(null, f) === targetSignalId
  );
  if (clearFinding) {
    const match = clearFinding.match(/[“"]([^”"]+)[”"]/);
    if (match && match[1] && !isInvalidWebsiteQuote(match[1])) {
      websiteSaysQuote = match[1].trim();
    }
  }
  if (!websiteSaysQuote) {
    const rawExcerpt = data.evidence?.homepageExcerpt?.replace(/^[“"'\s]+|[”"'\s]+$/g, "");
    if (rawExcerpt && !isInvalidWebsiteQuote(rawExcerpt)) {
      websiteSaysQuote = rawExcerpt;
    }
  }

  // 4. Resolve Visitor Understanding
  const visitorUnderstands =
    data.visitorThought && !isInvalidWebsiteQuote(data.visitorThought)
      ? data.visitorThought.replace(/^[“"'\s]+|[”"'\s]+$/g, "")
      : data.websiteMessage?.summary || null;

  // 5. Match First Step to the EXACT same signal
  // Check Priority Fix first
  const prioFixSignal = classifyTextToSignal(
    null,
    `${data.recommendation?.subhead || ""} ${data.recommendation?.explanation || ""}`
  );

  let firstStep: MainGapAndFirstStep["firstStep"] = {
    isAvailable: false,
    title: "No directly matched first step is available in this analysis.",
    explanation:
      "This analysis flagged a communication gap in this category, but does not contain a specific first-step recommendation for it.",
    where: "Exact section not identified",
  };

  if (prioFixSignal === targetSignalId && data.recommendation?.subhead) {
    firstStep = {
      isAvailable: true,
      title: data.recommendation.subhead,
      explanation:
        data.recommendation.explanation ||
        "Clarify this element to reduce first-time visitor hesitation.",
      where: resolveExplicitLocation(
        data.recommendation.subhead,
        data.recommendation.currentDirection
      ),
    };
  } else {
    // Search otherImprovements for a matching recommendation
    const matchedImprovement = (data.otherImprovements || []).find((imp) => {
      return (
        classifyTextToSignal(
          imp.id,
          `${imp.title} ${imp.description} ${imp.whatToImprove || ""}`
        ) === targetSignalId
      );
    });

    if (matchedImprovement) {
      firstStep = {
        isAvailable: true,
        title: matchedImprovement.title,
        explanation:
          matchedImprovement.whatToImprove ||
          matchedImprovement.description ||
          "Clarify this element to eliminate confusion for first-time visitors.",
        where: resolveExplicitLocation(
          matchedImprovement.title,
          matchedImprovement.whatToImprove
        ),
      };
    }
  }

  return {
    primarySignalId: targetSignalId,
    gapTitle,
    gapCategoryLabel: meta.title,
    websiteSaysQuote,
    visitorUnderstands,
    firstStep,
  };
}
