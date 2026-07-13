/**
 * Context learner — advisory hints only.
 */

import { success, type Result } from "../../shared/result";
import type { OptimizationRecommendation } from "../contracts/recommendation";
import type { ExecutionPattern } from "../contracts/patterns";
import type { ExecutionOptimizationRequest } from "../contracts/request";
import type { IContextLearner } from "../interfaces/execution-optimization";
import { makeRecommendation } from "../heuristics/learner-helpers";

export class DefaultContextLearner implements IContextLearner {
  learn(
    request: ExecutionOptimizationRequest,
    _patterns: readonly ExecutionPattern[]
  ): Result<readonly OptimizationRecommendation[]> {
    const now = new Date().toISOString();
    const intel = request.inputs.intelligenceResults ?? [];
    const recs: OptimizationRecommendation[] = [];

    for (const result of intel) {
      const reduction =
        result.contextPlan.originalSize > 0
          ? (result.contextPlan.originalSize - result.contextPlan.optimizedSize) /
            result.contextPlan.originalSize
          : 0;
      if (reduction < 0.05 && result.contextPlan.originalSize > 400) {
        recs.push(
          makeRecommendation(
            `rec_context_size_${result.requestId}`,
            "context_size",
            "Reduce context size",
            "Context optimization achieved minimal reduction",
            "Apply stronger deduplication and relevance filtering",
            0.07,
            0.62,
            now
          )
        );
      }
    }

    return success(recs);
  }
}
