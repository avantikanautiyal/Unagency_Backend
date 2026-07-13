import { IntelligenceError } from "../../shared/errors";

export class KnowledgeError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "INTELLIGENCE_ERROR", metadata, cause });
    this.name = "KnowledgeError";
  }
}

export class KnowledgePermissionError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "AUTHORIZATION_ERROR", metadata, cause });
    this.name = "KnowledgePermissionError";
  }
}

export class KnowledgeValidationError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "VALIDATION_ERROR", metadata, cause });
    this.name = "KnowledgeValidationError";
  }
}
