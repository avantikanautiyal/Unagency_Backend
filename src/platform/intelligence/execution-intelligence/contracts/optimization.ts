/**
 * Execution optimization contracts.
 */

import type { OptimizationDimension } from "./enums";

export interface ExecutionOptimization {
  readonly dimension: OptimizationDimension;
  readonly beforeScore: number;
  readonly afterScore: number;
  readonly actions: readonly string[];
}

export interface ExecutionRecommendation {
  readonly id: string;
  readonly priority: number;
  readonly title: string;
  readonly description: string;
  readonly dimension: OptimizationDimension;
  readonly impact: number;
  readonly selected: boolean;
}

export interface ExecutionOptimizationReport {
  readonly optimizations: readonly ExecutionOptimization[];
  readonly recommendations: readonly ExecutionRecommendation[];
  readonly overallImprovement: number;
  readonly summary: string;
}
