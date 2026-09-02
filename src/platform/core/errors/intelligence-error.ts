/**
 * Intelligence Platform error hierarchy.
 * Every error includes: code, message, metadata, timestamp.
 */

export type IntelligenceErrorCode =
  | "INTELLIGENCE_ERROR"
  | "VALIDATION_ERROR"
  | "AUTHORIZATION_ERROR"
  | "TIMEOUT_ERROR"
  | "RATE_LIMIT_ERROR"
  | "QUOTA_EXCEEDED_ERROR"
  | "PROVIDER_ERROR"
  | "CAPABILITY_ERROR"
  | "WORKFLOW_ERROR"
  | "CONTEXT_ERROR"
  | "EXECUTION_ERROR"
  | "CONFIGURATION_ERROR"
  | "REGISTRY_ERROR"
  | "EVENT_ERROR"
  | "SECURITY_ERROR"
  | "TELEMETRY_ERROR"
  | "KERNEL_ERROR"
  | "NOT_FOUND"
  | "NOT_IMPLEMENTED";

export interface IntelligenceErrorMetadata {
  readonly [key: string]: unknown;
}

export class IntelligenceError extends Error {
  readonly code: IntelligenceErrorCode;
  readonly metadata: IntelligenceErrorMetadata;
  readonly timestamp: string;
  readonly cause?: unknown;

  constructor(
    message: string,
    options?: {
      code?: IntelligenceErrorCode;
      metadata?: IntelligenceErrorMetadata;
      cause?: unknown;
      timestamp?: string;
    }
  ) {
    super(message);
    this.name = "IntelligenceError";
    this.code = options?.code ?? "INTELLIGENCE_ERROR";
    this.metadata = options?.metadata ?? {};
    this.timestamp = options?.timestamp ?? new Date().toISOString();
    this.cause = options?.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      metadata: this.metadata,
      timestamp: this.timestamp,
    };
  }
}

export class ValidationError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: IntelligenceErrorMetadata,
    cause?: unknown
  ) {
    super(message, { code: "VALIDATION_ERROR", metadata, cause });
    this.name = "ValidationError";
  }
}

export class AuthorizationError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: IntelligenceErrorMetadata,
    cause?: unknown
  ) {
    super(message, { code: "AUTHORIZATION_ERROR", metadata, cause });
    this.name = "AuthorizationError";
  }
}

export class TimeoutError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: IntelligenceErrorMetadata,
    cause?: unknown
  ) {
    super(message, { code: "TIMEOUT_ERROR", metadata, cause });
    this.name = "TimeoutError";
  }
}

export class RateLimitError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: IntelligenceErrorMetadata,
    cause?: unknown
  ) {
    super(message, { code: "RATE_LIMIT_ERROR", metadata, cause });
    this.name = "RateLimitError";
  }
}

export class QuotaExceededError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: IntelligenceErrorMetadata,
    cause?: unknown
  ) {
    super(message, { code: "QUOTA_EXCEEDED_ERROR", metadata, cause });
    this.name = "QuotaExceededError";
  }
}

export class ProviderError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: IntelligenceErrorMetadata,
    cause?: unknown
  ) {
    super(message, { code: "PROVIDER_ERROR", metadata, cause });
    this.name = "ProviderError";
  }
}

export class CapabilityError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: IntelligenceErrorMetadata,
    cause?: unknown
  ) {
    super(message, { code: "CAPABILITY_ERROR", metadata, cause });
    this.name = "CapabilityError";
  }
}

export class WorkflowError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: IntelligenceErrorMetadata,
    cause?: unknown
  ) {
    super(message, { code: "WORKFLOW_ERROR", metadata, cause });
    this.name = "WorkflowError";
  }
}

export class ContextError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: IntelligenceErrorMetadata,
    cause?: unknown
  ) {
    super(message, { code: "CONTEXT_ERROR", metadata, cause });
    this.name = "ContextError";
  }
}

export class ExecutionError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: IntelligenceErrorMetadata,
    cause?: unknown
  ) {
    super(message, { code: "EXECUTION_ERROR", metadata, cause });
    this.name = "ExecutionError";
  }
}

export class ConfigurationError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: IntelligenceErrorMetadata,
    cause?: unknown
  ) {
    super(message, { code: "CONFIGURATION_ERROR", metadata, cause });
    this.name = "ConfigurationError";
  }
}

export class RegistryError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: IntelligenceErrorMetadata,
    cause?: unknown
  ) {
    super(message, { code: "REGISTRY_ERROR", metadata, cause });
    this.name = "RegistryError";
  }
}

export class KernelError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: IntelligenceErrorMetadata,
    cause?: unknown
  ) {
    super(message, { code: "KERNEL_ERROR", metadata, cause });
    this.name = "KernelError";
  }
}

export class NotFoundError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: IntelligenceErrorMetadata,
    cause?: unknown
  ) {
    super(message, { code: "NOT_FOUND", metadata, cause });
    this.name = "NotFoundError";
  }
}

export class NotImplementedError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: IntelligenceErrorMetadata,
    cause?: unknown
  ) {
    super(message, { code: "NOT_IMPLEMENTED", metadata, cause });
    this.name = "NotImplementedError";
  }
}
