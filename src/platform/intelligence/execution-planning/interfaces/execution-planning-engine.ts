/**
 * Execution planning engine port.
 *
 * Purpose: Transform CapabilityRequest into immutable ExecutionPlan.
 * Responsibilities: Validate, resolve, apply policies, select provider, build graph.
 * Usage: Future gateway/orchestrator entry for planning only.
 * Future Extension: Plan caching, multi-capability plans.
 */

import type { Result } from "../../shared/result";
import type { CapabilityRequest } from "../contracts/capability-request";
import type { ExecutionPlan } from "../contracts/execution-plan";
import type { PlanningContext } from "../contracts/planning-context";
import type { CapabilityDefinition } from "../../capability-registry/contracts/capability-definition";

export interface IExecutionPlanningEngine {
  validateRequest(request: CapabilityRequest): Result<CapabilityRequest>;
  createPlanningContext(request: CapabilityRequest): PlanningContext;
  resolveCapability(
    request: CapabilityRequest
  ): Promise<Result<CapabilityDefinition>>;
  applyPolicies(context: PlanningContext): Promise<Result<PlanningContext>>;
  selectProvider(
    context: PlanningContext
  ): Promise<Result<PlanningContext>>;
  estimateCost(context: PlanningContext): Promise<Result<PlanningContext>>;
  determineExecutionMode(
    context: PlanningContext
  ): Promise<Result<PlanningContext>>;
  buildExecutionGraph(
    context: PlanningContext
  ): Promise<Result<PlanningContext>>;
  produceExecutionPlan(
    request: CapabilityRequest
  ): Promise<Result<ExecutionPlan>>;
}
