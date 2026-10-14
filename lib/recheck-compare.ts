export type CanonicalSignalKey =
  | "first-impression"
  | "audience"
  | "value"
  | "trust"
  | "action";

export interface StoredHistoryRecord {
  domain: string;
  score: number;
  date: string;
  signals?: Partial<Record<CanonicalSignalKey, number>>;
}

export interface SignalComparisonRow {
  id: CanonicalSignalKey;
  label: string;
  beforeScore: number | null;
  afterScore: number | null;
  delta: number | null;
  deltaText: string | null;
  status: "Scored higher" | "Scored lower" | "Score unchanged" | "Not recorded in previous check.";
}

export interface ComparisonEvaluation {
  isEligible: boolean;
  unavailableReason:
    | "no_previous_report"
    | "domain_mismatch"
    | "invalid_score"
    | "ambiguous_order"
    | null;
  domain: string | null;
  previousDate: string | null;
  overall: {
    beforeScore: number;
    afterScore: number;
    delta: number;
    deltaText: string;
    status: "Scored higher" | "Scored lower" | "Score unchanged";
  } | null;
  hasHistoricalSignalScores: boolean;
  signals: SignalComparisonRow[];
  interpretationSummary: string | null;
  methodologyNote: string;
}

export const CANONICAL_COMPARE_SIGNALS: ReadonlyArray<{
  id: CanonicalSignalKey;
  label: string;
}> = [
  { id: "first-impression", label: "First Impression" },
  { id: "audience", label: "Audience" },
  { id: "value", label: "Value" },
  { id: "trust", label: "Trust" },
  { id: "action", label: "Action" },
];

export const METHODOLOGY_VARIABILITY_NOTE =
  "Scores are AI-assisted assessments of accessible website content and may vary between scans. A score change does not necessarily mean visitor behavior has changed.";

/**
 * Validates that a value is a finite numeric score within [0, 100].
 */
export function isValidScore(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    !Number.isNaN(value) &&
    value >= 0 &&
    value <= 100
  );
}

/**
 * Normalizes any URL or domain string into a canonical lowercase hostname
 * without leading `www.`, protocol, port, path, query, or hash.
 * Returns null if the input is empty, placeholder, or invalid.
 */
export function normalizeComparisonDomain(rawInput?: string | null): string | null {
  if (typeof rawInput !== "string") return null;
  let cleaned = rawInput.trim().toLowerCase();
  if (!cleaned || cleaned === "website.com") return null;

  try {
    if (!/^https?:\/\//i.test(cleaned)) {
      cleaned = `https://${cleaned}`;
    }
    const parsed = new URL(cleaned);
    const host = parsed.hostname.replace(/^www\./i, "").replace(/\.$/, "").trim();
    if (!host || host === "website.com" || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) {
      return null;
    }
    return host;
  } catch {
    const fallbackHost = cleaned
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split(/[/?#:]/)[0]
      .replace(/\.$/, "")
      .trim();
    if (
      !fallbackHost ||
      fallbackHost === "website.com" ||
      !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(fallbackHost)
    ) {
      return null;
    }
    return fallbackHost;
  }
}

/**
 * Extracts a compact map of validated signal scores from a signals array.
 */
export function buildCompactSignalScores(
  signals?: ReadonlyArray<{ id: string; score: number }> | null
): Partial<Record<CanonicalSignalKey, number>> | undefined {
  if (!Array.isArray(signals) || signals.length === 0) return undefined;
  const map: Partial<Record<CanonicalSignalKey, number>> = {};
  let count = 0;

  for (const sig of signals) {
    if (!sig || typeof sig.id !== "string") continue;
    const key = sig.id as CanonicalSignalKey;
    if (
      CANONICAL_COMPARE_SIGNALS.some((c) => c.id === key) &&
      isValidScore(sig.score)
    ) {
      map[key] = Math.round(sig.score);
      count++;
    }
  }

  return count > 0 ? map : undefined;
}

/**
 * Sanitizes an unknown signal score map from storage.
 */
function sanitizeStoredSignals(
  rawSignals: unknown
): Partial<Record<CanonicalSignalKey, number>> | undefined {
  if (!rawSignals || typeof rawSignals !== "object" || Array.isArray(rawSignals)) {
    return undefined;
  }
  const record = rawSignals as Record<string, unknown>;
  const cleaned: Partial<Record<CanonicalSignalKey, number>> = {};
  let count = 0;

  for (const canon of CANONICAL_COMPARE_SIGNALS) {
    const val = record[canon.id];
    if (isValidScore(val)) {
      cleaned[canon.id] = Math.round(val);
      count++;
    }
  }

  return count > 0 ? cleaned : undefined;
}

/**
 * Safely parses and validates stored history JSON without throwing.
 * Filters out corrupted entries, invalid scores, invalid domains, and unparseable dates.
 */
export function parseStoredHistory(
  rawJson: string | null | undefined
): { records: StoredHistoryRecord[]; hadCorruptedData: boolean } {
  if (!rawJson || typeof rawJson !== "string" || !rawJson.trim()) {
    return { records: [], hadCorruptedData: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { records: [], hadCorruptedData: true };
  }

  if (!Array.isArray(parsed)) {
    return { records: [], hadCorruptedData: true };
  }

  const validRecords: StoredHistoryRecord[] = [];
  let hadCorruptedData = false;
  const seenKeys = new Set<string>();

  for (const item of parsed) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      hadCorruptedData = true;
      continue;
    }

    const candidate = item as Record<string, unknown>;
    const normDomain = normalizeComparisonDomain(
      typeof candidate.domain === "string" ? candidate.domain : null
    );
    const rawScore = candidate.score;
    const rawDate = typeof candidate.date === "string" ? candidate.date.trim() : "";
    const parsedTime = rawDate ? Date.parse(rawDate) : Number.NaN;

    if (!normDomain || !isValidScore(rawScore) || !Number.isFinite(parsedTime)) {
      hadCorruptedData = true;
      continue;
    }

    // Deduplicate identical domain+score+timestamp entries caused by prior rerenders
    const dedupeKey = `${normDomain}|${Math.round(rawScore)}|${rawDate.slice(0, 19)}`;
    if (seenKeys.has(dedupeKey)) {
      continue;
    }
    seenKeys.add(dedupeKey);

    const signals = sanitizeStoredSignals(candidate.signals);

    validRecords.push({
      domain: normDomain,
      score: Math.round(rawScore),
      date: rawDate,
      ...(signals ? { signals } : {}),
    });
  }

  return { records: validRecords, hadCorruptedData };
}

/**
 * Evaluates comparison eligibility and computes Before -> After deltas
 * strictly from verified numeric scores without fabricating missing history.
 */
export function evaluateComparisonEligibility(params: {
  currentDomainInput?: string | null;
  currentScore?: unknown;
  currentSignals?: ReadonlyArray<{ id: string; title?: string; score: number }> | null;
  previousRecord?: Partial<StoredHistoryRecord> | null;
  currentTimestampMs?: number;
}): ComparisonEvaluation {
  const {
    currentDomainInput,
    currentScore,
    currentSignals,
    previousRecord,
    currentTimestampMs = Date.now(),
  } = params;

  const normCurrentDomain = normalizeComparisonDomain(currentDomainInput);

  if (!previousRecord) {
    return {
      isEligible: false,
      unavailableReason: "no_previous_report",
      domain: normCurrentDomain,
      previousDate: null,
      overall: null,
      hasHistoricalSignalScores: false,
      signals: [],
      interpretationSummary: null,
      methodologyNote: METHODOLOGY_VARIABILITY_NOTE,
    };
  }

  const normPrevDomain = normalizeComparisonDomain(previousRecord.domain);
  if (!normCurrentDomain || !normPrevDomain || normCurrentDomain !== normPrevDomain) {
    return {
      isEligible: false,
      unavailableReason: "domain_mismatch",
      domain: normCurrentDomain,
      previousDate: null,
      overall: null,
      hasHistoricalSignalScores: false,
      signals: [],
      interpretationSummary: null,
      methodologyNote: METHODOLOGY_VARIABILITY_NOTE,
    };
  }

  if (!isValidScore(currentScore) || !isValidScore(previousRecord.score)) {
    return {
      isEligible: false,
      unavailableReason: "invalid_score",
      domain: normCurrentDomain,
      previousDate: null,
      overall: null,
      hasHistoricalSignalScores: false,
      signals: [],
      interpretationSummary: null,
      methodologyNote: METHODOLOGY_VARIABILITY_NOTE,
    };
  }

  const rawPrevDate =
    typeof previousRecord.date === "string" ? previousRecord.date.trim() : "";
  const prevTimeMs = rawPrevDate ? Date.parse(rawPrevDate) : Number.NaN;

  // Order must be reliable: previous report must have a valid timestamp not after current report
  if (!Number.isFinite(prevTimeMs) || prevTimeMs > currentTimestampMs + 5000) {
    return {
      isEligible: false,
      unavailableReason: "ambiguous_order",
      domain: normCurrentDomain,
      previousDate: null,
      overall: null,
      hasHistoricalSignalScores: false,
      signals: [],
      interpretationSummary: null,
      methodologyNote: METHODOLOGY_VARIABILITY_NOTE,
    };
  }

  const beforeScore = Math.round(previousRecord.score);
  const afterScore = Math.round(currentScore);
  const overallDelta = afterScore - beforeScore;

  const overallStatus: "Scored higher" | "Scored lower" | "Score unchanged" =
    overallDelta > 0 ? "Scored higher" : overallDelta < 0 ? "Scored lower" : "Score unchanged";

  const absDelta = Math.abs(overallDelta);
  const pointWord = absDelta === 1 ? "point" : "points";
  const overallDeltaText =
    overallDelta > 0
      ? `+${overallDelta} ${pointWord}`
      : overallDelta < 0
      ? `${overallDelta} ${pointWord}`
      : "0 points";

  const interpretationSummary =
    overallDelta > 0
      ? `Your latest assessment scored ${overallDelta} ${pointWord} higher.`
      : overallDelta < 0
      ? `Your latest assessment scored ${absDelta} ${pointWord} lower.`
      : `Your latest assessment scored the same as the previous check (${afterScore}/100).`;

  const sanitizedPrevSignals = sanitizeStoredSignals(previousRecord.signals);
  let hasHistoricalSignalScores = false;

  const signalRows: SignalComparisonRow[] = CANONICAL_COMPARE_SIGNALS.map((canon) => {
    const matchedCurrent = (currentSignals || []).find((s) => s.id === canon.id);
    const afterSigScore =
      matchedCurrent && isValidScore(matchedCurrent.score)
        ? Math.round(matchedCurrent.score)
        : null;

    const beforeSigScore =
      sanitizedPrevSignals && isValidScore(sanitizedPrevSignals[canon.id])
        ? Math.round(sanitizedPrevSignals[canon.id]!)
        : null;

    if (beforeSigScore !== null && afterSigScore !== null) {
      hasHistoricalSignalScores = true;
      const sigDelta = afterSigScore - beforeSigScore;
      const sigStatus: "Scored higher" | "Scored lower" | "Score unchanged" =
        sigDelta > 0 ? "Scored higher" : sigDelta < 0 ? "Scored lower" : "Score unchanged";
      const sigDeltaText =
        sigDelta > 0 ? `+${sigDelta}` : sigDelta < 0 ? `${sigDelta}` : "0";

      return {
        id: canon.id,
        label: canon.label,
        beforeScore: beforeSigScore,
        afterScore: afterSigScore,
        delta: sigDelta,
        deltaText: sigDeltaText,
        status: sigStatus,
      };
    }

    return {
      id: canon.id,
      label: canon.label,
      beforeScore: null,
      afterScore: afterSigScore,
      delta: null,
      deltaText: null,
      status: "Not recorded in previous check.",
    };
  });

  return {
    isEligible: true,
    unavailableReason: null,
    domain: normCurrentDomain,
    previousDate: rawPrevDate,
    overall: {
      beforeScore,
      afterScore,
      delta: overallDelta,
      deltaText: overallDeltaText,
      status: overallStatus,
    },
    hasHistoricalSignalScores,
    signals: signalRows,
    interpretationSummary,
    methodologyNote: METHODOLOGY_VARIABILITY_NOTE,
  };
}

// Track report object references in memory so React StrictMode double-mounts or
// component re-renders never overwrite `previousRecord` with the current scan itself
const processedReportInstances = new WeakMap<
  object,
  {
    previousRecord: StoredHistoryRecord | null;
    hadCorruptedData: boolean;
  }
>();

/**
 * Reads the most recent valid previous report for the same normalized domain
 * from localStorage BEFORE persisting the current report, preventing self-comparison
 * and duplicate rerender entries.
 */
export function syncReportWithHistoryStorage(params: {
  reportInstanceKey: object;
  domainInput: string;
  score: unknown;
  signals?: ReadonlyArray<{ id: string; score: number }> | null;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  nowIso?: string;
}): {
  previousRecord: StoredHistoryRecord | null;
  hadCorruptedData: boolean;
} {
  const {
    reportInstanceKey,
    domainInput,
    score,
    signals,
    storage = typeof window !== "undefined" ? window.localStorage : null,
    nowIso = new Date().toISOString(),
  } = params;

  if (processedReportInstances.has(reportInstanceKey)) {
    return processedReportInstances.get(reportInstanceKey)!;
  }

  const normDomain = normalizeComparisonDomain(domainInput);
  if (!normDomain || !isValidScore(score) || !storage) {
    return { previousRecord: null, hadCorruptedData: false };
  }

  try {
    const primaryRaw = storage.getItem("percept_history");
    const legacyRaw = !primaryRaw ? storage.getItem("valuecheck_history") : null;
    const rawToParse = primaryRaw ?? legacyRaw;

    const { records: existingHistory, hadCorruptedData } =
      parseStoredHistory(rawToParse);

    const domainMatches = existingHistory
      .filter((item) => item.domain === normDomain)
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

    const previousRecord = domainMatches.length > 0 ? domainMatches[0] : null;

    const compactSignals = buildCompactSignalScores(signals);
    const currentRecord: StoredHistoryRecord = {
      domain: normDomain,
      score: Math.round(score),
      date: nowIso,
      ...(compactSignals ? { signals: compactSignals } : {}),
    };

    const updatedHistory = [currentRecord, ...existingHistory].slice(0, 15);
    storage.setItem("percept_history", JSON.stringify(updatedHistory));

    const result = { previousRecord, hadCorruptedData };
    processedReportInstances.set(reportInstanceKey, result);
    return result;
  } catch {
    // Graceful fallback if localStorage is disabled or throws QuotaExceededError / SecurityError
    return { previousRecord: null, hadCorruptedData: false };
  }
}
