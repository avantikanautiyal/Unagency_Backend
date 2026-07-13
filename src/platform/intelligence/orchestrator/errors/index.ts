import { IntelligenceError } from "../../shared/errors";

export class OrchestratorError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "EXECUTION_ERROR", metadata, cause });
    this.name = "OrchestratorError";
  }
}

export class OrchestratorValidationError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "VALIDATION_ERROR", metadata, cause });
    this.name = "OrchestratorValidationError";
  }
}
