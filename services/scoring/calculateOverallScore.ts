import { SIGNAL_WEIGHTS, OVERALL_CLEAR_THRESHOLD } from "./scoringConfig";
import { ValidatedOverallStatus } from "@/types/validatedAnalysis";

export interface SignalScoresInput {
  first_impression: number;
  audience: number;
  value: number;
  trust: number;
  action: number;
}

export interface OverallCalculationResult {
  overallScore: number; // 0..100 integer
  overallStatus: ValidatedOverallStatus;
}

/**
 * Calculates the final overall Percept score deterministically using weighted formula.
 * Formula:
 * overall = (first_impression * 0.25) + (audience * 0.20) + (value * 0.25) + (trust * 0.15) + (action * 0.15)
 */
export function calculateOverallScore(scores: SignalScoresInput): OverallCalculationResult {
  const w = SIGNAL_WEIGHTS;

  // Validate weight sum equals 1.00
  const weightSum = w.first_impression + w.audience + w.value + w.trust + w.action;
  if (Math.abs(weightSum - 1.0) > 0.0001) {
    throw new Error(`Scoring configuration error: weights must sum to 1.0, got ${weightSum}`);
  }

  const rawSum =
    scores.first_impression * w.first_impression +
    scores.audience * w.audience +
    scores.value * w.value +
    scores.trust * w.trust +
    scores.action * w.action;

  const roundedOverallScore = Math.max(0, Math.min(100, Math.round(rawSum)));
  const overallStatus: ValidatedOverallStatus =
    roundedOverallScore >= OVERALL_CLEAR_THRESHOLD ? "clear" : "needs_improvement";

  return {
    overallScore: roundedOverallScore,
    overallStatus,
  };
}
