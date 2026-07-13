/**
 * Credential store port.
 *
 * Purpose: Manage credential lifecycle (in-memory only — no database).
 * Responsibilities: register/resolve/revoke/rotate/list credentials.
 * Usage: Injected into the identity engine and rotation engine.
 * Future Extension: Durable stores; secret material stays behind ISecretProvider.
 */

import type { Result } from "../../../shared/result";
import type { ProviderCredential } from "../contracts/credential";
import type { RotationReason } from "../contracts/enums";
import type { CredentialId } from "../contracts/identifiers";
import type {
  CredentialFilter,
  RegisterCredentialInput,
} from "../contracts/requests";

export interface RotateCredentialInput {
  readonly reason: RotationReason;
  /** New raw secret (optional). Consumed by ISecretProvider, never retained. */
  readonly newSecret?: string;
  readonly expiresAt?: string;
}

export interface ICredentialStore {
  registerCredential(
    input: RegisterCredentialInput
  ): Promise<Result<ProviderCredential>>;
  resolveCredential(credentialId: CredentialId): Result<ProviderCredential>;
  revokeCredential(credentialId: CredentialId): Result<ProviderCredential>;
  rotateCredential(
    credentialId: CredentialId,
    input: RotateCredentialInput
  ): Promise<Result<ProviderCredential>>;
  listCredentials(filter?: CredentialFilter): readonly ProviderCredential[];
}
