/**
 * Errors for the Provider Identity & Trust Platform.
 *
 * Purpose: Typed errors extending IntelligenceError.
 * Responsibilities: Provide named errors; never leak secret material.
 * Usage: Returned via Result<T> failures.
 * Future Extension: Attestation and secret-manager error mapping.
 */

import { IntelligenceError } from "../../../core/errors";

export class ProviderIdentityError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "SECURITY_ERROR", metadata, cause });
    this.name = "ProviderIdentityError";
  }
}

export class CredentialNotFoundError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "NOT_FOUND", metadata, cause });
    this.name = "CredentialNotFoundError";
  }
}

export class CredentialValidationError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "VALIDATION_ERROR", metadata, cause });
    this.name = "CredentialValidationError";
  }
}

export class ProviderAuthenticationError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "AUTHORIZATION_ERROR", metadata, cause });
    this.name = "ProviderAuthenticationError";
  }
}

export class ProviderAuthorizationError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "AUTHORIZATION_ERROR", metadata, cause });
    this.name = "ProviderAuthorizationError";
  }
}

export class ProviderTrustError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "SECURITY_ERROR", metadata, cause });
    this.name = "ProviderTrustError";
  }
}

export class CredentialSessionError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "SECURITY_ERROR", metadata, cause });
    this.name = "CredentialSessionError";
  }
}

export class SecretProviderError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "SECURITY_ERROR", metadata, cause });
    this.name = "SecretProviderError";
  }
}

export class CredentialRotationError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "SECURITY_ERROR", metadata, cause });
    this.name = "CredentialRotationError";
  }
}
