/**
 * Routing hints, failover, canary, shadow recommendations.
 */

import type { HintTarget, RecommendationPriority, CanaryAction, ShadowAction } from "./enums";

export interface MeshRecommendationEvidence {
  readonly metrics: readonly string[];
  readonly evidence: readonly string[];
  readonly confidence: number;
  readonly why: string;
}

export interface RoutingHint {
  readonly hintId: string;
  readonly target: HintTarget;
  readonly providerId: string;
  readonly action: "prefer" | "avoid" | "deprioritize" | "limit";
  readonly priority: RecommendationPriority;
  readonly rationale: MeshRecommendationEvidence;
}

export interface FailoverChain {
  readonly chainId: string;
  readonly primaryProviderId: string;
  readonly orderedFallbacks: readonly string[];
  readonly rationale: MeshRecommendationEvidence;
}

export interface CanaryPlan {
  readonly planId: string;
  readonly sourceProviderId: string;
  readonly targetProviderId: string;
  readonly percentage: number;
  readonly action: CanaryAction;
  readonly rollbackRecommended: boolean;
  readonly rationale: MeshRecommendationEvidence;
}

export interface ShadowRecommendation {
  readonly recommendationId: string;
  readonly primaryProviderId: string;
  readonly shadowProviderId: string;
  readonly action: ShadowAction;
  readonly comparisonMetadata: Readonly<Record<string, unknown>>;
  readonly rationale: MeshRecommendationEvidence;
}

export interface ProviderCapacityReport {
  readonly providerId: string;
  readonly capacityUtilization: number;
  readonly concurrentExecutions: number;
  readonly headroom: number;
  readonly constrained: boolean;
}
