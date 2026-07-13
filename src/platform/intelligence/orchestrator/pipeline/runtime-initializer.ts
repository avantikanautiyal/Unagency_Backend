/**
 * Prepares runtime context for dispatch.
 */

import type { ExecutionPlan } from "../../execution-planning/contracts/execution-plan";
import type { ExecutionRuntimeContext } from "../../execution-runtime/contracts/execution-runtime-context";
import { asExecutionId } from "../../shared/identifiers";
import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { OrchestratorContext } from "../contracts/orchestrator-context";

export interface IRuntimeInitializer {
  initialize(
    context: OrchestratorContext
  ): Result<{
    plan: ExecutionPlan;
    runtimeContext: ExecutionRuntimeContext;
  }>;
}

export class RuntimeInitializer implements IRuntimeInitializer {
  initialize(
    context: OrchestratorContext
  ): Result<{
    plan: ExecutionPlan;
    runtimeContext: ExecutionRuntimeContext;
  }> {
    const runtimeContext: ExecutionRuntimeContext = {
      ...context.runtimeContext,
      executionId:
        context.runtimeContext.executionId ||
        asExecutionId(context.orchestrationId),
      attributes: {
        ...(context.runtimeContext.attributes ?? {}),
        orchestrationId: context.orchestrationId,
        planId: context.plan.planId,
      },
    };

    return success({
      plan: context.plan,
      runtimeContext,
    });
  }
}
