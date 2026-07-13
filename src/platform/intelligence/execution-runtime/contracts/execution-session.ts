/**
 * Execution session model.
 */

import type { ExecutionPlan } from "../../execution-planning/contracts/execution-plan";
import type { CancellationToken } from "./cancellation-token";
import type { ExecutionLifecyclePhase } from "./execution-lifecycle";
import type { ExecutionMetrics } from "./execution-metrics";
import type { ExecutionResult } from "./execution-result";
import type { ExecutionRuntimeContext } from "./execution-runtime-context";
import type { ExecutionSnapshot } from "./execution-snapshot";
import type { ExecutionState } from "./execution-state";

export interface ExecutionSessionRecord {
  readonly sessionId: string;
  readonly context: ExecutionRuntimeContext;
  readonly plan: ExecutionPlan;
  readonly state: ExecutionState;
  readonly lifecyclePhase: ExecutionLifecyclePhase;
  readonly metrics: ExecutionMetrics;
  readonly cancellation: CancellationToken;
  readonly result?: ExecutionResult;
  readonly currentNodeId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface IExecutionSession {
  readonly sessionId: string;
  readonly context: ExecutionRuntimeContext;
  readonly plan: ExecutionPlan;
  readonly state: ExecutionState;
  readonly metrics: ExecutionMetrics;
  readonly cancellation: CancellationToken;

  start(): Promise<void>;
  /** Placeholder walk of plan nodes (no provider calls). */
  runToCompletion(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  cancel(reason?: string): Promise<void>;
  fail(message: string, errorCode?: string): Promise<void>;
  complete(output?: Readonly<Record<string, unknown>>): Promise<void>;
  snapshot(): ExecutionSnapshot;
}
