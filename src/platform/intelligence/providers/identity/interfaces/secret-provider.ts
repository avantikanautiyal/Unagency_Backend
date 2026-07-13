/**
 * Secret provider port (vault abstraction).
 *
 * Purpose: Abstract secret storage/retrieval behind a reference.
 * Responsibilities: put/get/has/delete secret material by ref.
 * Usage: Injected into the credential store and (future) adapters.
 * Future Extension: AWS Secrets Manager, HashiCorp Vault, Azure Key Vault,
 *   Google Secret Manager, Kubernetes Secrets, Environment — NONE integrated here.
 *
 * Secret material never appears in identity contracts, snapshots, or logs.
 */

import type { Result } from "../../../shared/result";
import type { SecretProviderKind } from "../contracts/enums";

export interface SecretMaterial {
  readonly value: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ISecretProvider {
  readonly kind: SecretProviderKind;
  putSecret(ref: string, material: SecretMaterial): Promise<Result<void>>;
  getSecret(ref: string): Promise<Result<SecretMaterial>>;
  hasSecret(ref: string): Promise<Result<boolean>>;
  deleteSecret(ref: string): Promise<Result<void>>;
}
