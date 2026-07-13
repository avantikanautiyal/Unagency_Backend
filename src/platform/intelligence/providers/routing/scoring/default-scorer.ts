/**
 * Default routing scorer.
 */

import { success, type Result } from "../../../shared/result";
import type { RoutingCandidate, RoutingScore } from "../contracts/candidate";
import type { RoutingRequest } from "../contracts/request";
import type { IRoutingHistory, IRoutingScorer } from "../interfaces/routing";

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export class DefaultRoutingScorer implements IRoutingScorer {
  constructor(private readonly history?: IRoutingHistory) {}

  score(candidate: RoutingCandidate, request: RoutingRequest): Result<RoutingScore> {
    const capability =
      candidate.capabilities.includes(String(request.capabilityId)) ? 1 : 0.5;
    const health = candidate.healthy ? 1 : 0;
    const latency = candidate.estimatedLatencyMs
      ? clamp01(1 - candidate.estimatedLatencyMs / 10_000)
      : 0.5;
    const quality =
      candidate.qualityScore ??
      (this.history
        ? this.history.qualityScore(candidate.providerId, request.capabilityId)
        : 0.5);
    const cost = candidate.estimatedCost
      ? clamp01(1 - candidate.estimatedCost / 100)
      : 0.5;
    const availability = candidate.availability ?? (candidate.healthy ? 1 : 0);
    const preference = request.preferences?.preferredProviders?.includes(
      candidate.providerId
    )
      ? 1
      : request.preferences?.excludedProviders?.includes(candidate.providerId)
        ? 0
        : 0.5;
    const region =
      request.preferences?.region && candidate.region
        ? candidate.region === request.preferences.region
          ? 1
          : 0.2
        : 0.5;
    const compliance = 1;
    const priority = candidate.priority ? clamp01(candidate.priority / 10) : 0.5;

    const dimensions = {
      capability,
      health,
      latency,
      quality,
      cost,
      availability,
      preference,
      region,
      compliance,
      priority,
    };
    const total =
      (capability +
        health +
        latency +
        quality +
        cost +
        availability +
        preference +
        region +
        compliance +
        priority) /
      10;

    return success({
      providerId: candidate.providerId,
      modelId: candidate.modelId,
      total,
      dimensions,
    });
  }

  scoreAll(
    candidates: readonly RoutingCandidate[],
    request: RoutingRequest
  ): Result<readonly RoutingScore[]> {
    return success(
      candidates.map((c) => {
        const scored = this.score(c, request);
        if (!scored.ok) throw scored.error;
        return scored.value;
      })
    );
  }
}
