/**
 * Local development secret backend — encrypted blobs in process memory.
 */

import { failure, success, type Result } from "../../../intelligence/shared/result";
import { ValidationError } from "../../../intelligence/shared/errors";
import type { ISecretBackend } from "../interfaces/secrets";
import type { EncryptedBlob, SecretRef } from "../contracts/secret";

export class LocalSecretBackend implements ISecretBackend {
  readonly kind = "local" as const;
  private readonly store = new Map<string, EncryptedBlob>();

  async put(ref: SecretRef, blob: EncryptedBlob): Promise<Result<void>> {
    if (!ref) return failure(new ValidationError("ref required"));
    this.store.set(String(ref), blob);
    return success(undefined);
  }

  async get(ref: SecretRef): Promise<Result<EncryptedBlob>> {
    const blob = this.store.get(String(ref));
    if (!blob) return failure(new ValidationError(`secret ref not found: ${ref}`));
    return success(blob);
  }

  async delete(ref: SecretRef): Promise<Result<void>> {
    this.store.delete(String(ref));
    return success(undefined);
  }

  async exists(ref: SecretRef): Promise<Result<boolean>> {
    return success(this.store.has(String(ref)));
  }

  async health(): Promise<Result<{ healthy: boolean; detail?: string }>> {
    return success({ healthy: true, detail: `local entries=${this.store.size}` });
  }
}
