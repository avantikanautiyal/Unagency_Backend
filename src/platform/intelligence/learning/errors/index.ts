import { IntelligenceError } from "../../shared/errors";

export class LearningError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "INTELLIGENCE_ERROR", metadata, cause });
    this.name = "LearningError";
  }
}

export class LearningValidationError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "VALIDATION_ERROR", metadata, cause });
    this.name = "LearningValidationError";
  }
}
