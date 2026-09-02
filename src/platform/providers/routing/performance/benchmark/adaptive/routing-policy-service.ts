/**
 * Step 12 — Routing policy lifecycle (explicit human activation).
 */

import type { PromotionCandidate } from "../governance/promotion-candidate-contract";
import type { AdaptiveRoutingPolicy, RoutingPolicyLifecycle } from "./routing-policy-contract";
import { DEFAULT_ROUTING_POLICY_GUARDRAILS } from "./routing-policy-contract";
import type { IRoutingPolicyStore } from "./routing-policy-store";
import { defaultRoutingPolicyStore } from "./routing-policy-store";

export type RoutingPolicyService = {
  createFromApprovedCandidate(input: {
    readonly candidate: PromotionCandidate;
    readonly createId: (prefix: string) => string;
    readonly nowIso: () => string;
    readonly rolloutPercentage?: number;
    readonly expiresAt?: string;
  }): Promise<AdaptiveRoutingPolicy>;
  submitForReview(policyId: string): Promise<AdaptiveRoutingPolicy>;
  approvePolicy(input: {
    readonly policyId: string;
    readonly approvedBy: string;
    readonly nowIso: () => string;
  }): Promise<AdaptiveRoutingPolicy>;
  activatePolicy(input: {
    readonly policyId: string;
    readonly approvedBy: string;
    readonly nowIso: () => string;
  }): Promise<AdaptiveRoutingPolicy>;
  pausePolicy(input: {
    readonly policyId: string;
    readonly reason: string;
    readonly nowIso: () => string;
  }): Promise<AdaptiveRoutingPolicy>;
  retirePolicy(policyId: string, nowIso: () => string): Promise<AdaptiveRoutingPolicy>;
  getPolicy(policyId: string): Promise<AdaptiveRoutingPolicy | undefined>;
  listActivePolicies(): Promise<readonly AdaptiveRoutingPolicy[]>;
};

export function createRoutingPolicyService(deps?: {
  readonly store?: IRoutingPolicyStore;
}): RoutingPolicyService {
  const store = deps?.store ?? defaultRoutingPolicyStore;

  async function requirePolicy(policyId: string): Promise<AdaptiveRoutingPolicy> {
    const p = await store.get(policyId);
    if (!p) throw new Error(`Routing policy not found: ${policyId}`);
    return p;
  }

  return Object.freeze({
    createFromApprovedCandidate: async (input) => {
      const c = input.candidate;
      if (c.lifecycle !== "APPROVED") {
        throw new Error("Routing policy requires APPROVED promotion candidate");
      }
      const policy: AdaptiveRoutingPolicy = Object.freeze({
        policyId: input.createId("policy"),
        policyVersion: "1.0.0",
        lifecycle: "DRAFT",
        enabled: false,
        scope: Object.freeze({
          service: c.scope.service,
          ...(c.scope.subtype ? { subtype: c.scope.subtype } : {}),
          ...(c.scope.industry ? { industry: c.scope.industry } : {}),
        }),
        candidate: c.candidate,
        promotionCandidateId: c.candidateId,
        rolloutPercentage:
          input.rolloutPercentage ?? DEFAULT_ROUTING_POLICY_GUARDRAILS.rolloutPercentage,
        minimumConfidence: DEFAULT_ROUTING_POLICY_GUARDRAILS.minimumConfidence,
        minimumSamples: DEFAULT_ROUTING_POLICY_GUARDRAILS.minimumSamples,
        maxCostIncrease: DEFAULT_ROUTING_POLICY_GUARDRAILS.maxCostIncrease,
        maxLatencyIncrease: DEFAULT_ROUTING_POLICY_GUARDRAILS.maxLatencyIncrease,
        maxReliabilityRegression: DEFAULT_ROUTING_POLICY_GUARDRAILS.maxReliabilityRegression,
        maxQualityRegression: DEFAULT_ROUTING_POLICY_GUARDRAILS.maxQualityRegression,
        createdAt: input.nowIso(),
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      });
      await store.save(policy);
      return policy;
    },

    submitForReview: async (policyId) => {
      const p = await requirePolicy(policyId);
      const updated = Object.freeze({ ...p, lifecycle: "REVIEW" as RoutingPolicyLifecycle });
      await store.save(updated);
      return updated;
    },

    approvePolicy: async (input) => {
      const p = await requirePolicy(input.policyId);
      if (!input.approvedBy?.trim()) throw new Error("Policy approval requires approvedBy");
      const updated = Object.freeze({
        ...p,
        lifecycle: "APPROVED" as RoutingPolicyLifecycle,
        approvedBy: input.approvedBy.trim(),
        approvedAt: input.nowIso(),
      });
      await store.save(updated);
      return updated;
    },

    activatePolicy: async (input) => {
      const p = await requirePolicy(input.policyId);
      if (p.lifecycle !== "APPROVED") {
        throw new Error("Only APPROVED policies may become ACTIVE");
      }
      if (!input.approvedBy?.trim()) throw new Error("Policy activation requires approvedBy");
      const updated = Object.freeze({
        ...p,
        lifecycle: "ACTIVE" as RoutingPolicyLifecycle,
        enabled: true,
        approvedBy: p.approvedBy ?? input.approvedBy.trim(),
        approvedAt: p.approvedAt ?? input.nowIso(),
        activatedAt: input.nowIso(),
      });
      await store.save(updated);
      return updated;
    },

    pausePolicy: async (input) => {
      const p = await requirePolicy(input.policyId);
      const updated = Object.freeze({
        ...p,
        lifecycle: "PAUSED" as RoutingPolicyLifecycle,
        enabled: false,
        pausedAt: input.nowIso(),
        pauseReason: input.reason,
      });
      await store.save(updated);
      return updated;
    },

    retirePolicy: async (policyId, nowIso) => {
      const p = await requirePolicy(policyId);
      const updated = Object.freeze({
        ...p,
        lifecycle: "RETIRED" as RoutingPolicyLifecycle,
        enabled: false,
      });
      await store.save(updated);
      return updated;
    },

    getPolicy: (policyId) => store.get(policyId),

    listActivePolicies: () =>
      store.query({ lifecycle: "ACTIVE", enabled: true, limit: 1000 }),
  });
}

export const defaultRoutingPolicyService = createRoutingPolicyService();
