import { IntelligenceError } from "../../shared/errors";

export class MemoryError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "INTELLIGENCE_ERROR", metadata, cause });
    this.name = "MemoryError";
  }
}

export class MemoryValidationError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "VALIDATION_ERROR", metadata, cause });
    this.name = "MemoryValidationError";
  }
}

export class MemoryNotFoundError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "NOT_FOUND", metadata, cause });
    this.name = "MemoryNotFoundError";
  }
}
