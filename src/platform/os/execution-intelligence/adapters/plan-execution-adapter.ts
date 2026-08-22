/**
 * Phase 4 → Phase 5 bridge: read/validate plans only.
 * MUST NOT dispatch child tasks or start multi-step orchestration.
 */

import type { ICapabilityRegistry } from "../../../intelligence/capability-registry/interfaces/capability-registry";
import type { IOutputContractRegistry } from "../../contracts/layer-ports";
import type { ExecutionPlan } from "../contracts/execution-plan";
import { validateExecutionPlan } from "../validation/validate-execution-plan";
import { ExecutionIntelligenceError } from "../contracts/errors";

export interface PlanExecutionAdapterResult {
  readonly planId: string;
  readonly planVersion: number;
  readonly status: ExecutionPlan["status"];
  readonly taskCount: number;
  readonly readyForGraphExecution: boolean;
  readonly validationOk: boolean;
  readonly errors: readonly string[];
}

/**
 * Validates a plan for future TaskGraphExecutor consumption.
 * Returns readiness — does NOT execute.
 */
export function inspectPlanForExecution(
  plan: ExecutionPlan,
  options: {
    readonly trustedOrganizationId: string;
    readonly capabilityRegistry: ICapabilityRegistry;
    readonly outputContractRegistry: IOutputContractRegistry;
  }
): PlanExecutionAdapterResult {
  if (plan.organizationId !== options.trustedOrganizationId) {
    throw new ExecutionIntelligenceError(
      "PLAN_TENANT_VIOLATION",
      "Cannot inspect plan for another organization"
    );
  }

  const validation = validateExecutionPlan(plan, options);
  const ready =
    validation.ok &&
    plan.status === "APPROVED_FOR_EXECUTION" &&
    plan.tasks.length > 0;

  return {
    planId: plan.id,
    planVersion: plan.planVersion,
    status: plan.status,
    taskCount: plan.tasks.length,
    readyForGraphExecution: ready,
    validationOk: validation.ok,
    errors: validation.errors,
  };
}
