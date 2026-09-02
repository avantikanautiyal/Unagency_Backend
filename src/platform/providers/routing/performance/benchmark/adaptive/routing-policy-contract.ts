/**
 * Step 12 — Versioned adaptive routing policy (configuration-driven, not self-modifying).
 */

import type { ShadowCandidateRef } from "../shadow/shadow-decision-contract";

export type RoutingPolicyLifecycle =
  | "DRAFT"
  | "REVIEW"
  | "APPROVED"
  | "ACTIVE"
  | "PAUSED"
  | "EXPIRED"
  | "RETIRED";

export type RoutingPolicyScope = {
  readonly service?: string;
  readonly subtype?: string;
  readonly industry?: string;
  readonly platform?: string;
  readonly format?: string;
};

export type AdaptiveRoutingPolicy = {
  readonly policyId: string;
  readonly policyVersion: string;
  readonly lifecycle: RoutingPolicyLifecycle;
  readonly enabled: boolean;
  readonly scope: RoutingPolicyScope;
  readonly candidate: ShadowCandidateRef;
  readonly promotionCandidateId: string;
  readonly rolloutPercentage: number;
  readonly minimumConfidence: "high" | "medium" | "low" | "insufficient";
  readonly minimumSamples: number;
  readonly maxCostIncrease: number;
  readonly maxLatencyIncrease: number;
  readonly maxReliabilityRegression: number;
  readonly maxQualityRegression: number;
  readonly createdAt: string;
  readonly approvedAt?: string;
  readonly approvedBy?: string;
  readonly activatedAt?: string;
  readonly expiresAt?: string;
  readonly pausedAt?: string;
  readonly pauseReason?: string;
};

export type RoutingPolicyQuery = {
  readonly policyId?: string;
  readonly lifecycle?: RoutingPolicyLifecycle;
  readonly service?: string;
  readonly industry?: string;
  readonly enabled?: boolean;
  readonly limit?: number;
};

export const DEFAULT_ROUTING_POLICY_GUARDRAILS = Object.freeze({
  rolloutPercentage: 5,
  minimumSamples: 3,
  minimumConfidence: "medium" as const,
  maxCostIncrease: 1.25,
  maxLatencyIncrease: 1.35,
  maxReliabilityRegression: 0.15,
  maxQualityRegression: 5,
});
