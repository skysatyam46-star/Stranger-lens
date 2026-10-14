export const SCORING_VERSION = "1.0";

export const SIGNAL_WEIGHTS = {
  first_impression: 0.25,
  audience: 0.20,
  value: 0.25,
  trust: 0.15,
  action: 0.15,
} as const;

export const OVERALL_CLEAR_THRESHOLD = 80;

export interface StatusScoreRange {
  min: number;
  max: number;
  defaultScore: number;
}

export const STATUS_SCORE_RANGES: Record<string, StatusScoreRange> = {
  clear: { min: 80, max: 100, defaultScore: 85 },
  understandable: { min: 65, max: 79, defaultScore: 72 },
  could_be_stronger: { min: 45, max: 64, defaultScore: 55 },
  partly_clear: { min: 45, max: 64, defaultScore: 55 },
  unclear: { min: 0, max: 44, defaultScore: 30 },
  needs_work: { min: 0, max: 44, defaultScore: 30 },
};

/**
 * Maps a numeric score (0..100) deterministically to canonical status.
 * 80–100 → clear
 * 65–79  → understandable / could_be_stronger
 * 45–64  → partly_clear / needs_work
 * 0–44   → unclear / needs_work
 */
export function scoreToDeterministicStatus(
  score: number,
  preferredStatus?: string
): "clear" | "understandable" | "could_be_stronger" | "partly_clear" | "unclear" | "needs_work" {
  const pref = (preferredStatus || "").toLowerCase().trim();

  if (score >= 80) {
    return "clear";
  }
  if (score >= 65) {
    return pref === "could_be_stronger" ? "could_be_stronger" : "understandable";
  }
  if (score >= 45) {
    return pref === "needs_work" ? "needs_work" : "partly_clear";
  }
  return pref === "needs_work" ? "needs_work" : "unclear";
}
