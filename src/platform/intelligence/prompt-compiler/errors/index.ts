import { IntelligenceError } from "../../shared/errors";

export class PromptCompilerError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "INTELLIGENCE_ERROR", metadata, cause });
    this.name = "PromptCompilerError";
  }
}

export class PromptValidationError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "VALIDATION_ERROR", metadata, cause });
    this.name = "PromptValidationError";
  }
}

export class PromptTemplateNotFoundError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "NOT_FOUND", metadata, cause });
    this.name = "PromptTemplateNotFoundError";
  }
}
