/**
 * Phase 5 Task Graph Executor errors.
 */

export type TaskGraphExecutorErrorCode =
  | "PLAN_NOT_EXECUTABLE"
  | "PLAN_STATUS_REJECTED"
  | "TENANT_VIOLATION"
  | "RUN_NOT_FOUND"
  | "INVALID_TRANSITION"
  | "ALREADY_TERMINAL"
  | "CANCELLED"
  | "CLAIM_CONFLICT"
  | "CAPABILITY_UNRESOLVED"
  | "OUTPUT_CONTRACT_VIOLATION"
  | "TASK_EXECUTION_FAILED"
  | "PLAN_VERSION_MISMATCH"
  | "GOVERNANCE_DISABLED";

export class TaskGraphExecutorError extends Error {
  readonly code: TaskGraphExecutorErrorCode;

  constructor(code: TaskGraphExecutorErrorCode, message: string) {
    super(message);
    this.name = "TaskGraphExecutorError";
    this.code = code;
  }
}
