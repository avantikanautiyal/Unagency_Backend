/**
 * Immutable execution plan.
 *
 * Purpose: Complete planning output for the future orchestrator.
 * Responsibilities: Hold graph, strategies, policies, and metadata.
 * Usage: Produced only by ExecutionPlanningEngine.
 * Future Extension: Multi-graph plans, partial plans.
 */

import type { CapabilityId, ProviderId } from "../../shared/identifiers";
import type { ExecutionGraph } from "./execution-graph";
import type { ExecutionMetadata } from "./execution-metadata";
import type { ExecutionMode } from "./execution-mode";
import type { ExecutionPriority } from "./execution-priority";
import type { ExecutionStrategy } from "./execution-strategy";

export interface ProviderSelectionPlan {
  readonly primaryProviderId: ProviderId;
  readonly fallbackProviderIds: readonly ProviderId[];
  readonly selectionReason?: string;
  readonly modelId?: string;
}

export interface RetryPlan {
  readonly maxAttempts: number;
  readonly backoffMs: number;
  readonly strategy: "none" | "fixed" | "exponential";
}

export interface TimeoutPlan {
  readonly timeoutMs: number;
}

export interface BudgetPlan {
  readonly maxCost?: number;
  readonly maxTokens?: number;
  readonly currency?: string;
}

export interface EvaluationPlan {
  readonly enabled: boolean;
  readonly sampleRate?: number;
  readonly criteria?: readonly string[];
}

export interface HumanReviewPlan {
  readonly required: boolean;
  readonly reason?: string;
}

export interface ExecutionPolicyPlan {
  readonly policyRefs: readonly string[];
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface RoutingConstraintsPlan {
  readonly requiredFeatures: readonly string[];
  readonly excludedProviderIds: readonly ProviderId[];
  readonly attributes?: Readonly<Record<string, unknown>>;
}

/**
 * Complete immutable execution plan.
 */
export interface ExecutionPlan {
  readonly planId: string;
  readonly capabilityId: CapabilityId;
  readonly capabilityVersion?: string;
  readonly executionStrategy: ExecutionStrategy;
  readonly executionMode: ExecutionMode;
  readonly priority: ExecutionPriority;
  readonly providerSelection: ProviderSelectionPlan;
  readonly retry: RetryPlan;
  readonly timeout: TimeoutPlan;
  readonly budget: BudgetPlan;
  readonly evaluation: EvaluationPlan;
  readonly humanReview: HumanReviewPlan;
  readonly executionPolicy: ExecutionPolicyPlan;
  readonly routingConstraints: RoutingConstraintsPlan;
  readonly graph: ExecutionGraph;
  readonly metadata: ExecutionMetadata;
}
