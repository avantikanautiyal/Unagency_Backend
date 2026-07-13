/**
 * Execution Planner ports.
 * Architecture only — no implementation.
 *
 * Transforms a Capability Request into an Execution Plan.
 * Provider selection belongs exclusively here.
 *
 * DOES NOT execute AI, orchestrate, or call provider SDKs.
 * Depends only on interfaces (catalog, matrix, policies — injected later).
 */

import type {
  CapabilityId,
  OrganizationId,
  ProviderId,
  WorkspaceId,
} from "../../shared/identifiers";
import type { Result } from "../../shared/result";

/** Inbound request from the gateway (future) — never includes provider choice from business modules. */
export interface CapabilityRequest {
  readonly capabilityId: CapabilityId;
  readonly organizationId: OrganizationId;
  readonly workspaceId: WorkspaceId;
  readonly inputHints?: Readonly<Record<string, unknown>>;
  readonly correlationId?: string;
}

export type ExecutionStrategy =
  | "direct"
  | "fallback_chain"
  | "ensemble"
  | "human_gated";

export interface ProviderSelectionPlan {
  readonly primaryProviderId: ProviderId;
  readonly fallbackProviderIds: readonly ProviderId[];
  readonly selectionReason?: string;
}

export interface RetryStrategyPlan {
  readonly maxAttempts: number;
  readonly backoffMs: number;
  readonly strategy: "none" | "fixed" | "exponential";
}

export interface TimeoutStrategyPlan {
  readonly timeoutMs: number;
}

export interface BudgetPlan {
  readonly maxCost?: number;
  readonly maxTokens?: number;
  readonly currency?: string;
}

export interface EvaluationStrategyPlan {
  readonly enabled: boolean;
  readonly sampleRate?: number;
  readonly criteria?: readonly string[];
}

export interface HumanReviewPlan {
  readonly required: boolean;
  readonly reason?: string;
}

export interface ExecutionPolicyPlan {
  readonly policyRefs?: readonly string[];
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface RoutingConstraintsPlan {
  readonly requiredFeatures?: readonly string[];
  readonly excludedProviderIds?: readonly ProviderId[];
  readonly attributes?: Readonly<Record<string, unknown>>;
}

/**
 * Complete execution plan produced by the planner.
 * Consumed by the future Orchestrator — never by business modules for provider choice.
 */
export interface ExecutionPlan {
  readonly planId: string;
  readonly capabilityId: CapabilityId;
  readonly capabilityVersion?: string;
  readonly executionStrategy: ExecutionStrategy;
  readonly providerSelection: ProviderSelectionPlan;
  readonly retry: RetryStrategyPlan;
  readonly timeout: TimeoutStrategyPlan;
  readonly budget: BudgetPlan;
  readonly evaluation: EvaluationStrategyPlan;
  readonly humanReview: HumanReviewPlan;
  readonly executionPolicy: ExecutionPolicyPlan;
  readonly routingConstraints: RoutingConstraintsPlan;
}

/**
 * Sole owner of provider selection for the platform.
 */
export interface IExecutionPlanner {
  plan(request: CapabilityRequest): Promise<Result<ExecutionPlan>>;
}

/** @deprecated Use CapabilityRequest. */
export type PlanRequest = CapabilityRequest;
