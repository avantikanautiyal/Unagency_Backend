/**
 * Benchmark profile resolver using historical evaluation reports.
 */

import { success, type Result } from "../../shared/result";
import type {
  BenchmarkProfile,
  DynamicEvaluationRequest,
  DynamicEvaluationStrategy,
} from "../contracts/dynamic-evaluation";
import type { IBenchmarkResolver } from "../interfaces/dynamic-evaluation-ports";

export class DefaultBenchmarkResolver implements IBenchmarkResolver {
  resolve(
    strategy: DynamicEvaluationStrategy,
    request: DynamicEvaluationRequest
  ): Result<BenchmarkProfile> {
    const historical = request.inputs.historicalReports ?? [];
    const mean =
      historical.length > 0
        ? historical.reduce((s, r) => s + r.summary.overallScore, 0) / historical.length
        : undefined;

    const baseTarget =
      strategy.riskLevel === "critical"
        ? 0.9
        : strategy.riskLevel === "high"
          ? 0.85
          : strategy.pipelineFamily === "marketing"
            ? 0.75
            : 0.8;

    const targetScore = mean !== undefined ? Math.max(baseTarget, mean) : baseTarget;

    return success({
      profileId: strategy.benchmarkProfileId,
      capability: strategy.capability,
      industry: strategy.industry,
      department: request.inputs.context?.departmentHint,
      complexity: request.inputs.context?.complexityHint,
      risk: strategy.riskLevel,
      provider: request.inputs.context?.providerHint ?? request.inputs.modelDecision?.winningModel.providerId
        ? String(request.inputs.modelDecision?.winningModel.providerId)
        : undefined,
      model: request.inputs.context?.modelHint ?? request.inputs.modelDecision?.winningModel.modelId,
      version: "1.0.0",
      targetScore,
      historicalSampleSize: historical.length,
      historicalMeanScore: mean,
    });
  }
}
