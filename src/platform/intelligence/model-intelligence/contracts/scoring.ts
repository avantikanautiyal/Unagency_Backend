/**
 * Scoring contracts.
 */

import type { ScoreDimension, ScoreSourceKind } from "./enums";
import type { CanonicalModelId } from "../../model-registry/contracts/identifiers";

export interface DimensionScore {
  readonly dimension: ScoreDimension;
  readonly score: number;
  readonly weight: number;
  readonly source: ScoreSourceKind;
  readonly rationale?: string;
}

export interface ModelScoreCard {
  readonly modelId: CanonicalModelId;
  readonly displayName: string;
  readonly providerId: string;
  readonly dimensions: readonly DimensionScore[];
  readonly overall: number;
  readonly weightedOverall: number;
  readonly computedAt: string;
}

export interface DynamicScoreInput {
  readonly staticBenchmarkWeight?: number;
  readonly telemetryWeight?: number;
  readonly evaluationWeight?: number;
  readonly learningWeight?: number;
  readonly optimizationWeight?: number;
  readonly historicalWeight?: number;
  readonly feedbackWeight?: number;
}
