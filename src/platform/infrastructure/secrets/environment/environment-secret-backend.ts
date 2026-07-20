/**
 * Environment variable secret backend.
 * Reads/writes encrypted blobs mapped to env keys (in-process overlay for tests).
 */

import { failure, success, type Result } from "../../../intelligence/shared/result";
import { ValidationError } from "../../../intelligence/shared/errors";
import type { ISecretBackend } from "../interfaces/secrets";
import type { EncryptedBlob, SecretRef } from "../contracts/secret";
import type { EncryptionAlgorithm } from "../contracts/enums";
import { asKeyVersionId } from "../contracts/secret";

function envKey(ref: SecretRef): string {
  return `UNAGENCY_SECRET_${String(ref)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")}`;
}

/**
 * Environment backend stores JSON-serialized EncryptedBlob in process.env overlay.
 * Plain env fallback: if UNAGENCY_SECRET_* missing, may read raw ENV for bootstrapping
 * only when allowPlainEnvRead is true (local/dev).
 */
export class EnvironmentSecretBackend implements ISecretBackend {
  readonly kind = "environment" as const;
  private readonly overlay = new Map<string, string>();

  constructor(
    private readonly allowPlainEnvRead = true,
    private readonly env: NodeJS.ProcessEnv = process.env
  ) {}

  async put(ref: SecretRef, blob: EncryptedBlob): Promise<Result<void>> {
    const key = envKey(ref);
    this.overlay.set(key, JSON.stringify(blob));
    return success(undefined);
  }

  async get(ref: SecretRef): Promise<Result<EncryptedBlob>> {
    const key = envKey(ref);
    const raw = this.overlay.get(key) ?? this.env[key];
    if (raw) {
      try {
        return success(JSON.parse(raw) as EncryptedBlob);
      } catch {
        // treat as plaintext bootstrapped env value packaged as local blob shell
        if (this.allowPlainEnvRead) {
          return success({
            algorithm: "aes-256-gcm" as EncryptionAlgorithm,
            ciphertext: Buffer.from(raw, "utf8").toString("base64"),
            iv: Buffer.alloc(12).toString("base64"),
            tag: Buffer.alloc(16).toString("base64"),
            keyVersionId: asKeyVersionId("env-plain"),
          });
        }
        return failure(new ValidationError("invalid encrypted env secret"));
      }
    }

    // Direct named env fallback (e.g. OPENAI_API_KEY) when ref matches
    if (this.allowPlainEnvRead && this.env[String(ref)]) {
      const plain = this.env[String(ref)]!;
      return success({
        algorithm: "aes-256-gcm",
        ciphertext: Buffer.from(plain, "utf8").toString("base64"),
        iv: Buffer.alloc(12).toString("base64"),
        tag: Buffer.alloc(16).toString("base64"),
        keyVersionId: asKeyVersionId("env-plain"),
      });
    }

    return failure(new ValidationError(`environment secret not found: ${ref}`));
  }

  async delete(ref: SecretRef): Promise<Result<void>> {
    this.overlay.delete(envKey(ref));
    return success(undefined);
  }

  async exists(ref: SecretRef): Promise<Result<boolean>> {
    const key = envKey(ref);
    return success(Boolean(this.overlay.get(key) ?? this.env[key] ?? this.env[String(ref)]));
  }

  async health(): Promise<Result<{ healthy: boolean; detail?: string }>> {
    return success({
      healthy: true,
      detail: `environment overlay=${this.overlay.size}`,
    });
  }
}
