/**
 * Orchestrator context for a single plan coordination run.
 */

import type { ExecutionPlan } from "../../execution-planning/contracts/execution-plan";
import type { ExecutionRuntimeContext } from "../../execution-runtime/contracts/execution-runtime-context";

export interface OrchestratorContext {
  readonly orchestrationId: string;
  readonly plan: ExecutionPlan;
  readonly runtimeContext: ExecutionRuntimeContext;
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly startedAt: string;
}
