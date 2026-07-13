/**
 * Identity platform enumerations.
 *
 * Purpose: Canonical enums for schemes, tenancy, permissions, trust, and status.
 * Responsibilities: Provide closed unions consumed across the platform.
 * Usage: Referenced by contracts and engines.
 * Future Extension: Additional schemes/levels without breaking callers.
 */

export type AuthenticationScheme =
  | "api_key"
  | "oauth2"
  | "bearer_token"
  | "jwt"
  | "service_account"
  | "client_credentials"
  | "anonymous";

export type TenancyLevel =
  | "platform"
  | "organization"
  | "workspace"
  | "project"
  | "user";

export type ProviderPermission =
  | "read"
  | "execute"
  | "manage"
  | "rotate"
  | "delete"
  | "delegate"
  | "audit";

/**
 * Ordered from least to most trusted. Comparison helpers rely on this order.
 */
export type ProviderTrustLevel =
  | "untrusted"
  | "low"
  | "standard"
  | "high"
  | "verified";

export const TRUST_LEVEL_ORDER: readonly ProviderTrustLevel[] = [
  "untrusted",
  "low",
  "standard",
  "high",
  "verified",
];

export function trustLevelRank(level: ProviderTrustLevel): number {
  return TRUST_LEVEL_ORDER.indexOf(level);
}

export function meetsTrustLevel(
  actual: ProviderTrustLevel,
  required: ProviderTrustLevel
): boolean {
  return trustLevelRank(actual) >= trustLevelRank(required);
}

export type CredentialStatus = "active" | "expired" | "revoked" | "rotating";

export type CredentialSessionStatus =
  | "active"
  | "renewed"
  | "expired"
  | "released"
  | "invalidated";

/**
 * Rotation reasons/strategies (rotation logic only — no secret manager calls).
 */
export type RotationReason =
  | "scheduled"
  | "manual"
  | "forced"
  | "expired"
  | "revoked";

export type ValidationDimension =
  | "identity"
  | "scope"
  | "region"
  | "policy"
  | "expiration"
  | "trust"
  | "permission";

export type SecretProviderKind =
  | "in_memory"
  | "aws_secrets_manager"
  | "hashicorp_vault"
  | "azure_key_vault"
  | "google_secret_manager"
  | "kubernetes_secrets"
  | "environment";

export type CredentialAuditEventType =
  | "credential_created"
  | "credential_rotated"
  | "credential_revoked"
  | "credential_used"
  | "credential_expired"
  | "credential_validated";
