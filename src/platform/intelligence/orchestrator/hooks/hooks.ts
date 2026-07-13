/**
 * Orchestration lifecycle hooks.
 */

import type { OrchestratorContext } from "../contracts/orchestrator-context";
import type { OrchestrationResult } from "../contracts/orchestration-result";
import type { ExecutionSnapshot } from "../../execution-runtime/contracts/execution-snapshot";

export type OrchestrationHookName =
  | "beforePlanExecution"
  | "beforeDispatch"
  | "beforeRuntime"
  | "afterRuntime"
  | "afterAggregation"
  | "onFailure"
  | "onRetry"
  | "onComplete";

export interface OrchestrationHookPayload {
  readonly context: OrchestratorContext;
  readonly snapshot?: ExecutionSnapshot;
  readonly result?: OrchestrationResult;
  readonly error?: unknown;
  readonly attempt?: number;
}

export type OrchestrationHookHandler = (
  payload: OrchestrationHookPayload
) => Promise<void> | void;

export interface IHookManager {
  register(name: OrchestrationHookName, handler: OrchestrationHookHandler): void;
  emit(
    name: OrchestrationHookName,
    payload: OrchestrationHookPayload
  ): Promise<void>;
  clear(): void;
}
