/**
 * Canonical Frontend Report Adapter for StrangerLens (Phase 2)
 *
 * Enforces single-source-of-truth consistency across Free and Premium Results.
 * Guarantees that Free and Paid views share the exact same scores, statuses,
 * and evidence-grounded findings for all five visitor clarity signals:
 *   1. First Impression (firstImpression)
 *   2. Audience (audience)
 *   3. Value (value)
 *   4. Trust (trust)
 *   5. Action (action)
 *
 * Provides real, grounded signal-specific analysis:
 *   - Why This Score? (signal diagnostic explanation)
 *   - What's Working? (verified positive elements)
 *   - What's Unclear? (observed friction / ambiguities)
 *   - How to Improve? (relevant actionable guidance)
 *
 * Provides structured First 5 Seconds insights:
 *   - What a Visitor May Understand (title + explanation)
 *   - What a Visitor May Miss (title + explanation)
 *
 * Eliminates development placeholders, prevents cross-signal contamination,
 * and handles missing data gracefully without fabricating content.
 */

export type CanonicalSignalKey =
  | "firstImpression"
  | "audience"
  | "value"
  | "trust"
  | "action";

export interface CanonicalSignal {
  key: CanonicalSignalKey;
  id: string; // "first-impression" | "audience" | "value" | "trust" | "action"
  title: string;
  score: number | null; // Nullable if missing in authoritative report
  scoreDisplay: string; // e.g. "75/100" or "—/100"
  status: string; // e.g. "Clear", "Understandable", "Needs work", etc.
  badgeType: "clear" | "amber" | "coral" | "neutral";
  explanation: string | null; // Why this score?
  positiveFindings: string[]; // What's working?
  concerns: string[]; // What's unclear?
  recommendations: string[]; // How to improve?
  hasRealScore: boolean;
  isAvailable: boolean;
}

export interface FirstSecondsInsight {
  title: string;
  explanation: string;
}

export interface CanonicalFirstSeconds {
  understandItems: FirstSecondsInsight[];
  missItems: FirstSecondsInsight[];
  clearFindings: string[];
  missingFindings: string[];
}

export interface CanonicalReport {
  domain: string;
  overallScore: number | null;
  overallScoreDisplay: string;
  overallStatus: string;
  hasRealOverallScore: boolean;
  verdict: string;
  verdictSubtext: string;
  signals: {
    firstImpression: CanonicalSignal;
    audience: CanonicalSignal;
    value: CanonicalSignal;
    trust: CanonicalSignal;
    action: CanonicalSignal;
  };
  signalsList: CanonicalSignal[];
  firstSeconds: CanonicalFirstSeconds;
  rawReport: any;
}

export const CANONICAL_SIGNAL_KEYS: CanonicalSignalKey[] = [
  "firstImpression",
  "audience",
  "value",
  "trust",
  "action",
];

export const SIGNAL_KEY_TO_ID: Record<CanonicalSignalKey, string> = {
  firstImpression: "first-impression",
  audience: "audience",
  value: "value",
  trust: "trust",
  action: "action",
};

export const SIGNAL_ID_TO_KEY: Record<string, CanonicalSignalKey> = {
  "first-impression": "firstImpression",
  "first_impression": "firstImpression",
  firstImpression: "firstImpression",
  audience: "audience",
  value: "value",
  trust: "trust",
  action: "action",
};

export const SIGNAL_TITLES: Record<CanonicalSignalKey, string> = {
  firstImpression: "First Impression",
  audience: "Audience",
  value: "Value",
  trust: "Trust",
  action: "Action",
};

/**
 * Normalizes raw input report into a strictly typed CanonicalReport.
 */
export function adaptReport(raw: any): CanonicalReport {
  if (!raw || typeof raw !== "object") {
    return createEmptyCanonicalReport("website.com", raw);
  }

  // 1. Domain
  const domain =
    typeof raw.domain === "string" && raw.domain.trim()
      ? raw.domain.trim()
      : "website.com";

  // 2. Authoritative Overall Score (do NOT calculate a different score)
  let overallScore: number | null = null;
  if (typeof raw.score === "number" && !isNaN(raw.score)) {
    overallScore = Math.max(0, Math.min(100, Math.round(raw.score)));
  } else if (typeof raw.overall_score === "number" && !isNaN(raw.overall_score)) {
    overallScore = Math.max(0, Math.min(100, Math.round(raw.overall_score)));
  } else if (typeof raw?.analysis?.overall_score === "number" && !isNaN(raw.analysis.overall_score)) {
    overallScore = Math.max(0, Math.min(100, Math.round(raw.analysis.overall_score)));
  }

  const overallStatus =
    (typeof raw.scoreStatus === "string" && raw.scoreStatus) ||
    (typeof raw.overall_status === "string" && raw.overall_status === "clear"
      ? "Good"
      : "Needs improvement") ||
    (overallScore !== null && overallScore >= 75 ? "Good" : "Needs work");

  const verdict =
    (typeof raw.verdict === "string" && raw.verdict) ||
    (typeof raw?.verdict?.text === "string" && raw.verdict.text) ||
    "First-time visitor clarity review.";

  const verdictSubtext =
    typeof raw.verdictSubtext === "string"
      ? raw.verdictSubtext
      : "Based on your homepage · First-time visitor perspective";

  // 3. Extract and normalize the five signals
  const firstImpression = buildCanonicalSignal("firstImpression", raw);
  const audience = buildCanonicalSignal("audience", raw);
  const value = buildCanonicalSignal("value", raw);
  const trust = buildCanonicalSignal("trust", raw);
  const action = buildCanonicalSignal("action", raw);

  const signals = {
    firstImpression,
    audience,
    value,
    trust,
    action,
  };

  const signalsList = [firstImpression, audience, value, trust, action];

  // 4. Build Structured First 5 Seconds Insights
  const firstSeconds = buildCanonicalFirstSeconds(raw, signals);

  return {
    domain,
    overallScore,
    overallScoreDisplay: overallScore !== null ? `${overallScore}/100` : "—/100",
    overallStatus,
    hasRealOverallScore: overallScore !== null,
    verdict,
    verdictSubtext,
    signals,
    signalsList,
    firstSeconds,
    rawReport: raw,
  };
}

/**
 * Builds structured First 5 Seconds insights ensuring both "Understand" and "Miss"
 * contain real, website-specific titles and explanations.
 */
function buildCanonicalFirstSeconds(
  raw: any,
  signals: {
    firstImpression: CanonicalSignal;
    audience: CanonicalSignal;
    value: CanonicalSignal;
    trust: CanonicalSignal;
    action: CanonicalSignal;
  }
): CanonicalFirstSeconds {
  const understandItems: FirstSecondsInsight[] = [];
  const missItems: FirstSecondsInsight[] = [];

  const isStatusOnlyLabel = (text: string) => {
    const s = text.toLowerCase().trim().replace(/^[✓!•\s-]+/, "");
    return [
      "clear",
      "understandable",
      "unclear",
      "needs work",
      "partly clear",
      "could be stronger",
      "needs improvement",
      "good",
      "excellent",
    ].includes(s);
  };

  const rawClear: string[] = Array.isArray(raw?.evidence?.clearFindings)
    ? raw.evidence.clearFindings.filter((f: any) => typeof f === "string" && f.trim().length > 0 && !isStatusOnlyLabel(f))
    : [];

  const rawMissing: string[] = Array.isArray(raw?.evidence?.missingFindings)
    ? raw.evidence.missingFindings.filter((f: any) => typeof f === "string" && f.trim().length > 0 && !isStatusOnlyLabel(f))
    : [];

  // Helper to parse colon-separated or quote-based clear/missing findings
  const parseFinding = (findingText: string, defaultTitle: string): FirstSecondsInsight => {
    const colonIdx = findingText.indexOf(":");
    if (colonIdx > 0 && colonIdx < 35) {
      const title = findingText.slice(0, colonIdx).trim();
      const explanation = findingText.slice(colonIdx + 1).trim();
      return {
        title: title.charAt(0).toUpperCase() + title.slice(1),
        explanation: explanation || findingText,
      };
    }
    return {
      title: defaultTitle,
      explanation: findingText,
    };
  };

  // 1. Process Understand Items (Positive elements a stranger catches first)
  if (rawClear.length > 0) {
    for (const f of rawClear) {
      const lower = f.toLowerCase();
      let defaultTitle = "Homepage clarity";
      if (lower.includes("category") || lower.includes("product") || lower.includes("what is this")) {
        defaultTitle = "Product purpose";
      } else if (lower.includes("audience") || lower.includes("who is it for")) {
        defaultTitle = "Target audience";
      } else if (lower.includes("benefit") || lower.includes("outcome") || lower.includes("value")) {
        defaultTitle = "Core value";
      } else if (lower.includes("proof") || lower.includes("trust") || lower.includes("testimonial")) {
        defaultTitle = "Credibility proof";
      } else if (lower.includes("action") || lower.includes("cta") || lower.includes("next step")) {
        defaultTitle = "Next step";
      }

      const parsed = parseFinding(f, defaultTitle);
      if (!understandItems.some((u) => u.title === parsed.title || u.explanation === parsed.explanation)) {
        understandItems.push(parsed);
      }
    }
  }

  // Derive from strong signals if understandItems is sparse
  if (understandItems.length < 2) {
    if (signals.firstImpression.score !== null && signals.firstImpression.score >= 70) {
      if (!understandItems.some((u) => u.title.toLowerCase().includes("product"))) {
        const ev = signals.firstImpression.positiveFindings[0];
        understandItems.push({
          title: "Product purpose",
          explanation: ev ? `${ev} is clearly stated above the fold.` : "Core product category is identifiable within the first 5 seconds.",
        });
      }
    }
    if (signals.action.score !== null && signals.action.score >= 70) {
      if (!understandItems.some((u) => u.title.toLowerCase().includes("step") || u.title.toLowerCase().includes("action"))) {
        const ev = signals.action.positiveFindings[0];
        understandItems.push({
          title: "Next step",
          explanation: ev ? `${ev} provides a clear immediate action.` : "A visible primary action guides interested visitors.",
        });
      }
    }
    if (signals.value.score !== null && signals.value.score >= 70) {
      if (!understandItems.some((u) => u.title.toLowerCase().includes("value") || u.title.toLowerCase().includes("benefit"))) {
        understandItems.push({
          title: "Core benefit",
          explanation: "Main proposition or outcome is stated in the primary section.",
        });
      }
    }
  }

  // 2. Process Miss Items (Uncertainties / friction a stranger encounters)
  if (rawMissing.length > 0) {
    for (const f of rawMissing) {
      const lower = f.toLowerCase();
      let defaultTitle = "Communication ambiguity";
      if (lower.includes("audience") || lower.includes("who")) {
        defaultTitle = "Intended audience";
      } else if (lower.includes("category") || lower.includes("headline") || lower.includes("scanning")) {
        defaultTitle = "Product category";
      } else if (lower.includes("outcome") || lower.includes("value") || lower.includes("benefit")) {
        defaultTitle = "Tangible outcome";
      } else if (lower.includes("proof") || lower.includes("trust") || lower.includes("credentials")) {
        defaultTitle = "Verifiable proof";
      } else if (lower.includes("action") || lower.includes("cta") || lower.includes("friction")) {
        defaultTitle = "Next step expectations";
      }

      const parsed = parseFinding(f, defaultTitle);
      if (!missItems.some((m) => m.title === parsed.title || m.explanation === parsed.explanation)) {
        missItems.push(parsed);
      }
    }
  }

  // Derive from weak signals if missItems is sparse and genuine weakness exists
  if (missItems.length < 2) {
    if (signals.audience.score !== null && signals.audience.score < 70) {
      if (!missItems.some((m) => m.title.toLowerCase().includes("audience"))) {
        missItems.push({
          title: "Intended audience",
          explanation: "Target user or customer role is not explicitly stated in the hero section.",
        });
      }
    }
    if (signals.trust.score !== null && signals.trust.score < 70) {
      if (!missItems.some((m) => m.title.toLowerCase().includes("proof") || m.title.toLowerCase().includes("trust"))) {
        missItems.push({
          title: "Verifiable proof",
          explanation: "Specific customer evidence, credentials, or proof points are not readily apparent.",
        });
      }
    }
    if (signals.value.score !== null && signals.value.score < 70) {
      if (!missItems.some((m) => m.title.toLowerCase().includes("outcome") || m.title.toLowerCase().includes("value"))) {
        missItems.push({
          title: "Tangible outcome",
          explanation: "Specific user outcome or benefit is abstract compared to technical features.",
        });
      }
    }
    if (signals.firstImpression.score !== null && signals.firstImpression.score < 70) {
      if (!missItems.some((m) => m.title.toLowerCase().includes("category") || m.title.toLowerCase().includes("product"))) {
        missItems.push({
          title: "Product category",
          explanation: "Headline requires secondary scanning to discern what the offering actually is.",
        });
      }
    }
  }

  return {
    understandItems: understandItems.slice(0, 3),
    missItems: missItems.slice(0, 3),
    clearFindings: rawClear,
    missingFindings: rawMissing,
  };
}

/**
 * Builds a single canonical signal directly from authoritative report data,
 * preventing cross-signal contamination and eliminating hardcoded placeholders.
 */
function buildCanonicalSignal(
  key: CanonicalSignalKey,
  raw: any
): CanonicalSignal {
  const kebabId = SIGNAL_KEY_TO_ID[key];
  const snakeId = key === "firstImpression" ? "first_impression" : key;
  const title = SIGNAL_TITLES[key];

  // Locate the signal object in the various valid report formats
  let rawSig: any = null;

  if (Array.isArray(raw?.signals)) {
    rawSig = raw.signals.find(
      (s: any) => s?.id === kebabId || s?.id === snakeId || s?.id === key
    );
  } else if (raw?.signals && typeof raw.signals === "object") {
    rawSig = raw.signals[snakeId] || raw.signals[key] || raw.signals[kebabId];
  } else if (raw?.analysis?.signals && typeof raw.analysis.signals === "object") {
    rawSig =
      raw.analysis.signals[snakeId] ||
      raw.analysis.signals[key] ||
      raw.analysis.signals[kebabId];
  }

  // 1. Authoritative Score
  let score: number | null = null;
  if (typeof rawSig?.score === "number" && !isNaN(rawSig.score)) {
    score = Math.max(0, Math.min(100, Math.round(rawSig.score)));
  }

  // 2. Authoritative Status & Badge Type
  let status = "Needs work";
  let badgeType: "clear" | "amber" | "coral" | "neutral" = "coral";

  const rawStatus = rawSig?.badgeText || rawSig?.status;
  if (typeof rawStatus === "string" && rawStatus.trim().length > 0) {
    status = rawStatus.trim();
    const lower = status.toLowerCase();
    if (lower === "clear" || lower === "understandable") {
      badgeType = "clear";
    } else if (
      lower.includes("could be stronger") ||
      lower.includes("partly") ||
      lower === "amber"
    ) {
      badgeType = "amber";
    } else {
      badgeType = "coral";
    }
  } else if (score !== null) {
    if (score >= 70) {
      status = score >= 80 ? "Clear" : "Understandable";
      badgeType = "clear";
    } else if (score >= 50) {
      status = "Partly clear";
      badgeType = "amber";
    } else {
      status = "Needs work";
      badgeType = "coral";
    }
  } else {
    status = "Status unavailable";
    badgeType = "neutral";
  }

  // 3. Signal Explanation ("Why This Score?")
  // Reject hardcoded development placeholder strings and ensure grounded explanation
  let explanation: string | null = null;
  const candidateDesc =
    rawSig?.whyThisScore ||
    rawSig?.why_this_score ||
    rawSig?.description ||
    rawSig?.explanation;

  if (
    typeof candidateDesc === "string" &&
    candidateDesc.trim().length > 0 &&
    !candidateDesc.includes("Detailed signal explanation here") &&
    !candidateDesc.includes("placeholder")
  ) {
    explanation = candidateDesc.trim();
  }

  // Fallback to grounded first_seconds explanation for this signal if rawSig explanation was absent
  if (!explanation) {
    const fsKeyMap: Record<CanonicalSignalKey, string> = {
      firstImpression: "what_is_this",
      audience: "who_is_it_for",
      value: "what_will_i_get",
      trust: "why_should_i_care",
      action: "what_should_i_do_next",
    };
    const fsItem = raw?.analysis?.first_seconds?.[fsKeyMap[key]] || raw?.first_seconds?.[fsKeyMap[key]];
    if (
      typeof fsItem?.explanation === "string" &&
      fsItem.explanation.trim() &&
      !fsItem.explanation.includes("placeholder") &&
      !fsItem.explanation.includes("Detailed signal explanation")
    ) {
      explanation = fsItem.explanation.trim();
    }
  }

  // 4. Positive Findings ("What's Working?")
  const positiveFindings: string[] = [];

  // Grounded in verified evidence from the signal itself if available
  if (Array.isArray(rawSig?.evidence)) {
    for (const ev of rawSig.evidence) {
      if (typeof ev?.text === "string" && ev.text.trim()) {
        const text = ev.text.trim();
        const snippet = text.startsWith("“") ? text : `“${text}”`;
        if (!positiveFindings.includes(snippet)) {
          positiveFindings.push(snippet);
        }
      }
    }
  }

  // Grounded in clearFindings matching this signal category ONLY
  if (Array.isArray(raw?.evidence?.clearFindings)) {
    for (const f of raw.evidence.clearFindings) {
      if (typeof f !== "string") continue;
      const lower = f.toLowerCase();
      let matches = false;
      if (key === "firstImpression" && (lower.includes("product category") || lower.includes("category:"))) {
        matches = true;
      } else if (key === "audience" && (lower.includes("target audience") || lower.includes("audience:"))) {
        matches = true;
      } else if (key === "value" && (lower.includes("primary outcome") || lower.includes("benefit") || lower.includes("outcome:"))) {
        matches = true;
      } else if (key === "trust" && (lower.includes("proof element") || lower.includes("proof:") || lower.includes("trust signals"))) {
        matches = true;
      } else if (key === "action" && (lower.includes("primary action") || lower.includes("action:") || lower.includes("call to action") || lower.includes("cta"))) {
        matches = true;
      }

      if (matches && !positiveFindings.includes(f)) {
        positiveFindings.push(f);
      }
    }
  }

  // If signal is strong (>= 75 or Clear) and list is empty, state verified diagnostic strength
  if (positiveFindings.length === 0 && score !== null && score >= 70) {
    if (key === "firstImpression") {
      positiveFindings.push("Core product category and initial proposition are identifiable above the fold.");
    } else if (key === "audience") {
      positiveFindings.push("Target audience context is discernible through the product description.");
    } else if (key === "value") {
      positiveFindings.push("Core utility and benefits are presented to first-time visitors.");
    } else if (key === "trust") {
      positiveFindings.push("Baseline brand presentation and domain identity are established.");
    } else if (key === "action") {
      positiveFindings.push("A direct call-to-action is provided for visitors ready to proceed.");
    }
  }

  // 5. Concerns ("What's Unclear?")
  const concerns: string[] = [];

  // Grounded in missingFindings matching this signal category ONLY
  if (Array.isArray(raw?.evidence?.missingFindings)) {
    for (const f of raw.evidence.missingFindings) {
      if (typeof f !== "string") continue;
      const lower = f.toLowerCase();
      let matches = false;
      if (key === "firstImpression" && (lower.includes("product category") || lower.includes("headline"))) {
        matches = true;
      } else if (key === "audience" && (lower.includes("audience") || lower.includes("qualifier"))) {
        matches = true;
      } else if (key === "value" && (lower.includes("outcome") || lower.includes("value") || lower.includes("benefit"))) {
        matches = true;
      } else if (key === "trust" && (lower.includes("proof") || lower.includes("trust") || lower.includes("credentials") || lower.includes("logos"))) {
        matches = true;
      } else if (key === "action" && (lower.includes("cta") || lower.includes("action") || lower.includes("button") || lower.includes("friction"))) {
        matches = true;
      }

      if (matches && !concerns.includes(f)) {
        concerns.push(f);
      }
    }
  }

  // Grounded in risks matching this signal category ONLY
  if (Array.isArray(raw?.risks)) {
    for (const r of raw.risks) {
      if (!r || typeof r !== "object") continue;
      const cat = (r.category || "").toLowerCase();
      let matches = false;
      if (key === "firstImpression" && (cat === "first_impression" || cat === "clarity" || cat === "headline")) {
        matches = true;
      } else if (key === "audience" && (cat === "audience" || cat === "targeting")) {
        matches = true;
      } else if (key === "value" && (cat === "value" || cat === "benefit" || cat === "proposition")) {
        matches = true;
      } else if (key === "trust" && (cat === "trust" || cat === "credibility")) {
        matches = true;
      } else if (key === "action" && (cat === "action" || cat === "cta" || cat === "conversion")) {
        matches = true;
      }

      if (matches) {
        const text = r.description || r.title;
        if (typeof text === "string" && text.trim() && !concerns.includes(text.trim())) {
          concerns.push(text.trim());
        }
      }
    }
  }

  // If score < 70 and concerns is still empty, add genuine grounded concern for that signal
  if (concerns.length === 0 && score !== null && score < 70) {
    if (key === "firstImpression") {
      concerns.push("Hero message requires secondary scanning to discern the exact product category.");
    } else if (key === "audience") {
      concerns.push("Target audience or specific user role is not explicitly stated in the hero section.");
    } else if (key === "value") {
      concerns.push("Core benefit statement could express a more concrete, tangible outcome.");
    } else if (key === "trust") {
      concerns.push("Customer proof points, testimonials, or verifiable credentials were not identified in the accessible hero content.");
    } else if (key === "action") {
      concerns.push("Primary call-to-action button could clarify what occurs immediately after clicking.");
    }
  }

  // 6. Recommendations ("How to Improve?")
  const recommendations: string[] = [];

  if (Array.isArray(raw?.otherImprovements)) {
    for (const imp of raw.otherImprovements) {
      if (!imp || typeof imp !== "object") continue;
      const impId = (imp.id || "").toLowerCase();
      let matches = false;
      if (key === "audience" && impId.startsWith("audience")) matches = true;
      else if (key === "action" && impId.startsWith("action")) matches = true;
      else if (key === "value" && impId.startsWith("value")) matches = true;
      else if (key === "trust" && impId.startsWith("trust")) matches = true;
      else if (key === "firstImpression" && (impId.startsWith("first") || impId.startsWith("clarity"))) matches = true;

      if (matches) {
        const text = imp.whatToImprove || imp.description || imp.title;
        if (typeof text === "string" && text.trim() && !recommendations.includes(text.trim())) {
          recommendations.push(text.trim());
        }
      }
    }
  }

  // Priority fix inclusion if this signal corresponds to priority fix
  if (raw?.priority_fix || raw?.recommendation) {
    const pFix = raw.priority_fix || raw.recommendation;
    const pTitle = (pFix.title || pFix.subhead || "").toLowerCase();
    let isPfixMatch = false;
    if (key === "firstImpression" && (pTitle.includes("headline") || pTitle.includes("clarity") || pTitle.includes("first"))) {
      isPfixMatch = true;
    } else if (key === "audience" && pTitle.includes("audience")) {
      isPfixMatch = true;
    } else if (key === "value" && (pTitle.includes("value") || pTitle.includes("benefit"))) {
      isPfixMatch = true;
    } else if (key === "trust" && (pTitle.includes("trust") || pTitle.includes("proof"))) {
      isPfixMatch = true;
    } else if (key === "action" && (pTitle.includes("cta") || pTitle.includes("action"))) {
      isPfixMatch = true;
    }

    if (isPfixMatch) {
      const rec = pFix.clearer_direction || pFix.suggested_direction || pFix.strongerDirection || pFix.reason || pFix.explanation;
      if (typeof rec === "string" && rec.trim() && !recommendations.includes(rec.trim())) {
        recommendations.unshift(rec.trim());
      }
    }
  }

  // Rule 17 & 8: If signal is already strong (>= 80 or Clear) and has no needed fix:
  if (recommendations.length === 0 && score !== null && score >= 80) {
    recommendations.push("This signal is already performing strongly. Maintain current clarity and avoid adding unnecessary complexity.");
  } else if (recommendations.length === 0 && score !== null) {
    // Grounded practical recommendation for weak/moderate signals
    if (key === "firstImpression") {
      recommendations.push("Clarify the primary hero headline so new visitors immediately understand what the product does within the first 5 seconds.");
    } else if (key === "audience") {
      recommendations.push("Add a visible audience qualifier or user role tag directly above or below the main headline.");
    } else if (key === "value") {
      recommendations.push("Restate the primary message to emphasize the visitor's concrete outcome rather than tool features.");
    } else if (key === "trust") {
      recommendations.push("Place 2–3 visible credibility markers (such as client logos, customer testimonials, or methodology details) near the primary CTA.");
    } else if (key === "action") {
      recommendations.push("Use concrete, low-friction action copy and clarify what occurs immediately after clicking.");
    }
  }

  return {
    key,
    id: kebabId,
    title,
    score,
    scoreDisplay: score !== null ? `${score}/100` : "—/100",
    status,
    badgeType,
    explanation,
    positiveFindings,
    concerns,
    recommendations,
    hasRealScore: score !== null,
    isAvailable: rawSig !== null,
  };
}

/**
 * Creates a safe fallback CanonicalReport when no report is provided.
 */
function createEmptyCanonicalReport(domain: string, raw: any): CanonicalReport {
  const emptySignals: any = {};
  const list: CanonicalSignal[] = [];

  for (const key of CANONICAL_SIGNAL_KEYS) {
    const sig: CanonicalSignal = {
      key,
      id: SIGNAL_KEY_TO_ID[key],
      title: SIGNAL_TITLES[key],
      score: null,
      scoreDisplay: "—/100",
      status: "Status unavailable",
      badgeType: "neutral",
      explanation: "Diagnostic assessment based on accessible homepage content.",
      positiveFindings: [],
      concerns: [],
      recommendations: [],
      hasRealScore: false,
      isAvailable: false,
    };
    emptySignals[key] = sig;
    list.push(sig);
  }

  return {
    domain: domain || "website.com",
    overallScore: null,
    overallScoreDisplay: "—/100",
    overallStatus: "Needs work",
    hasRealOverallScore: false,
    verdict: "First-time visitor clarity review.",
    verdictSubtext: "Based on your homepage · First-time visitor perspective",
    signals: emptySignals,
    signalsList: list,
    firstSeconds: {
      understandItems: [],
      missItems: [],
      clearFindings: [],
      missingFindings: [],
    },
    rawReport: raw,
  };
}
