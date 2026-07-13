/**
 * Strategy implementations.
 */

import { success, type Result } from "../../../shared/result";
import type { RoutingScore } from "../contracts/candidate";
import type { RoutingStrategyKind } from "../contracts/enums";
import type { RoutingRequest } from "../contracts/request";
import type { IRoutingStrategy } from "../interfaces/routing";

function sortBy(
  scores: readonly RoutingScore[],
  key: (s: RoutingScore) => number,
  desc = true
): RoutingScore[] {
  return [...scores].sort((a, b) => (desc ? key(b) - key(a) : key(a) - key(b)));
}

function withRanks(scores: readonly RoutingScore[]): RoutingScore[] {
  return scores.map((s, i) => ({ ...s, rank: i + 1 }));
}

abstract class BaseStrategy implements IRoutingStrategy {
  abstract readonly kind: RoutingStrategyKind;
  abstract rank(
    scores: readonly RoutingScore[],
    request: RoutingRequest
  ): Result<readonly RoutingScore[]>;
}

export class LowestCostStrategy extends BaseStrategy {
  readonly kind = "lowest_cost" as const;
  rank(scores: readonly RoutingScore[]) {
    return success(withRanks(sortBy(scores, (s) => s.dimensions.cost)));
  }
}

export class LowestLatencyStrategy extends BaseStrategy {
  readonly kind = "lowest_latency" as const;
  rank(scores: readonly RoutingScore[]) {
    return success(withRanks(sortBy(scores, (s) => s.dimensions.latency)));
  }
}

export class HighestQualityStrategy extends BaseStrategy {
  readonly kind = "highest_quality" as const;
  rank(scores: readonly RoutingScore[]) {
    return success(withRanks(sortBy(scores, (s) => s.dimensions.quality)));
  }
}

export class ProviderPreferenceStrategy extends BaseStrategy {
  readonly kind = "provider_preference" as const;
  rank(scores: readonly RoutingScore[]) {
    return success(withRanks(sortBy(scores, (s) => s.dimensions.preference)));
  }
}

export class ComplianceStrategy extends BaseStrategy {
  readonly kind = "compliance" as const;
  rank(scores: readonly RoutingScore[]) {
    return success(withRanks(sortBy(scores, (s) => s.dimensions.compliance)));
  }
}

export class HealthFirstStrategy extends BaseStrategy {
  readonly kind = "health_first" as const;
  rank(scores: readonly RoutingScore[]) {
    return success(withRanks(sortBy(scores, (s) => s.dimensions.health)));
  }
}

export class BalancedStrategy extends BaseStrategy {
  readonly kind = "balanced" as const;
  rank(scores: readonly RoutingScore[], _request?: RoutingRequest) {
    return success(withRanks(sortBy(scores, (s) => s.total)));
  }
}

export class WeightedStrategy extends BaseStrategy {
  readonly kind = "weighted" as const;
  rank(scores: readonly RoutingScore[], request: RoutingRequest) {
    const weights = request.policy?.strategy.weights ?? {};
    const weighted = scores.map((s) => {
      let total = 0;
      let wsum = 0;
      for (const [dim, w] of Object.entries(weights)) {
        const val = (s.dimensions as unknown as Record<string, number>)[dim] ?? 0;
        total += val * w;
        wsum += w;
      }
      return { ...s, total: wsum > 0 ? total / wsum : s.total };
    });
    return success(withRanks(sortBy(weighted, (s) => s.total)));
  }
}

export class RandomStrategy extends BaseStrategy {
  readonly kind = "random" as const;
  rank(scores: readonly RoutingScore[], request: RoutingRequest) {
    const seed = request.policy?.strategy.seed ?? 1;
    const shuffled = [...scores].sort(
      (a, b) =>
        (hash(String(a.providerId), seed) % 1000) -
        (hash(String(b.providerId), seed) % 1000)
    );
    return success(withRanks(shuffled));
  }
}

export class StickyStrategy extends BaseStrategy {
  readonly kind = "sticky" as const;
  rank(scores: readonly RoutingScore[], request: RoutingRequest) {
    const key =
      request.preferences?.stickyKey ?? request.policy?.strategy.stickyKey;
    if (!key) return new BalancedStrategy().rank(scores, request);
    const idx = hash(key, 0) % scores.length;
    const sticky = scores[idx];
    const rest = scores.filter((s) => s.providerId !== sticky.providerId);
    return success(withRanks([sticky, ...rest]));
  }
}

export class CanaryStrategy extends BaseStrategy {
  readonly kind = "canary" as const;
  rank(scores: readonly RoutingScore[]) {
    return success(withRanks(sortBy(scores, (s) => s.total)));
  }
}

export class ShadowStrategy extends BaseStrategy {
  readonly kind = "shadow" as const;
  rank(scores: readonly RoutingScore[]) {
    return success(withRanks(sortBy(scores, (s) => s.total)));
  }
}

export class MultiProviderStrategy extends BaseStrategy {
  readonly kind = "multi_provider" as const;
  rank(scores: readonly RoutingScore[]) {
    return success(withRanks(sortBy(scores, (s) => s.total)));
  }
}

function hash(value: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < value.length; i += 1) {
    h = (h * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export const ALL_STRATEGIES: readonly IRoutingStrategy[] = [
  new LowestCostStrategy(),
  new LowestLatencyStrategy(),
  new HighestQualityStrategy(),
  new ProviderPreferenceStrategy(),
  new ComplianceStrategy(),
  new HealthFirstStrategy(),
  new BalancedStrategy(),
  new WeightedStrategy(),
  new RandomStrategy(),
  new StickyStrategy(),
  new CanaryStrategy(),
  new ShadowStrategy(),
  new MultiProviderStrategy(),
];

export function strategyFor(kind: RoutingStrategyKind): IRoutingStrategy {
  const found = ALL_STRATEGIES.find((s) => s.kind === kind);
  return found ?? new BalancedStrategy();
}
