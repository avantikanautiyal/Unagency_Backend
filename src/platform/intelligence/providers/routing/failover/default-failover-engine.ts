/**
 * Default failover engine.
 */

import { success, type Result } from "../../../shared/result";
import type { FailoverStep } from "../contracts/plan";
import type { RoutingRecommendation } from "../contracts/candidate";
import type { RoutingRequest } from "../contracts/request";
import type { IRoutingFailoverEngine } from "../interfaces/routing";

export class DefaultFailoverEngine implements IRoutingFailoverEngine {
  buildChain(
    ranked: readonly RoutingRecommendation[],
    _request: RoutingRequest
  ): Result<readonly FailoverStep[]> {
    const steps: FailoverStep[] = ranked.map((r, i) => ({
      kind: i === 0 ? "fallback_chain" : "multi_provider",
      providerId: r.providerId,
      modelId: r.modelId,
      order: i,
    }));
    if (ranked.length > 1) {
      steps.push({
        kind: "regional_fallback",
        providerId: ranked[1].providerId,
        modelId: ranked[1].modelId,
        order: ranked.length,
      });
    }
    return success(steps);
  }
}
