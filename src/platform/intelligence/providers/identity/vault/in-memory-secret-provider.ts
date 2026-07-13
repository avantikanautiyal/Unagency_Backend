/**
 * In-memory secret provider (placeholder vault).
 *
 * Purpose: Store/retrieve secret material by reference — process memory only.
 * Responsibilities: put/get/has/delete; NO external secret manager integration.
 * Usage: Injected into the credential store (and future adapters).
 * Future Extension: AWS Secrets Manager, HashiCorp Vault, Azure Key Vault,
 *   Google Secret Manager, Kubernetes Secrets, Environment.
 *
 * The stored value never leaves this component except via getSecret(), which is
 * intended for future provider adapters — NOT for identity contracts or logs.
 */

import { failure, success, type Result } from "../../../shared/result";
import type { SecretProviderKind } from "../contracts/enums";
import { SecretProviderError } from "../errors";
import type {
  ISecretProvider,
  SecretMaterial,
} from "../interfaces/secret-provider";

export class InMemorySecretProvider implements ISecretProvider {
  readonly kind: SecretProviderKind = "in_memory";

  private readonly secrets = new Map<string, SecretMaterial>();

  async putSecret(
    ref: string,
    material: SecretMaterial
  ): Promise<Result<void>> {
    if (ref.length === 0) {
      return failure(new SecretProviderError("Secret ref must not be empty"));
    }
    this.secrets.set(ref, {
      value: material.value,
      metadata: material.metadata ? { ...material.metadata } : undefined,
    });
    return success(undefined);
  }

  async getSecret(ref: string): Promise<Result<SecretMaterial>> {
    const material = this.secrets.get(ref);
    if (!material) {
      return failure(
        new SecretProviderError("Secret not found", { ref })
      );
    }
    return success(material);
  }

  async hasSecret(ref: string): Promise<Result<boolean>> {
    return success(this.secrets.has(ref));
  }

  async deleteSecret(ref: string): Promise<Result<void>> {
    this.secrets.delete(ref);
    return success(undefined);
  }
}
