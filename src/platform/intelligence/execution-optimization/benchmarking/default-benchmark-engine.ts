/**
 * Benchmark engine — heuristic placeholder.
 */

import { success, type Result } from "../../shared/result";
import type { OptimizationBenchmark } from "../contracts/benchmark";
import type { OptimizationRecommendation } from "../contracts/recommendation";
import type { ExecutionOptimizationRequest } from "../contracts/request";
import type { IBenchmarkEngine } from "../interfaces/execution-optimization";
import { avgMetric } from "../heuristics/learner-helpers";

export class DefaultBenchmarkEngine implements IBenchmarkEngine {
  benchmark(
    request: ExecutionOptimizationRequest,
    recommendations: readonly OptimizationRecommendation[]
  ): Result<readonly OptimizationBenchmark[]> {
    const now = new Date().toISOString();
    const sampleCount =
      (request.inputs.evaluationReports?.length ?? 0) +
      (request.inputs.observabilityReports?.length ?? 0);

    const evalBaseline = avgMetric(
      request.inputs.evaluationReports?.map((e) => e.summary.overallScore) ?? [],
      0.65
    );

    const benchmarks: OptimizationBenchmark[] = recommendations.map((rec) => ({
      benchmarkId: `bench_${rec.id}`,
      domain: rec.domain,
      metric: "projected_quality",
      baseline: evalBaseline,
      projected: Math.min(1, evalBaseline + rec.expectedImpact),
      improvement: rec.expectedImpact,
      sampleCount,
      computedAt: now,
    }));

    return success(benchmarks);
  }
}
