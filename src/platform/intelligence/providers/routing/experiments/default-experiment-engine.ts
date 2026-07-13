/**
 * Experiment and shadow engines.
 */

import { success, type Result } from "../../../shared/result";
import type { RoutingCandidate, RoutingRecommendation } from "../contracts/candidate";
import type { RoutingExperiment } from "../contracts/plan";
import type { RoutingRequest } from "../contracts/request";
import type {
  ExperimentAssignment,
  IRoutingExperimentEngine,
  IRoutingShadowEngine,
} from "../interfaces/routing";

export class DefaultExperimentEngine implements IRoutingExperimentEngine {
  assign(
    primary: RoutingRecommendation,
    fallbacks: readonly RoutingRecommendation[],
    request: RoutingRequest
  ): Result<ExperimentAssignment> {
    const experiments: RoutingExperiment[] = [];
    const warnings: string[] = [];

    if (request.strategy === "canary" && fallbacks.length > 0) {
      experiments.push({
        experimentId: `canary_${request.requestId}`,
        kind: "canary",
        primaryProviderId: primary.providerId,
        experimentProviderId: fallbacks[0].providerId,
        trafficPercent: 10,
      });
    }
    if (request.policy?.allowExperimental && fallbacks.length > 1) {
      experiments.push({
        experimentId: `rollout_${request.requestId}`,
        kind: "weighted_rollout",
        primaryProviderId: primary.providerId,
        experimentProviderId: fallbacks[1].providerId,
        trafficPercent: 25,
      });
    }
    return success({ experiments, warnings });
  }
}

export class DefaultShadowEngine implements IRoutingShadowEngine {
  assignShadow(
    primary: RoutingRecommendation,
    candidates: readonly RoutingCandidate[]
  ): Result<RoutingExperiment | undefined> {
    const shadow = candidates.find((c) => c.providerId !== primary.providerId);
    if (!shadow) return success(undefined);
    return success({
      experimentId: `shadow_${String(primary.providerId)}`,
      kind: "shadow",
      primaryProviderId: primary.providerId,
      experimentProviderId: shadow.providerId,
      shadowOnly: true,
    });
  }
}
