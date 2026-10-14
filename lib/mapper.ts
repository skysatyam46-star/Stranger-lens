import { FinalValidatedAnalysis } from "@/types/validatedAnalysis";
import { SupportingContext } from "@/types/supportingContext";
import { WebsiteSnapshot, isNavigationOrUtilityCtaLabel } from "@/lib/content-extractor";
import { AnalysisData } from "@/components/ResultsScreen";

/**
 * Maps the backend's structured FinalValidatedAnalysis and WebsiteSnapshot
 * into the camelCase AnalysisData structure expected by the frozen ResultsScreen component.
 */
export function mapBackendToFrontend(
  backendAnalysis: FinalValidatedAnalysis,
  rawUrl: string,
  snapshot?: WebsiteSnapshot,
  supportingContextOverride?: SupportingContext
): AnalysisData {
  // Normalize Domain for Display
  let cleanDomain = rawUrl.trim();
  try {
    if (!/^https?:\/\//i.test(cleanDomain)) {
      cleanDomain = `https://${cleanDomain}`;
    }
    const parsed = new URL(cleanDomain);
    cleanDomain = parsed.hostname.replace(/^www\./, "") || "website.com";
  } catch {
    cleanDomain = cleanDomain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || "website.com";
  }

  const statusToType = (status: string): "clear" | "amber" | "coral" => {
    const s = status.toLowerCase();
    if (s === "clear" || s === "understandable") return "clear";
    if (s === "partly_clear" || s === "partly" || s === "could_be_stronger") return "amber";
    return "coral";
  };

  const statusToLabel = (status: string): "Clear" | "Understandable" | "Partly clear" | "Unclear" => {
    const s = status.toLowerCase();
    if (s === "clear") return "Clear";
    if (s === "understandable") return "Understandable";
    if (s === "partly_clear" || s === "partly" || s === "could_be_stronger") return "Partly clear";
    return "Unclear";
  };

  const formatSignalBadgeText = (status: string, score: number): string => {
    const s = (status || "").toLowerCase().trim();
    if (score >= 80 || s === "clear") return "Clear";
    if (score >= 65) {
      return s === "could_be_stronger" ? "Could be stronger" : "Understandable";
    }
    if (score >= 45) {
      return s === "needs_work" ? "Needs work" : "Partly clear";
    }
    return s === "needs_work" ? "Needs work" : "Unclear";
  };

  const scoreToStatus = (score: number): "Needs improvement" | "Good" | "Needs work" | "Excellent" => {
    if (score >= 90) return "Excellent";
    if (score >= 75) return "Good";
    if (score >= 50) return "Needs work";
    return "Needs improvement";
  };

  const brandName = snapshot?.navigation?.brandName || cleanDomain.split(".")[0];
  const capitalizedBrand = brandName.charAt(0).toUpperCase() + brandName.slice(1);

  // Build quick signals directly coherent with normalized signal scores (3-tier: >=70 clear, 50-69 amber, <50 coral)
  const getSignalStatusType = (score: number): "clear" | "amber" | "coral" => {
    if (score >= 70) return "clear";
    if (score >= 50) return "amber";
    return "coral";
  };

  const fiScore = backendAnalysis.signals.first_impression.score;
  const audScore = backendAnalysis.signals.audience.score;
  const valScore = backendAnalysis.signals.value.score;
  const trScore = backendAnalysis.signals.trust.score;
  const actScore = backendAnalysis.signals.action.score;

  const quickSignals = [
    {
      label:
        fiScore >= 80
          ? "Product category is clear"
          : fiScore >= 70
          ? "Product category is understandable"
          : fiScore >= 50
          ? "Product category is partly clear"
          : "Product category is unclear",
      type: getSignalStatusType(fiScore),
    },
    {
      label:
        audScore >= 80
          ? "Target audience is clear"
          : audScore >= 70
          ? "Target audience is visible"
          : audScore >= 50
          ? "Target audience is partly clear"
          : "Target audience is unclear",
      type: getSignalStatusType(audScore),
    },
    {
      label:
        valScore >= 80
          ? "Main benefit is obvious"
          : valScore >= 70
          ? "Main benefit is understandable"
          : valScore >= 50
          ? "Main benefit could be clearer"
          : "Main benefit is unclear",
      type: getSignalStatusType(valScore),
    },
    {
      label:
        trScore >= 80
          ? "Trust signals are strong"
          : trScore >= 70
          ? "Trust signals are visible"
          : trScore >= 50
          ? "Trust signals could be stronger"
          : "Trust signals are weak",
      type: getSignalStatusType(trScore),
    },
    {
      label:
        actScore >= 80
          ? "Next step is clear"
          : actScore >= 70
          ? "Next step is understandable"
          : actScore >= 50
          ? "Next step could be clearer"
          : "Next step needs work",
      type: getSignalStatusType(actScore),
    },
  ];

  // Build firstSeconds
  const firstSeconds = [
    {
      question: "What is this?",
      label: statusToLabel(backendAnalysis.first_seconds.what_is_this.status),
      type: backendAnalysis.first_seconds.what_is_this.status === "clear" || backendAnalysis.first_seconds.what_is_this.status === "understandable"
        ? ("clear" as const)
        : backendAnalysis.first_seconds.what_is_this.status === "unclear"
        ? ("unclear" as const)
        : ("partly" as const),
    },
    {
      question: "Who is it for?",
      label: statusToLabel(backendAnalysis.first_seconds.who_is_it_for.status),
      type: backendAnalysis.first_seconds.who_is_it_for.status === "clear" || backendAnalysis.first_seconds.who_is_it_for.status === "understandable"
        ? ("clear" as const)
        : backendAnalysis.first_seconds.who_is_it_for.status === "unclear"
        ? ("unclear" as const)
        : ("partly" as const),
    },
    {
      question: "What will I get?",
      label: statusToLabel(backendAnalysis.first_seconds.what_will_i_get.status),
      type: backendAnalysis.first_seconds.what_will_i_get.status === "clear" || backendAnalysis.first_seconds.what_will_i_get.status === "understandable"
        ? ("clear" as const)
        : backendAnalysis.first_seconds.what_will_i_get.status === "unclear"
        ? ("unclear" as const)
        : ("partly" as const),
    },
    {
      question: "Why should I care?",
      label: statusToLabel(backendAnalysis.first_seconds.why_should_i_care.status),
      type: backendAnalysis.first_seconds.why_should_i_care.status === "clear" || backendAnalysis.first_seconds.why_should_i_care.status === "understandable"
        ? ("clear" as const)
        : backendAnalysis.first_seconds.why_should_i_care.status === "unclear"
        ? ("unclear" as const)
        : ("partly" as const),
    },
    {
      question: "What should I do next?",
      label: statusToLabel(backendAnalysis.first_seconds.what_should_i_do_next.status),
      type: backendAnalysis.first_seconds.what_should_i_do_next.status === "clear" || backendAnalysis.first_seconds.what_should_i_do_next.status === "understandable"
        ? ("clear" as const)
        : backendAnalysis.first_seconds.what_should_i_do_next.status === "unclear"
        ? ("unclear" as const)
        : ("partly" as const),
    },
  ];

  const isPartialSnapshot = snapshot?.stats ? snapshot.stats.cleanedTextLength < 200 : false;

  // Extract clear & missing findings grounded in verified evidence without cross-section contradictions
  const clearFindings: string[] = [];
  const missingFindings: string[] = [];

  // 1. What is this (Product category / First Impression)
  const whatIsThisEv =
    backendAnalysis.first_seconds.what_is_this.evidence[0]?.text ||
    backendAnalysis.signals.first_impression.evidence[0]?.text;
  if (
    whatIsThisEv &&
    (backendAnalysis.signals.first_impression.score >= 70 ||
      backendAnalysis.first_seconds.what_is_this.status === "clear" ||
      backendAnalysis.first_seconds.what_is_this.status === "understandable")
  ) {
    clearFindings.push(`Product category: “${whatIsThisEv}” is identifiable`);
  } else if (
    backendAnalysis.first_seconds.what_is_this.status === "clear" ||
    backendAnalysis.signals.first_impression.score >= 70
  ) {
    clearFindings.push("Core product category is identifiable in the homepage content");
  }
  if (backendAnalysis.signals.first_impression.score < 70) {
    missingFindings.push(
      whatIsThisEv
        ? "Product category wording is present but requires clearer specificity in the hero section"
        : isPartialSnapshot
        ? "Clear product category headline was not detected in the extracted homepage text"
        : "Product category requires extra scanning to identify"
    );
  }

  // 2. Who is it for (Audience)
  const whoIsItForEv =
    backendAnalysis.first_seconds.who_is_it_for.evidence[0]?.text ||
    backendAnalysis.signals.audience.evidence[0]?.text;
  if (
    whoIsItForEv &&
    backendAnalysis.signals.audience.score >= 70 &&
    (backendAnalysis.first_seconds.who_is_it_for.status === "clear" ||
      backendAnalysis.first_seconds.who_is_it_for.status === "understandable")
  ) {
    clearFindings.push(`Target audience: “${whoIsItForEv}” is specified`);
  } else if (
    backendAnalysis.first_seconds.who_is_it_for.status === "clear" ||
    backendAnalysis.signals.audience.score >= 70
  ) {
    clearFindings.push("Target audience or customer role is visible");
  }
  if (backendAnalysis.signals.audience.score < 70) {
    missingFindings.push(
      isPartialSnapshot
        ? "Explicit target audience qualifier was not detected in the extracted homepage text"
        : "Target audience is not explicitly stated in hero section"
    );
  }

  // 3. What will I get (Value / Benefit)
  const valueEv =
    backendAnalysis.first_seconds.what_will_i_get.evidence[0]?.text ||
    backendAnalysis.signals.value.evidence[0]?.text;
  if (valueEv) {
    clearFindings.push(`Primary outcome: “${valueEv}” is stated`);
  } else if (
    backendAnalysis.first_seconds.what_will_i_get.status === "clear" ||
    backendAnalysis.signals.value.score >= 70
  ) {
    clearFindings.push("Core benefit message is communicated in hero");
  }
  if (backendAnalysis.signals.value.score < 70) {
    missingFindings.push(
      valueEv
        ? "Value statement is present but could express a more concrete, measurable visitor outcome"
        : isPartialSnapshot
        ? "Concrete visitor outcome was not detected in the extracted homepage text"
        : "Specific visitor outcome or benefit is not concrete"
    );
  }

  // 4. Trust / Social Proof
  const trustEv =
    backendAnalysis.signals.trust.evidence[0]?.text ||
    backendAnalysis.first_seconds.why_should_i_care.evidence[0]?.text ||
    snapshot?.trustSignals?.socialProofHeadings?.[0] ||
    snapshot?.trustSignals?.statsAndMetrics?.[0];
  if (trustEv) {
    clearFindings.push(`Proof element: “${trustEv}” is visible`);
  } else if (backendAnalysis.signals.trust.score >= 70) {
    clearFindings.push("Trust signals or credentials found on page");
  }
  if (backendAnalysis.signals.trust.score < 70) {
    missingFindings.push(
      trustEv
        ? "Initial proof is present, but stronger quantifiable credentials or customer evidence would reinforce trust"
        : isPartialSnapshot
        ? "Customer proof points or credentials were not detected in the extracted homepage text"
        : "Verifiable proof points, customer logos, or credentials not detected in the extracted homepage content"
    );
  }

  // 5. Primary Call to Action
  const candidateActionEv =
    snapshot?.hero?.primaryCta?.text ||
    backendAnalysis.signals.action.evidence.find((e) => !isNavigationOrUtilityCtaLabel(e.text))?.text ||
    backendAnalysis.first_seconds.what_should_i_do_next.evidence.find((e) => !isNavigationOrUtilityCtaLabel(e.text))?.text ||
    backendAnalysis.signals.action.evidence[0]?.text ||
    backendAnalysis.first_seconds.what_should_i_do_next.evidence[0]?.text;
  const actionEv =
    candidateActionEv && !isNavigationOrUtilityCtaLabel(candidateActionEv)
      ? candidateActionEv
      : snapshot?.hero?.primaryCta?.text || undefined;
  if (actionEv && backendAnalysis.signals.action.score >= 60) {
    clearFindings.push(`Primary action: “${actionEv}” is present in the hero section`);
  }
  if (backendAnalysis.signals.action.score < 65) {
    missingFindings.push(
      actionEv
        ? `Primary CTA (“${actionEv}”) is present, but next-step expectations or commitment level could be clearer`
        : isPartialSnapshot
        ? "Primary call-to-action button was not detected in the extracted homepage text"
        : "Call to action has ambiguity or high friction"
    );
  }

  const homepageExcerpt = snapshot?.hero?.headline
    ? `“ ${snapshot.hero.headline}${snapshot.hero.subheadline ? ' — ' + snapshot.hero.subheadline : ''} ”`
    : "";

  const evidence = {
    locationTag: snapshot?.hero?.headline
      ? "Home page → Hero section"
      : "Exact section not identified",
    homepageExcerpt,
    clearFindings,
    missingFindings,
  };

  // Build signals
  const signals = [
    {
      id: "first-impression",
      title: "First impression",
      score: backendAnalysis.signals.first_impression.score,
      badgeText: formatSignalBadgeText(
        backendAnalysis.signals.first_impression.status,
        backendAnalysis.signals.first_impression.score
      ),
      badgeType: getSignalStatusType(backendAnalysis.signals.first_impression.score),
      description: backendAnalysis.signals.first_impression.explanation,
      icon: "eye",
    },
    {
      id: "audience",
      title: "Audience",
      score: backendAnalysis.signals.audience.score,
      badgeText: formatSignalBadgeText(
        backendAnalysis.signals.audience.status,
        backendAnalysis.signals.audience.score
      ),
      badgeType: getSignalStatusType(backendAnalysis.signals.audience.score),
      description: backendAnalysis.signals.audience.explanation,
      icon: "users",
    },
    {
      id: "value",
      title: "Value",
      score: backendAnalysis.signals.value.score,
      badgeText: formatSignalBadgeText(
        backendAnalysis.signals.value.status,
        backendAnalysis.signals.value.score
      ),
      badgeType: getSignalStatusType(backendAnalysis.signals.value.score),
      description: backendAnalysis.signals.value.explanation,
      icon: "sparkles",
    },
    {
      id: "trust",
      title: "Trust",
      score: backendAnalysis.signals.trust.score,
      badgeText: formatSignalBadgeText(
        backendAnalysis.signals.trust.status,
        backendAnalysis.signals.trust.score
      ),
      badgeType: getSignalStatusType(backendAnalysis.signals.trust.score),
      description: backendAnalysis.signals.trust.explanation,
      icon: "shield",
    },
    {
      id: "action",
      title: "Action",
      score: backendAnalysis.signals.action.score,
      badgeText: formatSignalBadgeText(
        backendAnalysis.signals.action.status,
        backendAnalysis.signals.action.score
      ),
      badgeType: getSignalStatusType(backendAnalysis.signals.action.score),
      description: backendAnalysis.signals.action.explanation,
      icon: "arrow",
    },
  ];

  // Build recommendation
  const recommendation = {
    title: "If you change only one thing",
    subhead: backendAnalysis.priority_fix.title,
    explanation: backendAnalysis.priority_fix.reason,
    impact: backendAnalysis.priority_fix.impact || "high",
    currentDirection: `“ ${backendAnalysis.priority_fix.what_you_say_now || backendAnalysis.priority_fix.current_direction} ”`,
    strongerDirection: `“ ${backendAnalysis.priority_fix.clearer_direction || backendAnalysis.priority_fix.suggested_direction} ”`,
  };

  const websiteMessage = backendAnalysis.website_message
    ? {
        summary: backendAnalysis.website_message.summary,
        confidence: backendAnalysis.website_message.confidence,
      }
    : undefined;

  const risks = Array.isArray(backendAnalysis.risks)
    ? backendAnalysis.risks.map((r) => ({
        category: r.category,
        severity: r.severity,
        title: r.title,
        description: r.description,
        why_it_matters: r.why_it_matters,
      }))
    : [];

  // Build otherImprovements with rich, non-repetitive suggestions
  const otherImprovements = backendAnalysis.other_improvements.map((imp, idx) => {
    const lowerCombined = `${imp.title} ${imp.explanation}`.toLowerCase();
    let category = "trust";
    let icon = "shield";
    let color = "bg-blue-50 text-blue-600";

    if (
      lowerCombined.includes("audience") ||
      lowerCombined.includes("who") ||
      lowerCombined.includes("persona") ||
      lowerCombined.includes("role")
    ) {
      category = "audience";
      icon = "users";
      color = "bg-purple-50 text-purple-600";
    } else if (
      lowerCombined.includes("action") ||
      lowerCombined.includes("cta") ||
      lowerCombined.includes("button") ||
      lowerCombined.includes("step")
    ) {
      category = "action";
      icon = "zap";
      color = "bg-amber-50 text-amber-600";
    } else if (
      lowerCombined.includes("value") ||
      lowerCombined.includes("benefit") ||
      lowerCombined.includes("outcome")
    ) {
      category = "value";
      icon = "sparkles";
      color = "bg-emerald-50 text-emerald-600";
    }

    return {
      id: `${category}-${idx}`,
      title: imp.title,
      description: imp.explanation,
      whyItMatters:
        imp.why_it_matters ||
        (category === "trust"
          ? "First-time visitors look for immediate proof that others rely on this product before committing attention."
          : category === "audience"
          ? "First-time visitors look for an immediate indication of whether the product was built for their specific needs."
          : category === "action"
          ? "Unclear button labels or ambiguous commitments create hesitation at the primary next step."
          : "Visitors evaluate solutions based on tangible outcomes achieved, not features listed."),
      whatToImprove:
        imp.what_to_improve ||
        (category === "trust"
          ? "Place verifiable customer proof points or credentials near the primary CTA."
          : category === "audience"
          ? "Add a clear audience tag or role qualifier directly above or below the main headline."
          : category === "action"
          ? "Use concrete, low-friction action copy and clarify what occurs immediately after clicking."
          : "Restate the primary message to emphasize the visitor's concrete outcome."),
      copyableSuggestion: imp.copyable_suggestion ? imp.copyable_suggestion.trim() : undefined,
      icon,
      color,
    };
  });

  const resolvedSupportingContext =
    supportingContextOverride ?? backendAnalysis.supportingContext;

  return {
    domain: cleanDomain,
    score: backendAnalysis.overall_score,
    scoreStatus: scoreToStatus(backendAnalysis.overall_score),
    verdict: backendAnalysis.verdict.text,
    verdictSubtext: "First-time visitor perspective",
    quickSignals,
    firstSeconds,
    visitorThought: backendAnalysis.visitor_thought.text,
    evidence,
    signals,
    websiteMessage,
    risks,
    recommendation,
    otherImprovements,
    ...(resolvedSupportingContext
      ? { supportingContext: resolvedSupportingContext }
      : {}),
    isPartialAccess: snapshot?.stats ? snapshot.stats.cleanedTextLength < 200 : false,
    isAccessError: false,
    checkedAt: "Checked just now",
  };
}
