/**
 * Failover planner — ordered chains, no execution.
 */

import { success, type Result } from "../../shared/result";
import type { ProviderOperationalRecord } from "../contracts/state";
import type { FailoverChain } from "../contracts/recommendations";
import type { IFailoverPlanner } from "../interfaces/mesh";

const ELIGIBLE = new Set([
  "healthy",
  "busy",
  "experimental",
  "degraded",
  "rate_limited",
]);

export class DefaultFailoverPlanner implements IFailoverPlanner {
  plan(records: readonly ProviderOperationalRecord[]): Result<readonly FailoverChain[]> {
    const ranked = [...records]
      .filter((r) => ELIGIBLE.has(r.state))
      .sort((a, b) => b.compositeScore.overall - a.compositeScore.overall);

    if (ranked.length === 0) return success([]);

    const chains: FailoverChain[] = [];
    for (const primary of ranked) {
      const fallbacks = ranked
        .filter((r) => r.providerId !== primary.providerId)
        .map((r) => r.providerId);

      chains.push({
        chainId: `failover_${primary.providerId}`,
        primaryProviderId: primary.providerId,
        orderedFallbacks: fallbacks,
        rationale: {
          why: `Failover chain for ${primary.providerId} ordered by composite score without executing providers.`,
          metrics: [
            `primaryOverall=${primary.compositeScore.overall.toFixed(3)}`,
            `fallbackCount=${fallbacks.length}`,
          ],
          evidence: [
            `primaryState=${primary.state}`,
            ...fallbacks.slice(0, 3).map((id) => {
              const rec = ranked.find((r) => r.providerId === id);
              return `${id}: score=${rec?.compositeScore.overall.toFixed(3) ?? "?"}`;
            }),
          ],
          confidence: clamp01(0.5 + primary.compositeScore.overall * 0.4),
        },
      });
    }

    return success(chains);
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
