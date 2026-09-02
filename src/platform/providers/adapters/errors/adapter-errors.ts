/**
 * Adapter platform module errors.
 *
 * Purpose: Typed errors extending IntelligenceError for Result<T> failures.
 * Responsibilities: Represent framework faults (not provider errors).
 * Usage: Returned via failure(); provider errors use canonical ProviderError.
 * Future Extension: Per-subsystem error codes.
 */

import { IntelligenceError } from "../../../core/errors";

export class AdapterError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "PROVIDER_ERROR", metadata, cause });
    this.name = "AdapterError";
  }
}

export class AdapterNotFoundError extends IntelligenceError {
  constructor(message: string, metadata?: Readonly<Record<string, unknown>>) {
    super(message, { code: "NOT_FOUND", metadata });
    this.name = "AdapterNotFoundError";
  }
}

export class AdapterRegistrationError extends IntelligenceError {
  constructor(message: string, metadata?: Readonly<Record<string, unknown>>) {
    super(message, { code: "REGISTRY_ERROR", metadata });
    this.name = "AdapterRegistrationError";
  }
}

export class ManifestValidationError extends IntelligenceError {
  constructor(message: string, metadata?: Readonly<Record<string, unknown>>) {
    super(message, { code: "VALIDATION_ERROR", metadata });
    this.name = "ManifestValidationError";
  }
}

export class AdapterLifecycleError extends IntelligenceError {
  constructor(message: string, metadata?: Readonly<Record<string, unknown>>) {
    super(message, { code: "PROVIDER_ERROR", metadata });
    this.name = "AdapterLifecycleError";
  }
}
