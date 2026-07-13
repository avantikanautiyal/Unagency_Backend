/**
 * Execution runtime port.
 *
 * Purpose: Manage execution sessions for approved ExecutionPlans.
 * Responsibilities: create, execute (placeholder), monitor, cancel, pause, resume, get, dispose.
 * Usage: Future orchestrator/gateway; does not call providers.
 * Future Extension: Worker pools, durable resume.
 */

import type { Result } from "../../shared/result";
import type { ExecutionPlan } from "../../execution-planning/contracts/execution-plan";
import type { ExecutionRuntimeContext } from "../contracts/execution-runtime-context";
import type { ExecutionSnapshot } from "../contracts/execution-snapshot";
import type { IExecutionSession } from "../contracts/execution-session";
import type { ExecutionMetrics } from "../contracts/execution-metrics";

export interface CreateSessionInput {
  readonly context: ExecutionRuntimeContext;
  readonly plan: ExecutionPlan;
}

export interface IExecutionRuntime {
  createSession(input: CreateSessionInput): Promise<Result<IExecutionSession>>;
  executePlan(input: CreateSessionInput): Promise<Result<IExecutionSession>>;
  monitorExecution(sessionId: string): Promise<Result<ExecutionMetrics>>;
  cancelExecution(sessionId: string, reason?: string): Promise<Result<void>>;
  pauseExecution(sessionId: string): Promise<Result<void>>;
  resumeExecution(sessionId: string): Promise<Result<void>>;
  getExecution(sessionId: string): Promise<Result<ExecutionSnapshot>>;
  dispose(): Promise<void>;
}
