/**
 * Placeholder cloud / external backends — production-ready interfaces, no SDKs.
 */

import { failure, type Result } from "../../../intelligence/shared/result";
import { ValidationError } from "../../../intelligence/shared/errors";
import type { ISecretBackend } from "../interfaces/secrets";
import type { EncryptedBlob, SecretRef } from "../contracts/secret";
import type { SecretProviderKind } from "../contracts/enums";

abstract class PlaceholderSecretBackend implements ISecretBackend {
  abstract readonly kind: SecretProviderKind;

  protected notImplemented(op: string): Result<never> {
    return failure(
      new ValidationError(
        `${this.kind} backend is a placeholder — ${op} requires cloud SDK integration (deferred)`
      )
    );
  }

  async put(_ref: SecretRef, _blob: EncryptedBlob): Promise<Result<void>> {
    return this.notImplemented("put");
  }

  async get(_ref: SecretRef): Promise<Result<EncryptedBlob>> {
    return this.notImplemented("get");
  }

  async delete(_ref: SecretRef): Promise<Result<void>> {
    return this.notImplemented("delete");
  }

  async exists(_ref: SecretRef): Promise<Result<boolean>> {
    return this.notImplemented("exists");
  }

  async health(): Promise<Result<{ healthy: boolean; detail?: string }>> {
    return failure(
      new ValidationError(`${this.kind} not configured (placeholder)`)
    );
  }
}

export class AwsSecretsManagerBackend extends PlaceholderSecretBackend {
  readonly kind = "aws_secrets_manager" as const;
}

export class AzureKeyVaultBackend extends PlaceholderSecretBackend {
  readonly kind = "azure_key_vault" as const;
}

export class GcpSecretManagerBackend extends PlaceholderSecretBackend {
  readonly kind = "google_secret_manager" as const;
}

export class HashicorpVaultBackend extends PlaceholderSecretBackend {
  readonly kind = "hashicorp_vault" as const;
}

export class KubernetesSecretsBackend extends PlaceholderSecretBackend {
  readonly kind = "kubernetes_secrets" as const;
}
