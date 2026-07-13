/**
 * Statistics and snapshot contracts.
 */

import type { OptimizationSnapshotId } from "./identifiers";
import type { OptimizationConfidence } from "./scoring";
import type { OptimizationRecommendation } from "./recommendation";
import type { ExecutionPattern } from "./patterns";

export interface OptimizationStatistics {
  readonly artifactsAnalyzed: number;
  readonly evaluationsAnalyzed: number;
  readonly learningSignalsAnalyzed: number;
  readonly observabilityReportsAnalyzed: number;
  readonly intelligenceResultsAnalyzed: number;
  readonly patternsDetected: number;
  readonly recommendationsGenerated: number;
  readonly simulationsRun: number;
  readonly durationMs: number;
}

export interface OptimizationSnapshot {
  readonly snapshotId: OptimizationSnapshotId;
  readonly requestId: string;
  readonly capturedAt: string;
  readonly topRecommendations: readonly OptimizationRecommendation[];
  readonly patterns: readonly ExecutionPattern[];
  readonly confidence: OptimizationConfidence;
}
