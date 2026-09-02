/**
 * Model/Provider Performance Intelligence port (M9.5H).
 */

import type { AdaptiveRoutingExplain } from "../contracts/performance-evidence";
import type { ModelPerformanceMetrics, PerformanceScope } from "../contracts/performance-metrics";
import type { RoutingStrategyKind } from "../../contracts/enums";

export interface PerformanceLookupKey {
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityId: string;
  readonly organizationId?: string;
}

export interface IModelPerformanceIntelligence {
  metricsFor(
    key: PerformanceLookupKey,
    scope?: PerformanceScope
  ): Promise<ModelPerformanceMetrics | undefined>;

  /**
   * Blend static routing score with historical evidence.
   * Cold-start / insufficient samples → static score unchanged.
   */
  blendScore(input: {
    staticTotal: number;
    staticQuality: number;
    staticLatency: number;
    staticCost: number;
    staticHealth: number;
    strategy: RoutingStrategyKind;
    key: PerformanceLookupKey;
  }): Promise<{
    total: number;
    quality: number;
    latency: number;
    cost: number;
    explain: AdaptiveRoutingExplain;
  }>;
}
