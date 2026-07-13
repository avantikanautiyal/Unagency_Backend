import { IntelligenceError } from "../../shared/errors";

export class ExecutionPlannerError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, {
      code: "INTELLIGENCE_ERROR",
      metadata,
      cause,
    });
    this.name = "ExecutionPlannerError";
  }
}

/** @deprecated Use ExecutionPlannerError. */
export class PlannerError extends ExecutionPlannerError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, metadata, cause);
    this.name = "PlannerError";
  }
}
