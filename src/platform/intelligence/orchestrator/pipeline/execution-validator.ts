/**
 * Validates an approved ExecutionPlan before orchestration.
 */

import type { ExecutionPlan } from "../../execution-planning/contracts/execution-plan";
import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import { OrchestratorValidationError } from "../errors";

export interface IExecutionValidator {
  validate(plan: ExecutionPlan): Result<ExecutionPlan>;
}

export class ExecutionValidator implements IExecutionValidator {
  validate(plan: ExecutionPlan): Result<ExecutionPlan> {
    const issues: string[] = [];
    if (!plan.planId) issues.push("planId is required");
    if (!plan.capabilityId) issues.push("capabilityId is required");
    if (!plan.graph?.nodes?.length) issues.push("graph.nodes must be non-empty");
    if (!plan.graph?.entryNodeId) issues.push("graph.entryNodeId is required");
    if (!plan.graph?.exitNodeId) issues.push("graph.exitNodeId is required");
    if (!plan.providerSelection?.primaryProviderId) {
      issues.push("providerSelection.primaryProviderId is required");
    }

    if (issues.length > 0) {
      return failure(
        new OrchestratorValidationError("Execution plan validation failed", {
          issues,
          planId: plan.planId,
        })
      );
    }

    return success(plan);
  }
}
