import { STATUS_SCORE_RANGES, scoreToDeterministicStatus } from "./scoringConfig";
import { ValidatedEvidenceRef, ConfidenceLevel } from "@/types/validatedAnalysis";

export type DimensionEvidenceSupport = "supported" | "weak" | "unsupported";

export interface NormalizedSignalResult {
  finalScore: number;
  finalStatus: string;
  finalConfidence: ConfidenceLevel;
}

/**
 * Normalizes an initial AI signal score and status deterministically
 * based on score ranges, evidence verification status, dimension-specific support, and sanity rules.
 */
export function normalizeSignalScore(
  rawScore: unknown,
  status: string,
  verifiedEvidence: ValidatedEvidenceRef[],
  initialConfidence: ConfidenceLevel = "medium",
  dimensionSupport: DimensionEvidenceSupport = "supported"
): NormalizedSignalResult {
  const normStatus = (status || "").toLowerCase().trim();
  const rangeConfig = STATUS_SCORE_RANGES[normStatus] || STATUS_SCORE_RANGES["partly_clear"];

  // 1. Handle missing, NaN, non-numeric, or malformed score
  let numericScore: number;
  if (typeof rawScore !== "number" || Number.isNaN(rawScore) || !Number.isFinite(rawScore)) {
    numericScore = rangeConfig.defaultScore;
  } else {
    numericScore = rawScore;
  }

  // 2. Clamp score to bounds [0, 100]
  numericScore = Math.max(0, Math.min(100, Math.round(numericScore)));

  // 3. Resolve contradictions between initial status & score
  const verifiedCount = verifiedEvidence.filter((e) => e.status === "verified").length;
  if ((normStatus === "unclear" || normStatus === "needs_work") && numericScore > rangeConfig.max) {
    numericScore = rangeConfig.max;
  }
  if (
    (normStatus === "clear" || normStatus === "understandable") &&
    numericScore < rangeConfig.min &&
    verifiedCount > 0 &&
    dimensionSupport === "supported"
  ) {
    numericScore = rangeConfig.min;
  }

  // 4. Evidence grounding & dimension relevance adjustment
  let finalConfidence = initialConfidence;

  if (dimensionSupport === "unsupported") {
    // Dimension lacks explicit supporting evidence in the verified quotes or snapshot
    if (finalConfidence === "high") {
      finalConfidence = "medium";
    }
    if (numericScore > 65) {
      numericScore = 62;
    }
  } else if (dimensionSupport === "weak") {
    if (finalConfidence === "high") {
      finalConfidence = "medium";
    }
    if (numericScore > 78) {
      numericScore = 75;
    }
  } else if (verifiedCount === 0) {
    // Zero verified evidence: cap confidence to low or medium, and penalize high scores
    if (finalConfidence === "high") {
      finalConfidence = "medium";
    }
    if (numericScore > 75) {
      numericScore = Math.min(numericScore, 75);
    }
  } else if (verifiedCount >= 2 && (finalConfidence === "medium" || finalConfidence === "low")) {
    finalConfidence = "high";
  }

  const finalScore = Math.round(numericScore);
  const finalStatus = scoreToDeterministicStatus(finalScore, normStatus);

  return {
    finalScore,
    finalStatus,
    finalConfidence,
  };
}
