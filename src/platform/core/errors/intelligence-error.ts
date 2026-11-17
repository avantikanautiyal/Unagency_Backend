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

