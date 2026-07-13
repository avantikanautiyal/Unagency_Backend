/**
 * Comparison builder from trends and benchmarks.
 */

import type { ExecutionComparison } from "../contracts/patterns";
import type { OptimizationBenchmark } from "../contracts/benchmark";

export function buildComparisons(
  benchmarks: readonly OptimizationBenchmark[]
): ExecutionComparison[] {
  return benchmarks.map((b) => ({
    metric: b.metric,
    before: b.baseline,
    after: b.projected,
    delta: b.projected - b.baseline,
    deltaPercent: b.baseline > 0 ? ((b.projected - b.baseline) / b.baseline) * 100 : 0,
  }));
}
