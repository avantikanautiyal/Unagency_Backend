import { IntelligenceError } from "../../shared/errors";

export class ExecutionRuntimeError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "EXECUTION_ERROR", metadata, cause });
    this.name = "ExecutionRuntimeError";
  }
}

export class ExecutionStateTransitionError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "VALIDATION_ERROR", metadata, cause });
    this.name = "ExecutionStateTransitionError";
  }
}

export class ExecutionNotFoundError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "NOT_FOUND", metadata, cause });
    this.name = "ExecutionNotFoundError";
  }
}
