/**
 * Comparison and ranking contracts.
 */

import type { ComparisonDimension } from "./enums";

export interface DimensionScore {
  readonly dimension: ComparisonDimension;
  readonly score: number;
  readonly rationale: string;
}

export interface CandidateComparison {
  readonly candidateId: string;
  readonly providerId: string;
  readonly dimensions: readonly DimensionScore[];
  readonly overallScore: number;
  readonly rank: number;
}

export interface ComparisonReport {
  readonly comparisons: readonly CandidateComparison[];
  readonly winnerCandidateId: string;
  readonly rationale: string;
}
