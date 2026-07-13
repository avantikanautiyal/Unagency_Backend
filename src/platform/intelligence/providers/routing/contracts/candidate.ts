/**
 * Routing candidate and score contracts.
 */

import type { CapabilityId, ProviderId } from "../../../shared/identifiers";
import type { RoutingHealthState } from "./enums";

export interface RoutingCandidate {
  readonly providerId: ProviderId;
  readonly modelId?: string;
  readonly vendor: string;
  readonly region?: string;
  readonly capabilities: readonly string[];
  readonly healthy: boolean;
  readonly healthState: RoutingHealthState;
  readonly estimatedLatencyMs?: number;
  readonly estimatedCost?: number;
  readonly qualityScore?: number;
  readonly availability?: number;
  readonly priority?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface RoutingScoreDimensions {
  readonly capability: number;
  readonly health: number;
  readonly latency: number;
  readonly quality: number;
  readonly cost: number;
  readonly availability: number;
  readonly preference: number;
  readonly region: number;
  readonly compliance: number;
  readonly priority: number;
}

export interface RoutingScore {
  readonly providerId: ProviderId;
  readonly modelId?: string;
  readonly total: number;
  readonly dimensions: RoutingScoreDimensions;
  readonly rank?: number;
}

export interface RoutingRecommendation {
  readonly providerId: ProviderId;
  readonly modelId?: string;
  readonly score: RoutingScore;
  readonly reason: string;
  readonly selected: boolean;
}
