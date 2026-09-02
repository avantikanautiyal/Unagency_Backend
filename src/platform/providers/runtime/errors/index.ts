/**
 * Provider Runtime errors.
 *
 * Purpose: Typed errors for the provider execution runtime.
 * Responsibilities: Extend IntelligenceError with runtime-specific names.
 * Usage: Returned via Result<T> failures; never thrown for expected flow.
 * Future Extension: Provider-specific error mapping in adapters (M4.2+).
 */

import { IntelligenceError } from "../../../core/errors";

export class ProviderRuntimeError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "EXECUTION_ERROR", metadata, cause });
    this.name = "ProviderRuntimeError";
  }
}

export class ProviderSessionNotFoundError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "NOT_FOUND", metadata, cause });
    this.name = "ProviderSessionNotFoundError";
  }
}

export class ProviderExecutionStatusError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "VALIDATION_ERROR", metadata, cause });
    this.name = "ProviderExecutionStatusError";
  }
}

export class ProviderExecutionTimeoutError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "TIMEOUT_ERROR", metadata, cause });
    this.name = "ProviderExecutionTimeoutError";
  }
}

export class ProviderExecutionCancelledError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "EXECUTION_ERROR", metadata, cause });
    this.name = "ProviderExecutionCancelledError";
  }
}

export class CircuitOpenError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "PROVIDER_ERROR", metadata, cause });
    this.name = "CircuitOpenError";
  }
}

export class ConcurrencyLimitError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "RATE_LIMIT_ERROR", metadata, cause });
    this.name = "ConcurrencyLimitError";
  }
}

export class ProviderRequestValidationError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "VALIDATION_ERROR", metadata, cause });
    this.name = "ProviderRequestValidationError";
  }
}
