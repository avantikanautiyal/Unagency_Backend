/**
 * Credential validation contracts.
 *
 * Purpose: Immutable result of validating a credential across dimensions.
 * Responsibilities: Describe per-dimension checks and overall validity.
 * Usage: Produced by ICredentialValidator; embedded in sessions.
 * Future Extension: Additional dimensions without breaking callers.
 */

import type { CredentialId } from "./identifiers";
import type { ValidationDimension } from "./enums";

export interface CredentialValidationCheck {
  readonly dimension: ValidationDimension;
  readonly passed: boolean;
  readonly message?: string;
}

export interface CredentialValidationResult {
  readonly valid: boolean;
  readonly credentialId: CredentialId;
  readonly checks: readonly CredentialValidationCheck[];
  readonly validatedAt: string;
}
