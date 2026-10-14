import { WebsiteSnapshot, isNavigationOrUtilityCtaLabel } from "@/lib/content-extractor";
import { WebsiteAnalysis } from "@/services/ai/analysisSchema";
import { FinalValidatedAnalysis, ValidatedDecisionStatus, ValidatedEvidenceRef } from "@/types/validatedAnalysis";
import { SCORING_VERSION } from "@/services/scoring/scoringConfig";
import { normalizeSignalScore } from "@/services/scoring/normalizeSignalScore";
import { calculateOverallScore } from "@/services/scoring/calculateOverallScore";
import {
  validateEvidenceList,
  hasExplicitAudienceEvidence,
  hasExplicitProductCategoryEvidence,
  evaluateEvidenceRelevanceForDimension,
} from "./evidenceValidator";
import {
  validatePriorityFix,
  validateOtherImprovements,
  sanitizeVisitorThought,
  containsUnverifiedFabricatedClaim,
} from "./recommendationValidator";

/**
 * Main Phase 4 Validator & Deterministic Scoring Engine.
 * Converts raw/untrusted AI WebsiteAnalysis into a verified, normalized, frontend-safe FinalValidatedAnalysis.
 */
export function validateAndScoreAnalysis(
  aiAnalysis: WebsiteAnalysis,
  snapshot: WebsiteSnapshot
): FinalValidatedAnalysis {
  const brandName = snapshot.navigation.brandName || snapshot.meta.title || "this website";
  const isIncompleteExtraction =
    (snapshot.stats?.cleanedTextLength ?? 0) < 200 ||
    (!snapshot.hero.headline && (snapshot.valueProps?.headings?.length ?? 0) === 0);

  // Qualifies definitive unsupported negative claims into honest observation statements
  const qualifyDefinitiveNegativeText = (rawText: string): string => {
    if (!rawText) return rawText;
    return rawText
      .replace(
        /\bthis website has no trust signals\b/gi,
        "no trust signals were identified in the accessible homepage content"
      )
      .replace(
        /\bno trust signals exist(?: on (?:this|the) (?:website|homepage|page))?\b/gi,
        "no trust signals were identified in the accessible homepage content"
      )
      .replace(
        /\bthere are no trust signals(?: on (?:this|the) (?:website|homepage|page))?\b/gi,
        "no trust signals were identified in the accessible homepage content"
      );
  };

  // 1. Validate First Seconds Evidence
  const validateFSItem = (item: {
    status: string;
    explanation: string;
    evidence_refs?: any[];
  }) => {
    const verifiedEv = validateEvidenceList(item?.evidence_refs, snapshot, true);
    const validStatus: ValidatedDecisionStatus = ["clear", "understandable", "partly_clear", "unclear"].includes(
      item?.status
    )
      ? (item.status as ValidatedDecisionStatus)
      : "partly_clear";

    return {
      status: validStatus,
      explanation: qualifyDefinitiveNegativeText(
        item?.explanation || "Diagnostic evaluation based on accessible homepage content."
      ),
      evidence_available: verifiedEv.length > 0,
      evidence: verifiedEv,
    };
  };

  const fs = aiAnalysis?.first_seconds || {};
  const firstSeconds = {
    what_is_this: validateFSItem(fs.what_is_this),
    who_is_it_for: validateFSItem(fs.who_is_it_for),
    what_will_i_get: validateFSItem(fs.what_will_i_get),
    why_should_i_care: validateFSItem(fs.why_should_i_care),
    what_should_i_do_next: validateFSItem(fs.what_should_i_do_next),
  };

  // Enforce Audience evidence relevance on firstSeconds.who_is_it_for
  const hasExplicitAud = hasExplicitAudienceEvidence(
    [
      ...firstSeconds.who_is_it_for.evidence,
      ...validateEvidenceList(aiAnalysis?.signals?.audience?.evidence_refs, snapshot, true),
    ],
    snapshot
  );
  if (!hasExplicitAud) {
    firstSeconds.who_is_it_for.evidence = [];
    firstSeconds.who_is_it_for.evidence_available = false;
    if (
      firstSeconds.who_is_it_for.status === "clear" ||
      firstSeconds.who_is_it_for.status === "understandable"
    ) {
      firstSeconds.who_is_it_for.status = "partly_clear";
    }
  }

  // Enforce Product Category evidence relevance on firstSeconds.what_is_this
  if (
    firstSeconds.what_is_this.evidence.length > 0 &&
    !hasExplicitProductCategoryEvidence(firstSeconds.what_is_this.evidence, snapshot)
  ) {
    // Keep only if headline itself was matched, otherwise mark relevance weak
    firstSeconds.what_is_this.evidence = firstSeconds.what_is_this.evidence.map((ev) => ({
      ...ev,
      relevance: "weak" as const,
    }));
  }

  // Enforce Primary CTA consistency on firstSeconds.what_should_i_do_next
  const heroPrimaryCtaText = snapshot.hero?.primaryCta?.text?.trim();
  if (heroPrimaryCtaText && !isNavigationOrUtilityCtaLabel(heroPrimaryCtaText)) {
    firstSeconds.what_should_i_do_next.evidence =
      firstSeconds.what_should_i_do_next.evidence.filter(
        (ev) => !isNavigationOrUtilityCtaLabel(ev.text)
      );
    if (firstSeconds.what_should_i_do_next.evidence.length === 0) {
      firstSeconds.what_should_i_do_next.evidence = [
        {
          source: "cta",
          text: heroPrimaryCtaText,
          status: "verified",
          matchType: "exact",
          relevance: "strong",
        },
      ];
      firstSeconds.what_should_i_do_next.evidence_available = true;
    }
  }

  // 2. Validate Evidence & Normalize Scores for All 5 Signals
  const rawSignals = aiAnalysis?.signals || {};

  const processSignal = (sigKey: keyof typeof rawSignals, defaultStatus: string) => {
    const rawSig = rawSignals[sigKey] || {};
    let verifiedEv = validateEvidenceList(rawSig.evidence_refs, snapshot, true);

    if (sigKey === "action" && heroPrimaryCtaText && !isNavigationOrUtilityCtaLabel(heroPrimaryCtaText)) {
      verifiedEv = verifiedEv.filter((ev) => !isNavigationOrUtilityCtaLabel(ev.text));
      if (verifiedEv.length === 0) {
        verifiedEv = [
          {
            source: "cta",
            text: heroPrimaryCtaText,
            status: "verified",
            matchType: "exact",
            relevance: "strong",
          },
        ];
      }
    }

    const dimensionSupport = evaluateEvidenceRelevanceForDimension(
      sigKey,
      verifiedEv,
      snapshot
    );

    if (sigKey === "audience" && dimensionSupport === "unsupported") {
      verifiedEv = [];
    }

    const status = rawSig.status || defaultStatus;
    const initialConfidence = ["high", "medium", "low"].includes(rawSig.confidence)
      ? rawSig.confidence
      : "medium";

    const { finalScore, finalStatus, finalConfidence } = normalizeSignalScore(
      rawSig.score,
      status,
      verifiedEv,
      initialConfidence,
      dimensionSupport
    );

    const effectiveConfidence =
      isIncompleteExtraction && verifiedEv.length === 0 ? "low" : finalConfidence;

    let explanation = qualifyDefinitiveNegativeText(
      rawSig.explanation || "Diagnostic signal evaluation based on accessible homepage content."
    );

    if (containsUnverifiedFabricatedClaim(explanation, snapshot)) {
      explanation = `Diagnostic ${sigKey.replace("_", " ")} evaluation based on accessible homepage content for ${brandName}.`;
    }

    if (sigKey === "audience" && dimensionSupport === "unsupported") {
      const claimsClearAudience =
        /\b(clearly specified|clearly stated|explicitly stated|clearly identifies|target audience is clear)\b/i.test(
          explanation
        );
      if (claimsClearAudience || finalScore < 70) {
        explanation = `Target audience is not explicitly stated in the accessible homepage content for ${brandName}; visitors must infer whether it applies to them.`;
      }
    }

    if (
      sigKey === "action" &&
      heroPrimaryCtaText &&
      /\b["'“”]?(?:faq|frequently asked questions|pricing|about|contact|blog|login|sign in)["'””]?\b/i.test(
        explanation
      ) &&
      !explanation.toLowerCase().includes(heroPrimaryCtaText.toLowerCase())
    ) {
      explanation = `The primary call-to-action (“${heroPrimaryCtaText}”) is present in the extracted homepage hero content.`;
    }

    return {
      score: finalScore,
      status: finalStatus,
      explanation,
      confidence: effectiveConfidence,
      evidence_available: verifiedEv.length > 0,
      evidence: verifiedEv,
    };
  };

  const processedSignals = {
    first_impression: processSignal("first_impression", "clear"),
    audience: processSignal("audience", "understandable"),
    value: processSignal("value", "understandable"),
    trust: processSignal("trust", "could_be_stronger"),
    action: processSignal("action", "clear"),
  };

  // Detect any verified credibility evidence in signals or snapshot.trustSignals
  const snapshotTrustCandidates: string[] = [
    ...(snapshot.trustSignals?.socialProofHeadings || []),
    ...(snapshot.trustSignals?.statsAndMetrics || []),
    ...(snapshot.trustSignals?.badgesAndCertifications || []),
    ...(snapshot.trustSignals?.testimonials?.map((t) => t.quote) || []),
    ...(snapshot.trustSignals?.customerLogosAlt || []),
  ].filter((t) => Boolean(t && t.trim()));

  const verifiedTrustItems: string[] = [
    ...processedSignals.trust.evidence.map((e) => e.text),
    ...firstSeconds.why_should_i_care.evidence.map((e) => e.text),
    ...snapshotTrustCandidates,
  ].filter((t) => Boolean(t && t.trim()));

  const primaryTrustSnippet = verifiedTrustItems[0] || null;

  // If snapshot or why_should_i_care has verified trust evidence that wasn't attached to signals.trust.evidence, attach it so downstream mappers stay consistent
  if (primaryTrustSnippet && processedSignals.trust.evidence.length === 0) {
    processedSignals.trust.evidence = [
      {
        source: "trust",
        text: primaryTrustSnippet,
        status: "verified",
        matchType: "exact",
        relevance: "moderate",
      },
    ];
    processedSignals.trust.evidence_available = true;
  }

  // Reconcile Trust Signal Explanation when Trust score is low (<70)
  // Case 1: Low Trust score (<70) WITH some validated positive credibility evidence (TEST A)
  if (processedSignals.trust.score < 70 && primaryTrustSnippet) {
    const rawTrustExp = processedSignals.trust.explanation;
    const hasNuance = /\b(but|however|though|although|while|limited|lacks|missing|weak|only|partly|insufficient)\b/i.test(
      rawTrustExp
    );
    const claimsNoneExist =
      /\b(no trust signals|no verifiable trust|no proof points|zero trust|no credibility|no customer proof|none found)\b/i.test(
        rawTrustExp
      );
    const claimsUnqualifiedStrong =
      !hasNuance &&
      /\b(trust signals are visible|credible proof points found|strong trust|strong social proof|clear proof points)\b/i.test(
        rawTrustExp
      );

    if (claimsNoneExist || claimsUnqualifiedStrong || !hasNuance) {
      processedSignals.trust.explanation = `While initial credibility elements are present in the accessible homepage content (such as “${primaryTrustSnippet}”), overall trust strength scores ${processedSignals.trust.score}/100 because broader proof points—such as detailed customer testimonials or case studies—were not identified in the accessible homepage content.`;
    }
  } else if (processedSignals.trust.score < 50 && !primaryTrustSnippet) {
    // Case 2: Low Trust score (<50) WITHOUT verified trust evidence
    const rawTrustExp = processedSignals.trust.explanation;
    const claimsPositiveProof =
      /\b(trust signals are visible|credible proof points found|strong trust|strong social proof|clear social proof)\b/i.test(
        rawTrustExp
      );
    if (claimsPositiveProof) {
      processedSignals.trust.explanation = `Trust signals are limited (${processedSignals.trust.score}/100); no verifiable customer proof points, testimonials, or credentials were identified in the accessible homepage content.`;
    }
  }

  // Reconcile First Seconds statuses with normalized signal scores to eliminate cross-section contradictions
  const reconcileFSWithScore = (
    fsStatus: ValidatedDecisionStatus,
    signalScore: number
  ): ValidatedDecisionStatus => {
    if (signalScore >= 80) return "clear";
    if (signalScore >= 70) {
      return fsStatus === "clear" ? "clear" : "understandable";
    }
    if (signalScore >= 45) {
      return "partly_clear";
    }
    return "unclear";
  };

  firstSeconds.what_is_this.status = reconcileFSWithScore(
    firstSeconds.what_is_this.status,
    processedSignals.first_impression.score
  );
  firstSeconds.who_is_it_for.status = reconcileFSWithScore(
    firstSeconds.who_is_it_for.status,
    processedSignals.audience.score
  );
  firstSeconds.what_will_i_get.status = reconcileFSWithScore(
    firstSeconds.what_will_i_get.status,
    processedSignals.value.score
  );
  firstSeconds.why_should_i_care.status = reconcileFSWithScore(
    firstSeconds.why_should_i_care.status,
    processedSignals.trust.score
  );
  firstSeconds.what_should_i_do_next.status = reconcileFSWithScore(
    firstSeconds.what_should_i_do_next.status,
    processedSignals.action.score
  );

  // 3. Deterministic Overall Score Calculation
  const { overallScore, overallStatus } = calculateOverallScore({
    first_impression: processedSignals.first_impression.score,
    audience: processedSignals.audience.score,
    value: processedSignals.value.score,
    trust: processedSignals.trust.score,
    action: processedSignals.action.score,
  });

  // Identify weakest signal
  const signalEntries = (Object.entries(processedSignals) as Array<[
    keyof typeof processedSignals,
    (typeof processedSignals)[keyof typeof processedSignals]
  ]>).sort((a, b) => a[1].score - b[1].score);
  const weakestSignalKey = signalEntries[0] ? signalEntries[0][0] : undefined;
  const weakestSignalScore = signalEntries[0] ? signalEntries[0][1].score : 100;

  const allSignalScores: Record<string, number> = {
    first_impression: processedSignals.first_impression.score,
    audience: processedSignals.audience.score,
    value: processedSignals.value.score,
    trust: processedSignals.trust.score,
    action: processedSignals.action.score,
  };

  // 4. Validate Priority Fix, Risks & Other Improvements
  const priorityFix = validatePriorityFix(
    aiAnalysis?.priority_fix,
    snapshot,
    weakestSignalKey,
    weakestSignalScore,
    allSignalScores
  );
  const otherImprovements = validateOtherImprovements(
    aiAnalysis?.other_improvements,
    snapshot,
    priorityFix.title
  );

  const rawWm: any = aiAnalysis?.website_message || {};
  const wmEv = validateEvidenceList(rawWm.evidence_refs, snapshot, true);
  const rawWmSummary =
    rawWm.summary && !containsUnverifiedFabricatedClaim(rawWm.summary, snapshot)
      ? qualifyDefinitiveNegativeText(rawWm.summary)
      : "";
  const wmSummary = rawWmSummary
    ? rawWmSummary
    : isIncompleteExtraction
    ? `Limited text was identified in the accessible homepage HTML for ${brandName}; this assessment reflects only the initial static markup available during scanning.`
    : `This website communicates its core product offering for ${brandName}.`;
  const wmConfidence = isIncompleteExtraction
    ? "low"
    : ["high", "medium", "low"].includes(rawWm.confidence)
    ? rawWm.confidence
    : "medium";
  const websiteMessage = {
    summary: wmSummary,
    confidence: wmConfidence,
    evidence_available: wmEv.length > 0,
    evidence: wmEv,
  };

  // 4b. Reconcile and Validate Risks against Normalized Signal Scores
  const rawRisks = aiAnalysis?.risks;
  let risks: Array<{
    category: string;
    severity: "high" | "medium" | "low";
    title: string;
    description: string;
    why_it_matters: string;
    evidence_available: boolean;
    evidence: ValidatedEvidenceRef[];
  }> = [];

  if (Array.isArray(rawRisks) && rawRisks.length > 0) {
    risks = rawRisks.map((r) => {
      const verifiedEv = validateEvidenceList(r.evidence_refs, snapshot, true);
      let severity: "high" | "medium" | "low" = ["high", "medium", "low"].includes(r.severity)
        ? (r.severity as "high" | "medium" | "low")
        : "medium";

      const cat = (r.category || "clarity").toLowerCase();
      const catScore =
        cat.includes("trust") || cat.includes("credibility")
          ? processedSignals.trust.score
          : cat.includes("audience")
          ? processedSignals.audience.score
          : cat.includes("value") || cat.includes("positioning")
          ? processedSignals.value.score
          : cat.includes("action") || cat.includes("cta")
          ? processedSignals.action.score
          : processedSignals.first_impression.score;

      // Enforce severity consistency with signal scores so a Clear signal (>= 70) is never flagged as a high/medium bottleneck ahead of weak signals:
      if (catScore < 50) {
        severity = "high";
      } else if (catScore >= 70) {
        severity = "low";
      }

      let desc = qualifyDefinitiveNegativeText(
        r.description || "First-time visitors may experience friction understanding this element."
      );
      if (
        cat.includes("trust") &&
        primaryTrustSnippet &&
        /\b(no trust signals|no verified customer proof|no proof points|zero trust)\b/i.test(desc)
      ) {
        desc = `While ${brandName} includes initial credibility elements (such as “${primaryTrustSnippet}”), overall trust signals score ${processedSignals.trust.score}/100 and lack deeper customer proof or verifiable case studies in the accessible hero content.`;
      }

      return {
        category: cat,
        severity,
        title: r.title || "Communication risk identified",
        description: desc,
        why_it_matters:
          r.why_it_matters ||
          "Clear communication reduces visitor bounce rate and increases conversion confidence.",
        evidence_available: verifiedEv.length > 0,
        evidence: verifiedEv,
      };
    });
  }

  // Ensure every weak signal (< 70) has a corresponding risk!
  const hasCategoryRisk = (category: string) =>
    risks.some(
      (r) =>
        r.category.toLowerCase().includes(category) ||
        category.includes(r.category.toLowerCase())
    );

  // Check Trust weakness
  if (processedSignals.trust.score < 70 && !hasCategoryRisk("trust")) {
    const sev = processedSignals.trust.score < 50 ? "high" : "medium";
    risks.push({
      category: "trust",
      severity: sev,
      title: primaryTrustSnippet
        ? "Existing credibility signals need stronger above-the-fold proof"
        : sev === "high"
        ? "Limited verifiable trust signals in accessible homepage content"
        : "Trust signals could be substantially stronger",
      description: primaryTrustSnippet
        ? `While ${brandName} includes initial credibility elements (such as “${primaryTrustSnippet}”), overall trust signals score ${processedSignals.trust.score}/100 and lack deeper customer proof or verifiable case studies in the accessible hero content.`
        : `No verifiable customer proof, named testimonials, or methodology credentials were identified in the accessible homepage content for ${brandName}.`,
      why_it_matters:
        "First-time visitors hesitate to commit time or money without immediate, visible evidence that others trust the product.",
      evidence_available: processedSignals.trust.evidence_available,
      evidence: processedSignals.trust.evidence,
    });
  }

  // Check Audience weakness
  if (processedSignals.audience.score < 70 && !hasCategoryRisk("audience")) {
    const sev = processedSignals.audience.score < 50 ? "high" : "medium";
    risks.push({
      category: "audience",
      severity: sev,
      title: "Target audience is not clearly identified",
      description: `${brandName}'s accessible homepage content does not explicitly specify who the product is built for, leaving visitors unsure if it applies to them.`,
      why_it_matters:
        "Visitors bounce within seconds if they cannot immediately confirm the product was designed specifically for their role or use case.",
      evidence_available: processedSignals.audience.evidence_available,
      evidence: processedSignals.audience.evidence,
    });
  }

  // Check Value weakness
  if (processedSignals.value.score < 70 && !hasCategoryRisk("value")) {
    const sev = processedSignals.value.score < 50 ? "high" : "medium";
    risks.push({
      category: "value",
      severity: sev,
      title: "Core benefit is overshadowed by features or abstract copy",
      description: `The primary visitor outcome is not immediately clear from the accessible hero copy, focusing more on general description than tangible results.`,
      why_it_matters:
        "Visitors evaluate products based on what they will achieve, not just what the tool does.",
      evidence_available: processedSignals.value.evidence_available,
      evidence: processedSignals.value.evidence,
    });
  }

  // Check Action weakness
  if (processedSignals.action.score < 70 && !hasCategoryRisk("action")) {
    const sev = processedSignals.action.score < 50 ? "high" : "medium";
    risks.push({
      category: "action",
      severity: sev,
      title: "Call-to-action path has high friction or ambiguity",
      description: `The next step in the accessible hero content creates uncertainty regarding what happens after clicking, pricing commitment, or required setup.`,
      why_it_matters:
        "Ambiguous or high-friction CTAs reduce conversion from high-intent first-time visitors.",
      evidence_available: processedSignals.action.evidence_available,
      evidence: processedSignals.action.evidence,
    });
  }

  // Check First Impression weakness
  if (
    processedSignals.first_impression.score < 70 &&
    !hasCategoryRisk("clarity") &&
    !hasCategoryRisk("first_impression")
  ) {
    const sev = processedSignals.first_impression.score < 50 ? "high" : "medium";
    risks.push({
      category: "clarity",
      severity: sev,
      title: "Hero message requires secondary scanning to comprehend",
      description: `The first-impression headline in the accessible homepage content does not clearly communicate the product category within the first few seconds.`,
      why_it_matters:
        "Visitors scan headlines rapidly; if comprehension takes too long, drop-off spikes.",
      evidence_available: processedSignals.first_impression.evidence_available,
      evidence: processedSignals.first_impression.evidence,
    });
  }

  // If overall score < 80 ("needs_improvement") and risks is still empty, add clarity risk
  if (overallScore < 80 && risks.length === 0) {
    risks.push({
      category: "clarity",
      severity: overallScore < 60 ? "high" : "medium",
      title: "Hero headline does not immediately convey core value",
      description: `First-time visitors scanning ${brandName}'s accessible homepage content do not immediately grasp the primary benefit and outcome.`,
      why_it_matters: "Fast comprehension is required to keep cold visitors from bouncing.",
      evidence_available: processedSignals.first_impression.evidence_available,
      evidence: processedSignals.first_impression.evidence,
    });
  }

  // Map risk category to corresponding signal score so the lowest-scoring signal's risk is prioritized first (aligning Biggest Issue with #1 Priority Fix)
  const getCategorySignalScore = (rawCat: string): number => {
    const cat = (rawCat || "").toLowerCase();
    if (cat.includes("trust") || cat.includes("credibility")) return processedSignals.trust.score;
    if (cat.includes("audience")) return processedSignals.audience.score;
    if (cat.includes("value") || cat.includes("positioning")) return processedSignals.value.score;
    if (cat.includes("action") || cat.includes("cta")) return processedSignals.action.score;
    return processedSignals.first_impression.score;
  };

  // Sort risks: "high" severity first, then "medium", then "low"; tie-break by lowest signal score so risks[0] matches the primary bottleneck
  const severityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  risks.sort((a, b) => {
    const sevDiff = (severityRank[a.severity] ?? 1) - (severityRank[b.severity] ?? 1);
    if (sevDiff !== 0) return sevDiff;
    return getCategorySignalScore(a.category) - getCategorySignalScore(b.category);
  });

  // Limit to top 4 most critical risks
  risks = risks.slice(0, 4);

  // 5. Sanitize Verdict & Visitor Thought
  const rawVerdict =
    aiAnalysis?.verdict?.text &&
    !containsUnverifiedFabricatedClaim(aiAnalysis.verdict.text, snapshot)
      ? aiAnalysis.verdict.text
      : "";
  const verdictText = qualifyDefinitiveNegativeText(
    rawVerdict ||
      (overallScore >= 80
        ? `${brandName} communicates its core value proposition and next step clearly to first-time visitors.`
        : `Visitors grasp ${brandName}'s general topic, but key first-impression signals need clearer grounding.`)
  );

  const visitorThoughtText = sanitizeVisitorThought(
    aiAnalysis?.visitor_thought?.text,
    brandName,
    snapshot
  );
  const visitorThoughtConfidence = isIncompleteExtraction
    ? "low"
    : ["high", "medium", "low"].includes(aiAnalysis?.visitor_thought?.confidence)
    ? aiAnalysis.visitor_thought.confidence
    : "medium";

  // 6. Assemble Final Validated Analysis Object
  return {
    analysis_version: "1.0",
    scoring_version: SCORING_VERSION,

    overall_score: overallScore,
    overall_status: overallStatus,

    verdict: {
      text: verdictText,
    },

    first_seconds: firstSeconds,

    visitor_thought: {
      text: visitorThoughtText,
      confidence: visitorThoughtConfidence,
    },

    website_message: websiteMessage,

    signals: processedSignals,

    risks,

    priority_fix: priorityFix,

    other_improvements: otherImprovements,
  };
}
