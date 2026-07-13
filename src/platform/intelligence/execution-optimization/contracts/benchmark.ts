/**
 * Benchmark and experiment contracts.
 */

import type { ExperimentStatus, OptimizationDomain } from "./enums";

export interface OptimizationBenchmark {
  readonly benchmarkId: string;
  readonly domain: OptimizationDomain;
  readonly metric: string;
  readonly baseline: number;
  readonly projected: number;
  readonly improvement: number;
  readonly sampleCount: number;
  readonly computedAt: string;
}

export interface OptimizationExperiment {
  readonly experimentId: string;
  readonly domain: OptimizationDomain;
  readonly hypothesis: string;
  readonly status: ExperimentStatus;
  readonly recommendationId: string;
  readonly proposedAt: string;
}
