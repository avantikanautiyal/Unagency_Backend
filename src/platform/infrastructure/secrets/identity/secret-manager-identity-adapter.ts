/**
 * Additive bridge: Secret Manager → Identity ISecretProvider.
 * Does not modify Provider Identity — inject via createIdentityPlatform({ secretProvider }).
 */

import { failure, success, type Result } from "../../../intelligence/shared/result";
import { ValidationError } from "../../../intelligence/shared/errors";
import type {
  ISecretProvider,
  SecretMaterial,
} from "../../../intelligence/providers/identity/interfaces/secret-provider";
import type { SecretProviderKind as IdentitySecretProviderKind } from "../../../intelligence/providers/identity/contracts/enums";
import type { ISecretManager } from "../interfaces/secrets";
import type { SecretRecord } from "../contracts/secret";
import { asSecretId } from "../contracts/secret";
import type { SecretProviderKind } from "../contracts/enums";

const KIND_MAP: Record<SecretProviderKind, IdentitySecretProviderKind> = {
  local: "in_memory",
  environment: "environment",
  aws_secrets_manager: "aws_secrets_manager",
  azure_key_vault: "azure_key_vault",
  google_secret_manager: "google_secret_manager",
  hashicorp_vault: "hashicorp_vault",
  kubernetes_secrets: "kubernetes_secrets",
};

/**
 * Adapts ISecretManager to Identity's ISecretProvider.
 * Maps Identity refs ↔ Secret Manager records (by ref / name / label).
 */
export class SecretManagerIdentityAdapter implements ISecretProvider {
  readonly kind: IdentitySecretProviderKind;
  private readonly byRef = new Map<string, string>();

  constructor(
    private readonly manager: ISecretManager,
    providerKind: SecretProviderKind = "local"
  ) {
    this.kind = KIND_MAP[providerKind];
  }

  async putSecret(ref: string, material: SecretMaterial): Promise<Result<void>> {
    const existingId = this.byRef.get(ref);
    if (existingId) {
      const updated = await this.manager.updateSecret({
        secretId: asSecretId(existingId),
        value: material.value,
        reason: "identity_put",
      });
      if (!updated.ok) return updated;
      return success(undefined);
    }

    const labels: Record<string, string> = { identityRef: ref };
    if (material.metadata) {
      for (const [k, v] of Object.entries(material.metadata)) {
        if (typeof v === "string") labels[k] = v;
      }
    }

    const stored = await this.manager.storeSecret({
      name: ref,
      type: "ai_provider_key",
      value: material.value,
      labels,
      reason: "identity_put",
    });
    if (!stored.ok) return stored;

    this.byRef.set(ref, String(stored.value.secretId));
    this.byRef.set(String(stored.value.ref), String(stored.value.secretId));
    await this.manager.validateSecret(stored.value.secretId);
    return success(undefined);
  }

  async getSecret(ref: string): Promise<Result<SecretMaterial>> {
    const secretId = await this.resolveSecretId(ref);
    if (!secretId) {
      return failure(new ValidationError(`secret ref not found: ${ref}`));
    }

    const lease = await this.manager.leaseSecret({
      secretId: asSecretId(secretId),
      ttlMs: 30_000,
      purpose: "identity_get",
      actor: "provider-identity",
    });
    if (!lease.ok) return lease;

    const revealed = await this.manager.revealLeasedSecret(lease.value.leaseId);
    if (!revealed.ok) return revealed;

    await this.manager.revokeLease(lease.value.leaseId);
    return success({ value: revealed.value.value });
  }

  async hasSecret(ref: string): Promise<Result<boolean>> {
    const secretId = await this.resolveSecretId(ref);
    return success(Boolean(secretId));
  }

  async deleteSecret(ref: string): Promise<Result<void>> {
    const secretId = await this.resolveSecretId(ref);
    if (!secretId) return success(undefined);
    const del = await this.manager.deleteSecret(asSecretId(secretId));
    if (!del.ok) return del;
    this.byRef.delete(ref);
    return success(undefined);
  }

  private async resolveSecretId(ref: string): Promise<string | undefined> {
    if (this.byRef.has(ref)) return this.byRef.get(ref);

    const listed = await this.manager.listSecrets({});
    if (!listed.ok) return undefined;
    const match = listed.value.find(
      (r: SecretRecord) =>
        String(r.ref) === ref ||
        r.name === ref ||
        r.labels.identityRef === ref
    );
    if (match) {
      this.byRef.set(ref, String(match.secretId));
      return String(match.secretId);
    }
    return undefined;
  }
}

export function asIdentitySecretProvider(
  manager: ISecretManager,
  kind: SecretProviderKind = "local"
): ISecretProvider {
  return new SecretManagerIdentityAdapter(manager, kind);
}
