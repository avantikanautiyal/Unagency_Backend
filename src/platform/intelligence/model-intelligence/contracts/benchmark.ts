/**
 * Benchmark contracts.
 */

import type { BenchmarkCategory } from "./enums";
import type { CanonicalModelId } from "../../model-registry/contracts/identifiers";

export interface BenchmarkScore {
  readonly category: BenchmarkCategory;
  readonly score: number;
  readonly maxScore: number;
  readonly percentile?: number;
  readonly sampleSize?: number;
  readonly measuredAt: string;
}

export interface ModelBenchmarkRecord {
  readonly modelId: CanonicalModelId;
  readonly benchmarks: readonly BenchmarkScore[];
  readonly aggregateScore: number;
  readonly computedAt: string;
}

export interface BenchmarkReport {
  readonly reportId: string;
  readonly modelId: CanonicalModelId;
  readonly categories: readonly BenchmarkCategory[];
  readonly scores: readonly BenchmarkScore[];
  readonly summary: string;
  readonly generatedAt: string;
}
