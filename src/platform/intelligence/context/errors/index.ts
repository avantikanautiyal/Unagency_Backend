import { IntelligenceError } from "../../shared/errors";

export class ContextError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "CONTEXT_ERROR", metadata, cause });
    this.name = "ContextError";
  }
}

export class ContextValidationError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "VALIDATION_ERROR", metadata, cause });
    this.name = "ContextValidationError";
  }
}
