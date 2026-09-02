import { IntelligenceError } from "../../core/errors";

export class ProviderRegistryError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "PROVIDER_ERROR", metadata, cause });
    this.name = "ProviderRegistryError";
  }
}

export class ProviderValidationError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "VALIDATION_ERROR", metadata, cause });
    this.name = "ProviderValidationError";
  }
}

export class ProviderNotFoundError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "NOT_FOUND", metadata, cause });
    this.name = "ProviderNotFoundError";
  }
}
