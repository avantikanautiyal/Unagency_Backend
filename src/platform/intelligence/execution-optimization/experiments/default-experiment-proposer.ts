/**
 * Experiment proposer — advisory experiments only.
 */

import { success, type Result } from "../../shared/result";
import type { OptimizationExperiment } from "../contracts/benchmark";
import type { OptimizationRecommendation } from "../contracts/recommendation";
import type { IExperimentProposer } from "../interfaces/execution-optimization";

export class DefaultExperimentProposer implements IExperimentProposer {
  propose(
    recommendations: readonly OptimizationRecommendation[]
  ): Result<readonly OptimizationExperiment[]> {
    const now = new Date().toISOString();
    const highImpact = recommendations.filter(
      (r) => r.priority === "high" || r.priority === "critical"
    );

    return success(
      highImpact.slice(0, 5).map((rec) => ({
        experimentId: `exp_${rec.id}`,
        domain: rec.domain,
        hypothesis: `Applying "${rec.title}" improves ${rec.domain}`,
        status: "proposed" as const,
        recommendationId: rec.id,
        proposedAt: now,
      }))
    );
  }
}
