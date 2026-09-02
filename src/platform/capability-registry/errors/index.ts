import { IntelligenceError } from "../../core/errors";

export class CapabilityRegistryError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "CAPABILITY_ERROR", metadata, cause });
    this.name = "CapabilityRegistryError";
  }
}

export class CapabilityValidationError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "VALIDATION_ERROR", metadata, cause });
    this.name = "CapabilityValidationError";
  }
}

export class CapabilityNotFoundError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "NOT_FOUND", metadata, cause });
    this.name = "CapabilityNotFoundError";
  }
}
