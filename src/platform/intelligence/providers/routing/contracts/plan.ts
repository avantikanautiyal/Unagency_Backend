/**
 * Routing history, health, statistics, topology, and experiment contracts.
 */

import type { CapabilityId, ProviderId } from "../../../shared/identifiers";
import type { ExperimentKind, FailoverKind, RoutingHealthState } from "./enums";
import type { RoutingDecisionId, RoutingPlanId } from "./identifiers";
import type { RoutingScore, RoutingRecommendation } from "./candidate";
import type { RoutingStrategyKind } from "./enums";

export interface RoutingHistoryEntry {
  readonly providerId: ProviderId;
  readonly capabilityId: CapabilityId;
  readonly success: boolean;
  readonly latencyMs?: number;
  readonly qualityScore?: number;
  readonly recordedAt: string;
}

export interface RoutingHistory {
  readonly capabilityId: CapabilityId;
  readonly entries: readonly RoutingHistoryEntry[];
}

export interface RoutingHealthSnapshot {
  readonly providerId: ProviderId;
  readonly state: RoutingHealthState;
  readonly latencyMs?: number;
  readonly errorRate?: number;
  readonly checkedAt: string;
}

export interface RoutingExperiment {
  readonly experimentId: string;
  readonly kind: ExperimentKind;
  readonly primaryProviderId: ProviderId;
  readonly experimentProviderId?: ProviderId;
  readonly trafficPercent?: number;
  readonly shadowOnly?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface RoutingStatistics {
  readonly candidatesEvaluated: number;
  readonly candidatesFiltered: number;
  readonly strategy: RoutingStrategyKind;
  readonly durationMs?: number;
}

export interface RoutingTopologyNode {
  readonly providerId: ProviderId;
  readonly region?: string;
  readonly weight: number;
  readonly healthy: boolean;
}

export interface RoutingTopology {
  readonly capabilityId: CapabilityId;
  readonly nodes: readonly RoutingTopologyNode[];
  readonly capturedAt: string;
}

export interface FailoverStep {
  readonly kind: FailoverKind;
  readonly providerId: ProviderId;
  readonly modelId?: string;
  readonly order: number;
}

export interface RoutingPlan {
  readonly planId: RoutingPlanId;
  readonly requestId: string;
  readonly capabilityId: CapabilityId;
  readonly primary: RoutingRecommendation;
  readonly fallbacks: readonly RoutingRecommendation[];
  readonly failoverChain: readonly FailoverStep[];
  readonly experiments: readonly RoutingExperiment[];
  readonly statistics: RoutingStatistics;
  readonly createdAt: string;
}

export interface RoutingDecision {
  readonly decisionId: RoutingDecisionId;
  readonly plan: RoutingPlan;
  readonly strategy: RoutingStrategyKind;
  readonly scores: readonly RoutingScore[];
  readonly warnings: readonly string[];
  readonly completedAt: string;
}
