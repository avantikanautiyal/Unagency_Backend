/**
 * Strategy learner — advisory recommendations only.
 */

import { success, type Result } from "../../shared/result";
import type { OptimizationRecommendation } from "../contracts/recommendation";
import type { ExecutionPattern } from "../contracts/patterns";
import type { ExecutionOptimizationRequest } from "../contracts/request";
import type { IStrategyLearner } from "../interfaces/execution-optimization";
import { makeRecommendation } from "../heuristics/learner-helpers";

export class DefaultStrategyLearner implements IStrategyLearner {
  learn(
    request: ExecutionOptimizationRequest,
    patterns: readonly ExecutionPattern[]
  ): Result<readonly OptimizationRecommendation[]> {
    const now = new Date().toISOString();
    const recs: OptimizationRecommendation[] = [];
    const qualityPattern = patterns.find((p) => p.id === "pat_quality_low");
    const intelResults = request.inputs.intelligenceResults ?? [];

    if (qualityPattern) {
      const usedSinglePass = intelResults.some(
        (r) => r.strategy.kind === "single_pass"
      );
      if (usedSinglePass) {
        recs.push(
          makeRecommendation(
            "rec_strategy_multi_pass",
            "execution_strategy",
            "Consider multi-pass strategy",
            "Historical quality scores are low when single-pass was used",
            "Switch from single_pass to generate_review_improve for quality gains",
            0.15,
            0.72,
            now,
            "high"
          )
        );
      }
    }

    const reasoningCandidates = intelResults.filter((r) => r.reasoningPlan.enabled);
    if (reasoningCandidates.length > 0) {
      const avgQuality = reasoningCandidates.reduce(
        (s, r) => s + r.prediction.quality.expectedQuality,
        0
      ) / reasoningCandidates.length;
      if (avgQuality > 0.75) {
        recs.push(
          makeRecommendation(
            "rec_strategy_reasoning",
            "reasoning_mode",
            "Reasoning-first strategy shows promise",
            "Reasoning-enabled executions had higher predicted quality",
            "Prefer reasoning_first for complex capabilities",
            0.1,
            0.68,
            now
          )
        );
      }
    }

    return success(recs);
  }
}
