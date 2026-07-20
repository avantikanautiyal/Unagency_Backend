/**
 * Prediction engine — placeholder.
 */

import { success, type Result } from "../../shared/result";
import type { PredictionReport } from "../contracts/result";
import type { IPredictionEngine } from "../interfaces/model-intelligence";
import type { InMemoryBenchmarkRepository } from "../repositories/in-memory-benchmark-repository";
import type { InMemoryPerformanceRepository } from "../repositories/in-memory-performance-repository";

export class DefaultPredictionEngine implements IPredictionEngine {
  constructor(
    private readonly benchmarks: InMemoryBenchmarkRepository,
    private readonly performance: InMemoryPerformanceRepository,
    private readonly nowIso: () => string = () => new Date().toISOString(),
    private readonly createId: (prefix: string) => string = (p) => `${p}_1`
  ) {}

  predict(modelId: string, capabilityId: string): Result<PredictionReport> {
    const bench = this.benchmarks.get(modelId);
    const latency = this.performance.getLatencyMs(modelId);
    const quality = bench.ok ? bench.value.aggregateScore : 0.7;
    return success({
      reportId: this.createId("pred"),
      modelId,
      predictedQuality: quality,
      predictedLatencyMs: latency.ok ? latency.value : 1000,
      predictedCost: 0.002,
      confidence: 0.75,
      rationale: `Heuristic prediction for capability ${capabilityId}`,
      generatedAt: this.nowIso(),
    });
  }
}
