/**
 * Composable planning strategy ports.
 *
 * Purpose: Split planning pipeline into replaceable strategies.
 * Responsibilities: Each strategy mutates/extends PlanningContext via Result.
 * Usage: Injected into ExecutionPlanningEngine.
 * Future Extension: Learned strategies, A/B routing.
 */

import type { CapabilityDefinition } from "../../../capability-registry/contracts/capability-definition";
import type { Result } from "../../../shared/result";
import type { CapabilityRequest } from "../../contracts/capability-request";
import type { ExecutionGraph } from "../../contracts/execution-graph";
import type { ExecutionCostEstimate } from "../../contracts/execution-metadata";
import type {
  EvaluationPlan,
  HumanReviewPlan,
  ProviderSelectionPlan,
  RetryPlan,
  RoutingConstraintsPlan,
  TimeoutPlan,
  BudgetPlan,
  ExecutionPolicyPlan,
} from "../../contracts/execution-plan";
import type { ExecutionMode } from "../../contracts/execution-mode";
import type { ExecutionStrategy } from "../../contracts/execution-strategy";
import type { PlanningContext } from "../../contracts/planning-context";

export interface ICapabilityResolver {
  resolve(
    request: CapabilityRequest
  ): Promise<Result<CapabilityDefinition>>;
}

export interface IPolicyResolver {
  resolve(context: PlanningContext): Promise<Result<PlanningContext>>;
}

export interface IProviderSelectionStrategy {
  select(context: PlanningContext): Promise<Result<ProviderSelectionPlan>>;
}

export interface IModelSelectionStrategy {
  select(context: PlanningContext): Promise<Result<string | undefined>>;
}

export interface ICostEstimationStrategy {
  estimate(context: PlanningContext): Promise<Result<ExecutionCostEstimate>>;
}

export interface IRetryStrategy {
  plan(context: PlanningContext): Promise<Result<RetryPlan>>;
}

export interface ITimeoutStrategy {
  plan(context: PlanningContext): Promise<Result<TimeoutPlan>>;
}

export interface IHumanReviewStrategy {
  plan(context: PlanningContext): Promise<Result<HumanReviewPlan>>;
}

export interface IEvaluationStrategy {
  plan(context: PlanningContext): Promise<Result<EvaluationPlan>>;
}

export interface IRoutingStrategy {
  plan(context: PlanningContext): Promise<
    Result<{
      routingConstraints: RoutingConstraintsPlan;
      executionStrategy: ExecutionStrategy;
      executionMode: ExecutionMode;
      budget: BudgetPlan;
      executionPolicy: ExecutionPolicyPlan;
    }>
  >;
}

export interface IExecutionGraphBuilder {
  build(context: PlanningContext): Promise<Result<ExecutionGraph>>;
}
