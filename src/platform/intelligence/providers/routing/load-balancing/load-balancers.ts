/**
 * Load balancers.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ValidationError } from "../../../shared/errors";
import type { RoutingRecommendation } from "../contracts/candidate";
import type { LoadBalancingKind } from "../contracts/enums";
import type { RoutingRequest } from "../contracts/request";
import type { IRoutingLoadBalancer } from "../interfaces/routing";

let roundRobinCounter = 0;

abstract class BaseLoadBalancer implements IRoutingLoadBalancer {
  abstract readonly kind: LoadBalancingKind;
  abstract select(
    recommendations: readonly RoutingRecommendation[],
    request: RoutingRequest
  ): Result<RoutingRecommendation>;
}

export class RoundRobinLoadBalancer extends BaseLoadBalancer {
  readonly kind = "round_robin" as const;
  select(recommendations: readonly RoutingRecommendation[]) {
    if (recommendations.length === 0) {
      return failure(new ValidationError("no recommendations to balance"));
    }
    const idx = roundRobinCounter++ % recommendations.length;
    return success(recommendations[idx]);
  }
}

export class WeightedLoadBalancer extends BaseLoadBalancer {
  readonly kind = "weighted" as const;
  select(recommendations: readonly RoutingRecommendation[]) {
    if (recommendations.length === 0) {
      return failure(new ValidationError("no recommendations to balance"));
    }
    const best = [...recommendations].sort(
      (a, b) => b.score.total - a.score.total
    )[0];
    return success(best);
  }
}

export class LeastLoadedLoadBalancer extends BaseLoadBalancer {
  readonly kind = "least_loaded" as const;
  select(recommendations: readonly RoutingRecommendation[]) {
    if (recommendations.length === 0) {
      return failure(new ValidationError("no recommendations to balance"));
    }
    const best = [...recommendations].sort(
      (a, b) =>
        (a.score.dimensions.availability ?? 0) -
        (b.score.dimensions.availability ?? 0)
    )[0];
    return success(best);
  }
}

export class PriorityLoadBalancer extends BaseLoadBalancer {
  readonly kind = "priority" as const;
  select(recommendations: readonly RoutingRecommendation[]) {
    if (recommendations.length === 0) {
      return failure(new ValidationError("no recommendations to balance"));
    }
    const best = [...recommendations].sort(
      (a, b) =>
        (b.score.dimensions.priority ?? 0) - (a.score.dimensions.priority ?? 0)
    )[0];
    return success(best);
  }
}

export class RandomLoadBalancer extends BaseLoadBalancer {
  readonly kind = "random" as const;
  select(recommendations: readonly RoutingRecommendation[], request: RoutingRequest) {
    if (recommendations.length === 0) {
      return failure(new ValidationError("no recommendations to balance"));
    }
    const seed = request.policy?.strategy.seed ?? 7;
    const idx = seed % recommendations.length;
    return success(recommendations[idx]);
  }
}

export function loadBalancerFor(kind: LoadBalancingKind): IRoutingLoadBalancer {
  switch (kind) {
    case "round_robin":
      return new RoundRobinLoadBalancer();
    case "weighted":
      return new WeightedLoadBalancer();
    case "least_loaded":
      return new LeastLoadedLoadBalancer();
    case "priority":
      return new PriorityLoadBalancer();
    case "random":
    default:
      return new RandomLoadBalancer();
  }
}
