import { IntelligenceError } from "../../shared/errors";

export class EvaluationError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "INTELLIGENCE_ERROR", metadata, cause });
    this.name = "EvaluationError";
  }
}

export class EvaluationValidationError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "VALIDATION_ERROR", metadata, cause });
    this.name = "EvaluationValidationError";
  }
}

export class EvaluationNotFoundError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "NOT_FOUND", metadata, cause });
    this.name = "EvaluationNotFoundError";
  }
}
