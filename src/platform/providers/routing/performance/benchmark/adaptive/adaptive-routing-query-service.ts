/**
 * Step 12/13 — Adaptive routing query surface (extends intelligence layer).
 */

import type { ModelPerformanceRecord } from "../contracts/model-performance-record";
import type { IBenchmarkPerformanceRecordStore } from "../persistence/benchmark-record-store";
import { defaultBenchmarkPerformanceRecordStore } from "../persistence/benchmark-record-store";
import type { IAdaptiveRoutingDecisionStore } from "./adaptive-routing-decision-store";
import { defaultAdaptiveRoutingDecisionStore } from "./adaptive-routing-decision-store";
import type { IRoutingPolicyStore } from "./routing-policy-store";
import { defaultRoutingPolicyStore } from "./routing-policy-store";
import type { IPromotionCandidateStore } from "../governance/promotion-governance-store";
import { defaultPromotionCandidateStore } from "../governance/promotion-governance-store";
import type {
  AdaptiveRoutingDecision,
  AdaptiveRoutingDecisionContext,
} from "./adaptive-routing-decision-contract";
import { resolveAdaptiveRoutingDecision } from "./adaptive-routing-decision-service";
import {
  detectAdaptiveRegression,
  sliceAdaptiveVsStatic,
  type AdaptivePerformanceSlice,
} from "./adaptive-routing-rollback";
import type { AdaptiveRoutingPolicy } from "./routing-policy-contract";
import type { PromotionCandidate } from "../governance/promotion-candidate-contract";
import type { IAdaptiveRollbackStore } from "./adaptive-rollback-store";
import { defaultAdaptiveRollbackStore } from "./adaptive-rollback-store";
import { validateAdaptivePolicy } from "./adaptive-policy-validator";
import type { ICompatibilityEngine, IModelRegistry } from "../../../../../model-registry/interfaces/model-registry";
import type { IProviderRuntimeRegistry } from "../../../../runtime/registry/in-memory-provider-runtime-registry";
import { ADAPTIVE_PILOT_TEMPLATE } from "./adaptive-routing-safety";

export type AdaptiveRoutingQueryService = {
  getAdaptiveRoutingDecision(
    context: AdaptiveRoutingDecisionContext,
  ): Promise<AdaptiveRoutingDecision>;
  getActiveAdaptivePolicies(): Promise<readonly AdaptiveRoutingPolicy[]>;
  getPolicyStatus(policyId: string): Promise<AdaptiveRoutingPolicy | undefined>;
  getPromotionCandidates(): Promise<readonly PromotionCandidate[]>;
  getAdaptiveVsStaticPerformance(input?: {
    readonly service?: string;
    readonly industry?: string;
  }): Promise<AdaptivePerformanceSlice>;
  getAdaptiveRoutingHealth(): Promise<{
    readonly activePolicies: number;
    readonly pausedPolicies: number;
    readonly adaptiveDecisions: number;
    readonly adaptiveSelectionRate: number;
    readonly fallbackRate: number;
    readonly rollbackEvents: number;
  }>;
  getRoutingRegressions(input?: {
    readonly service?: string;
  }): Promise<readonly string[]>;
  getRollbackEvents(input?: {
    readonly policyId?: string;
    readonly sinceIso?: string;
  }): Promise<readonly import("./adaptive-rollback-store").AdaptiveRollbackEvent[]>;
  getPolicyReadiness(policyId: string): Promise<{
    readonly policy?: AdaptiveRoutingPolicy;
    readonly valid: boolean;
    readonly reasons: readonly string[];
  }>;
  getPilotTemplate(): typeof ADAPTIVE_PILOT_TEMPLATE;
};

export function createAdaptiveRoutingQueryService(deps?: {
  readonly recordStore?: IBenchmarkPerformanceRecordStore;
  readonly decisionStore?: IAdaptiveRoutingDecisionStore;
  readonly policyStore?: IRoutingPolicyStore;
  readonly promotionStore?: IPromotionCandidateStore;
  readonly rollbackStore?: IAdaptiveRollbackStore;
  readonly env?: NodeJS.ProcessEnv;
  readonly providerRegistry?: IProviderRuntimeRegistry;
  readonly modelRegistry?: IModelRegistry;
  readonly compatibilityEngine?: ICompatibilityEngine;
  readonly nowIso?: () => string;
}): AdaptiveRoutingQueryService {
  const recordStore = deps?.recordStore ?? defaultBenchmarkPerformanceRecordStore;
  const decisionStore = deps?.decisionStore ?? defaultAdaptiveRoutingDecisionStore;
  const policyStore = deps?.policyStore ?? defaultRoutingPolicyStore;
  const promotionStore = deps?.promotionStore ?? defaultPromotionCandidateStore;
  const rollbackStore = deps?.rollbackStore ?? defaultAdaptiveRollbackStore;
  const nowIso = deps?.nowIso ?? (() => new Date().toISOString());

  return Object.freeze({
    getAdaptiveRoutingDecision: (context) =>
      resolveAdaptiveRoutingDecision(context, {
        recordStore,
        decisionStore,
        policyStore,
        rollbackStore,
        env: deps?.env,
        providerRegistry: deps?.providerRegistry,
        modelRegistry: deps?.modelRegistry,
        compatibilityEngine: deps?.compatibilityEngine,
      }),

    getActiveAdaptivePolicies: () =>
      policyStore.query({ lifecycle: "ACTIVE", enabled: true, limit: 1000 }),

    getPolicyStatus: (policyId) => policyStore.get(policyId),

    getPromotionCandidates: () => promotionStore.query({ limit: 1000 }),

    getAdaptiveVsStaticPerformance: async (input) => {
      const rows = await recordStore.query({
        evidenceSource: "production",
        service: input?.service,
        industry: input?.industry,
        limit: 10_000,
      });
      return sliceAdaptiveVsStatic(rows);
    },

    getAdaptiveRoutingHealth: async () => {
      const active = await policyStore.query({ lifecycle: "ACTIVE", enabled: true });
      const paused = await policyStore.query({ lifecycle: "PAUSED" });
      const decisions = await decisionStore.query({ limit: 10_000 });
      const adaptiveCount = decisions.filter((d) => d.decision === "USE_ADAPTIVE").length;
      const production = await recordStore.query({ evidenceSource: "production", limit: 10_000 });
      const adaptiveProduction = production.filter((r) => r.routingMode === "adaptive");
      const fallbackCount = adaptiveProduction.filter((r) => r.fallbackUsed === true).length;
      const rollbacks = await rollbackStore.query({ limit: 10_000 });
      return Object.freeze({
        activePolicies: active.length,
        pausedPolicies: paused.length,
        adaptiveDecisions: decisions.length,
        adaptiveSelectionRate:
          decisions.length > 0 ? adaptiveCount / decisions.length : 0,
        fallbackRate:
          adaptiveProduction.length > 0 ? fallbackCount / adaptiveProduction.length : 0,
        rollbackEvents: rollbacks.length,
      });
    },

    getRoutingRegressions: async (input) => {
      const rows = await recordStore.query({
        evidenceSource: "production",
        service: input?.service,
        limit: 10_000,
      });
      return detectAdaptiveRegression(sliceAdaptiveVsStatic(rows));
    },

    getRollbackEvents: (input) => rollbackStore.query(input),

    getPolicyReadiness: async (policyId) => {
      const policy = await policyStore.get(policyId);
      if (!policy) return Object.freeze({ valid: false, reasons: Object.freeze(["policy not found"]) });
      if (!deps?.providerRegistry || !deps?.modelRegistry || !deps?.compatibilityEngine) {
        return Object.freeze({
          policy,
          valid: policy.lifecycle === "ACTIVE" && Boolean(policy.approvedBy),
          reasons: Object.freeze([]),
        });
      }
      const result = validateAdaptivePolicy({
        policy,
        nowIso,
        providerRegistry: deps.providerRegistry,
        modelRegistry: deps.modelRegistry,
        compatibilityEngine: deps.compatibilityEngine,
      });
      return Object.freeze({
        policy,
        valid: result.valid,
        reasons: result.reasons,
      });
    },

    getPilotTemplate: () => ADAPTIVE_PILOT_TEMPLATE,
  });
}

export const defaultAdaptiveRoutingQueryService = createAdaptiveRoutingQueryService();
