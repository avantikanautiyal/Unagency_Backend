/**
 * Token learner — advisory hints only.
 */

import { success, type Result } from "../../shared/result";
import type { OptimizationRecommendation } from "../contracts/recommendation";
import type { ExecutionPattern } from "../contracts/patterns";
import type { ExecutionOptimizationRequest } from "../contracts/request";
import type { ITokenLearner } from "../interfaces/execution-optimization";
import { makeRecommendation } from "../heuristics/learner-helpers";

export class DefaultTokenLearner implements ITokenLearner {
  learn(
    request: ExecutionOptimizationRequest,
    patterns: readonly ExecutionPattern[]
  ): Result<readonly OptimizationRecommendation[]> {
    const now = new Date().toISOString();
    const recs: OptimizationRecommendation[] = [];
    const intel = request.inputs.intelligenceResults ?? [];

    for (const result of intel) {
      if (result.budget.compressionRatio < 1) {
        recs.push(
          makeRecommendation(
            `rec_token_budget_${result.requestId}`,
            "token_budget",
            "Apply token compression",
            `Compression ratio ${result.budget.compressionRatio.toFixed(2)} indicates overflow risk`,
            "Reduce knowledge and context tokens before execution",
            0.11,
            0.7,
            now,
            "high"
          )
        );
      }
    }

    const costPattern = patterns.find((p) => p.id === "pat_cost_trend");
    if (costPattern) {
      recs.push(
        makeRecommendation(
          "rec_token_cost_balance",
          "cost_vs_quality",
          "Balance token budget vs cost",
          "Historical cost trend suggests overspending on context",
          "Lower reasoning budget when quality targets are met",
          0.06,
          0.58,
          now
        )
      );
    }

    return success(recs);
  }
}
