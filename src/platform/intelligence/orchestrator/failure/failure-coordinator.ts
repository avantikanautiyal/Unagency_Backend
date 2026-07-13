/**
 * Failure coordinator.
 *
 * Purpose: Placeholder strategies for failure handling (no retry execution yet).
 * Responsibilities: Record failure decisions for retry/fallback/cancel/timeout/rollback.
 * Usage: Invoked on orchestration failure paths.
 * Future Extension: Real retry/fallback execution via runtime.
 */

import type { ExecutionPlan } from "../../execution-planning/contracts/execution-plan";
import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { OrchestratorContext } from "../contracts/orchestrator-context";

export type FailureAction =
  | "none"
  | "retry"
  | "fallback"
  | "cancel"
  | "timeout"
  | "rollback";

export interface FailureDecision {
  readonly action: FailureAction;
  readonly reason: string;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly fallbackProviderId?: string;
  readonly shouldPropagateCancellation: boolean;
  readonly shouldPropagateTimeout: boolean;
  readonly rollbackHookIds: readonly string[];
}

export interface FailureInput {
  readonly context: OrchestratorContext;
  readonly plan: ExecutionPlan;
  readonly error: unknown;
  readonly attempt: number;
}

export interface IFailureCoordinator {
  coordinate(input: FailureInput): Result<FailureDecision>;
}

/**
 * Placeholder coordinator — records intent only, does not execute retries.
 */
export class FailureCoordinator implements IFailureCoordinator {
  coordinate(input: FailureInput): Result<FailureDecision> {
    const maxAttempts = input.plan.retry.maxAttempts;
    const canRetry = input.attempt < maxAttempts;

    const fallbackProviderId =
      input.plan.providerSelection.fallbackProviderIds[0] !== undefined
        ? String(input.plan.providerSelection.fallbackProviderIds[0])
        : undefined;

    let action: FailureAction = "none";
    let reason = "no_recovery";

    if (canRetry) {
      action = "retry";
      reason = "retry_available_placeholder";
    } else if (fallbackProviderId) {
      action = "fallback";
      reason = "fallback_available_placeholder";
    }

    return success({
      action,
      reason,
      attempt: input.attempt,
      maxAttempts,
      fallbackProviderId,
      shouldPropagateCancellation: true,
      shouldPropagateTimeout: true,
      rollbackHookIds: ["onFailure"],
    });
  }
}
