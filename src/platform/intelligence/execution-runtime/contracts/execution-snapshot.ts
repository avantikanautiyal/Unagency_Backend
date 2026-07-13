/**
 * Immutable execution snapshot.
 */

import type { ExecutionPlan } from "../../execution-planning/contracts/execution-plan";
import type { ExecutionMetrics } from "./execution-metrics";
import type { ExecutionResult } from "./execution-result";
import type { ExecutionState } from "./execution-state";
import type { ExecutionRuntimeContext } from "./execution-runtime-context";

export interface ExecutionSnapshot {
  readonly sessionId: string;
  readonly state: ExecutionState;
  readonly context: ExecutionRuntimeContext;
  readonly plan: ExecutionPlan;
  readonly metrics: ExecutionMetrics;
  readonly result?: ExecutionResult;
  readonly currentNodeId?: string;
  readonly capturedAt: string;
}
