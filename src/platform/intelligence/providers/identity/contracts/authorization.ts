/**
 * Authentication, authorization, and trust result contracts.
 *
 * Purpose: Immutable decision outputs (no secret material).
 * Responsibilities: Describe authn/authz/trust outcomes with reasons.
 * Usage: Produced by the respective engines; embedded in sessions.
 * Future Extension: Attestation evidence on trust evaluations.
 */

import type { ProviderId } from "../../../shared/identifiers";
import type { CredentialId } from "./identifiers";
import type {
  AuthenticationScheme,
  ProviderPermission,
  ProviderTrustLevel,
  ValidationDimension,
} from "./enums";
import type { ProviderScope } from "./provider-scope";

export interface ProviderAuthenticationResult {
  readonly authenticated: boolean;
  readonly scheme: AuthenticationScheme;
  readonly credentialId: CredentialId;
  readonly providerId: ProviderId;
  readonly reasons: readonly string[];
}

export interface ProviderAuthorization {
  readonly authorized: boolean;
  readonly providerId: ProviderId;
  readonly scope: ProviderScope;
  readonly grantedPermissions: readonly ProviderPermission[];
  readonly deniedPermissions: readonly ProviderPermission[];
  readonly reasons: readonly string[];
}

export interface TrustCheck {
  readonly dimension: ValidationDimension;
  readonly passed: boolean;
  readonly message?: string;
}

export interface TrustEvaluation {
  readonly trusted: boolean;
  readonly providerId: ProviderId;
  readonly credentialId: CredentialId;
  readonly trustLevel: ProviderTrustLevel;
  readonly checks: readonly TrustCheck[];
  readonly evaluatedAt: string;
}
