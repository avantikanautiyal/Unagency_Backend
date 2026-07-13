/**
 * Execution dispatcher.
 *
 * Purpose: Dispatch an approved plan to the execution runtime via interfaces.
 * Responsibilities: Validate target, invoke IExecutionRuntime.executePlan.
 * Usage: Called by orchestrator pipeline; never hardcodes providers.
 * Future Extension: Multi-target dispatch, fan-out.
 */

import type { ExecutionPlan } from "../../execution-planning/contracts/execution-plan";
import type { ExecutionRuntimeContext } from "../../execution-runtime/contracts/execution-runtime-context";
import type { IExecutionSession } from "../../execution-runtime/contracts/execution-session";
import type { IExecutionRuntime } from "../../execution-runtime/interfaces/execution-runtime";
import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import { OrchestratorValidationError } from "../errors";

export interface DispatchTarget {
  readonly plan: ExecutionPlan;
  readonly runtimeContext: ExecutionRuntimeContext;
}

export interface IExecutionDispatcher {
  dispatch(target: DispatchTarget): Promise<Result<IExecutionSession>>;
}

export class ExecutionDispatcher implements IExecutionDispatcher {
  constructor(private readonly runtime: IExecutionRuntime) {}

  async dispatch(target: DispatchTarget): Promise<Result<IExecutionSession>> {
    if (!target.plan.planId || !target.plan.graph?.nodes?.length) {
      return failure(
        new OrchestratorValidationError("Cannot dispatch invalid plan", {
          planId: target.plan.planId,
        })
      );
    }

    if (!target.runtimeContext.executionId) {
      return failure(
        new OrchestratorValidationError("runtimeContext.executionId is required")
      );
    }

    return this.runtime.executePlan({
      context: target.runtimeContext,
      plan: target.plan,
    });
  }
}
