/**
 * Benchmark engine — heuristic placeholder.
 */

import { success, type Result } from "../../shared/result";
import type { ExecutionIntelligenceResult } from "../contracts/result";
import type { ExecutionIntelligenceRequest } from "../contracts/request";
import type { IBenchmarkEngine } from "../interfaces/execution-intelligence";

export class DefaultBenchmarkEngine implements IBenchmarkEngine {
  benchmark(
    _request: ExecutionIntelligenceRequest,
    result: ExecutionIntelligenceResult
  ): Result<Readonly<Record<string, number>>> {
    return success({
      optimizationScore: result.optimizationReport.overallImprovement,
      expectedQuality: result.prediction.quality.expectedQuality,
      tokenEfficiency:
        result.budget.maximumContext > 0
          ? result.budget.totalEstimated / result.budget.maximumContext
          : 0,
      riskCount: result.risks.filter((r) => r.detected).length,
      verificationSteps: result.verificationPlan.steps.length,
      durationMs: result.durationMs,
    });
  }
}
