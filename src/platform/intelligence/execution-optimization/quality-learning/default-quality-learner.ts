/**
 * Quality learner — advisory hints only.
 */

import { success, type Result } from "../../shared/result";
import type { OptimizationRecommendation } from "../contracts/recommendation";
import type { ExecutionPattern } from "../contracts/patterns";
import type { ExecutionOptimizationRequest } from "../contracts/request";
import type { IQualityLearner } from "../interfaces/execution-optimization";
import { avgMetric, makeRecommendation } from "../heuristics/learner-helpers";

export class DefaultQualityLearner implements IQualityLearner {
  learn(
    request: ExecutionOptimizationRequest,
    patterns: readonly ExecutionPattern[]
  ): Result<readonly OptimizationRecommendation[]> {
    const now = new Date().toISOString();
    const recs: OptimizationRecommendation[] = [];
    const evals = request.inputs.evaluationReports ?? [];
    const qualityPattern = patterns.find((p) => p.id === "pat_quality_low");

    if (qualityPattern && evals.length > 0) {
      const failedCriteria = evals.flatMap((e) => e.summary.failedCriteria);
      const brandFailures = failedCriteria.filter((c) =>
        c.toLowerCase().includes("brand")
      ).length;
      if (brandFailures > 0) {
        recs.push(
          makeRecommendation(
            "rec_quality_brand",
            "verification_strategy",
            "Enable brand verification pass",
            `${brandFailures} brand-related evaluation failures detected`,
            "Add self-review focused on brand alignment",
            0.14,
            0.75,
            now,
            "high"
          )
        );
      }

      const avgScore = avgMetric(evals.map((e) => e.summary.overallScore));
      recs.push(
        makeRecommendation(
          "rec_quality_verification",
          "verification_strategy",
          "Increase verification depth",
          `Average evaluation score ${avgScore.toFixed(2)} below optimal`,
          "Enable generate_review_improve or self_verification strategies",
          0.12,
          0.7,
          now
        )
      );
    }

    return success(recs);
  }
}
