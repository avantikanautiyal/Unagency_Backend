/**
 * Token intelligence aggregations.
 */

import type { TokenUsageRecord } from "../contracts/telemetry";
import type { TokenIntelligenceSnapshot } from "../interfaces/observability";

export function aggregateTokens(
  records: readonly TokenUsageRecord[],
  filter?: {
    organizationId?: string;
    providerId?: string;
    since?: string;
  }
): TokenIntelligenceSnapshot {
  let list = [...records];
  if (filter?.organizationId) {
    list = list.filter((r) => r.context.organizationId === filter.organizationId);
  }
  if (filter?.providerId) {
    list = list.filter((r) => r.context.providerId === filter.providerId);
  }
  if (filter?.since) {
    const since = Date.parse(filter.since);
    list = list.filter((r) => Date.parse(r.at) >= since);
  }

  return {
    promptTokens: sum(list, (r) => r.promptTokens),
    completionTokens: sum(list, (r) => r.completionTokens),
    cachedTokens: sum(list, (r) => r.cachedTokens),
    streamingTokens: sum(list, (r) => r.streamingTokens),
    toolTokens: sum(list, (r) => r.toolTokens),
    visionTokens: sum(list, (r) => r.visionTokens),
    audioTokens: sum(list, (r) => r.audioTokens),
    totalTokens: sum(list, (r) => r.totalTokens),
    records: list.length,
  };
}

function sum(
  list: readonly TokenUsageRecord[],
  pick: (r: TokenUsageRecord) => number
): number {
  return list.reduce((n, r) => n + pick(r), 0);
}
