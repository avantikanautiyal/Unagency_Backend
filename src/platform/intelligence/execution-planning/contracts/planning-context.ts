/**
 * Planning context assembled during the planning pipeline.
 *
 * Purpose: Carry resolved inputs between planning strategies.
 * Responsibilities: Hold request, capability, candidates, and intermediate decisions.
 * Usage: Internal to ExecutionPlanningEngine; not a public mutation surface.
 * Future Extension: Tenant policy snapshots.
 */

import type { CapabilityDefinition } from "../../capability-registry/contracts/capability-definition";
import type { ProviderDefinition } from "../../providers/metadata/provider-definition";
import type { PolicyDecision } from "../../policies/interfaces/policies";
import type { CapabilityRequest } from "./capability-request";
import type {
  BudgetPlan,
  EvaluationPlan,
  ExecutionPolicyPlan,
  HumanReviewPlan,
  ProviderSelectionPlan,
  RetryPlan,
  RoutingConstraintsPlan,
  TimeoutPlan,
} from "./execution-plan";
import type { ExecutionMode } from "./execution-mode";
import type { ExecutionPriority } from "./execution-priority";
import type { ExecutionStrategy } from "./execution-strategy";
import type { ExecutionCostEstimate } from "./execution-metadata";

export interface PlanningContext {
  readonly request: CapabilityRequest;
  readonly capability?: CapabilityDefinition;
  readonly candidateProviders: readonly ProviderDefinition[];
  readonly policyDecisions: readonly PolicyDecision[];
  readonly providerSelection?: ProviderSelectionPlan;
  readonly modelId?: string;
  readonly costEstimate?: ExecutionCostEstimate;
  readonly retry?: RetryPlan;
  readonly timeout?: TimeoutPlan;
  readonly budget?: BudgetPlan;
  readonly evaluation?: EvaluationPlan;
  readonly humanReview?: HumanReviewPlan;
  readonly executionPolicy?: ExecutionPolicyPlan;
  readonly routingConstraints?: RoutingConstraintsPlan;
  readonly executionMode?: ExecutionMode;
  readonly executionStrategy?: ExecutionStrategy;
  readonly priority: ExecutionPriority;
  readonly createdAt: string;
}
