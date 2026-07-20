/**
 * Certification scorecard — dimensional scores 0–100.
 */

import type { ScoreDimension } from "./enums";

export interface DimensionScore {
  readonly dimension: ScoreDimension;
  readonly score: number;
  readonly maxScore: number;
  readonly weight: number;
  readonly rationale: string;
}

export interface CertificationScorecard {
  readonly scorecardId: string;
  readonly dimensions: readonly DimensionScore[];
  readonly overallScore: number;
  readonly passingThreshold: number;
  readonly passed: boolean;
}

export function buildScorecard(
  dimensions: readonly DimensionScore[],
  passingThreshold = 70
): CertificationScorecard {
  const totalWeight = dimensions.reduce((s, d) => s + d.weight, 0) || 1;
  const overallScore = Math.round(
    dimensions.reduce((s, d) => s + (d.score / d.maxScore) * d.weight, 0) / totalWeight * 100
  );
  return Object.freeze({
    scorecardId: `scorecard_${Date.now()}`,
    dimensions,
    overallScore,
    passingThreshold,
    passed: overallScore >= passingThreshold,
  });
}
