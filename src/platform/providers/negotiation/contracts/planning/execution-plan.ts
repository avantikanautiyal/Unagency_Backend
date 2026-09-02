/**
 * Execution plan — provider-independent plan consumed by negotiation.
 * Replaces deleted platform/execution-planning module (negotiation-local).
 */

import type { CapabilityId, ProviderId } from "../../../../core/identifiers";
import type { ExecutionMode } from "./execution-mode";
import type { ExecutionPriority } from "./execution-priority";

export type ExecutionStrategy = "direct" | "ensemble" | "fallback_chain";

export interface ExecutionPlanRetry {
  readonly maxAttempts: number;
  readonly backoffMs: number;
  readonly strategy: "fixed" | "exponential";
}

export interface ExecutionPlanTimeout {
  readonly timeoutMs: number;
}

export interface ExecutionPlanBudget {
  readonly maxCost: number;
  readonly currency: string;
}

export interface ExecutionPlanProviderSelection {
  readonly primaryProviderId: ProviderId;
  readonly fallbackProviderIds: readonly ProviderId[];
  readonly modelId: string;
}

export interface ExecutionPlanGraphNode {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly stageId: string;
  readonly order: number;
}

export interface ExecutionPlanGraphStage {
  readonly id: string;
  readonly name: string;
  readonly mode: ExecutionMode;
  readonly order: number;
  readonly nodeIds: readonly string[];
}

export interface ExecutionPlanGraph {
  readonly entryNodeId: string;
  readonly exitNodeId: string;
  readonly nodes: readonly ExecutionPlanGraphNode[];
  readonly edges: readonly Readonly<Record<string, unknown>>[];
  readonly stages: readonly ExecutionPlanGraphStage[];
}

export interface ExecutionPlanMetadata {
  readonly planId: string;
  readonly capabilityId: CapabilityId;
  readonly primaryProviderId: ProviderId;
  readonly fallbackProviderIds: readonly ProviderId[];
  readonly strategy: ExecutionStrategy;
  readonly priority: ExecutionPriority;
  readonly costEstimate: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface ExecutionPlan {
  readonly planId: string;
  readonly capabilityId: CapabilityId;
  readonly executionStrategy: ExecutionStrategy;
  readonly executionMode: ExecutionMode;
  readonly priority: ExecutionPriority;
  readonly providerSelection: ExecutionPlanProviderSelection;
  readonly retry: ExecutionPlanRetry;
  readonly timeout: ExecutionPlanTimeout;
  readonly budget: ExecutionPlanBudget;
  readonly evaluation: { readonly enabled: boolean };
  readonly humanReview: { readonly required: boolean };
  readonly executionPolicy: { readonly policyRefs: readonly string[] };
  readonly routingConstraints: {
    readonly requiredFeatures: readonly string[];
    readonly excludedProviderIds: readonly ProviderId[];
  };
  readonly graph: ExecutionPlanGraph;
  readonly metadata: ExecutionPlanMetadata;
}
