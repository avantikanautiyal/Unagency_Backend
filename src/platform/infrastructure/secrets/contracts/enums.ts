/**
 * Secret Management enumerations.
 */

export type SecretProviderKind =
  | "local"
  | "environment"
  | "aws_secrets_manager"
  | "azure_key_vault"
  | "google_secret_manager"
  | "hashicorp_vault"
  | "kubernetes_secrets";

export type SecretType =
  | "ai_provider_key"
  | "database_credential"
  | "jwt_secret"
  | "oauth_credential"
  | "smtp_credential"
  | "webhook_secret"
  | "encryption_key"
  | "signing_key"
  | "storage_credential"
  | "third_party_api_key"
  | "certificate"
  | "tenant_secret";

export type SecretLifecycleState =
  | "created"
  | "validated"
  | "active"
  | "rotating"
  | "expired"
  | "revoked"
  | "deleted"
  | "archived";

export type LeaseState = "active" | "renewed" | "expired" | "revoked";

export type EncryptionAlgorithm = "aes-256-gcm" | "envelope_local";

export type AuditAction =
  | "store"
  | "get"
  | "update"
  | "delete"
  | "rotate"
  | "lease"
  | "renew_lease"
  | "revoke_lease"
  | "validate"
  | "mask"
  | "list"
  | "health"
  | "reveal";

export type AuditOutcome = "success" | "failure" | "denied";
