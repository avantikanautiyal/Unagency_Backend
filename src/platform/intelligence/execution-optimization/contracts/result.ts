/**
 * Execution Optimization result contract.
 */

import type { ExecutionOptimizationResultId } from "./identifiers";
import type { OptimizationBenchmark } from "./benchmark";
import type { OptimizationExperiment } from "./benchmark";
import type { OptimizationHeuristic, OptimizationRecommendation } from "./recommendation";
import type { ExecutionComparison, ExecutionPattern, ExecutionTrend } from "./patterns";
import type { OptimizationConfidence, OptimizationScore } from "./scoring";
import type { OptimizationSimulation } from "./simulation";
import type { OptimizationSnapshot, OptimizationStatistics } from "./statistics";

export interface ExecutionOptimizationResult {
  readonly resultId: ExecutionOptimizationResultId;
  readonly requestId: string;
  readonly recommendations: readonly OptimizationRecommendation[];
  readonly heuristicProposals: readonly OptimizationHeuristic[];
  readonly scores: readonly OptimizationScore[];
  readonly confidence: OptimizationConfidence;
  readonly benchmarks: readonly OptimizationBenchmark[];
  readonly experiments: readonly OptimizationExperiment[];
  readonly simulations: readonly OptimizationSimulation[];
  readonly patterns: readonly ExecutionPattern[];
  readonly comparisons: readonly ExecutionComparison[];
  readonly trends: readonly ExecutionTrend[];
  readonly statistics: OptimizationStatistics;
  readonly snapshot: OptimizationSnapshot;
  readonly advisoryOnly: true;
  readonly createdAt: string;
  readonly durationMs: number;
}
