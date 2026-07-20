/**
 * Local AES-256-GCM + optional envelope encryption (local master key).
 * Cloud KMS deferred — no AWS/Azure/GCP SDKs.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";
import { failure, success, type Result } from "../../../intelligence/shared/result";
import { ValidationError } from "../../../intelligence/shared/errors";
import type { ISecretEncryptor } from "../interfaces/secrets";
import type { EncryptedBlob } from "../contracts/secret";
import { asKeyVersionId } from "../contracts/secret";
import type { EncryptionAlgorithm } from "../contracts/enums";

function deriveKey(master: string, version: string): Buffer {
  return createHash("sha256").update(`${master}:${version}`).digest();
}

export class LocalAes256Encryptor implements ISecretEncryptor {
  private readonly keyVersion: string;

  constructor(
    private readonly masterKey: string,
    private readonly algorithm: EncryptionAlgorithm = "aes-256-gcm",
    keyVersion = "v1"
  ) {
    this.keyVersion = keyVersion;
    if (!masterKey || masterKey.length < 16) {
      throw new Error("masterKey must be at least 16 characters");
    }
  }

  currentKeyVersion(): string {
    return this.keyVersion;
  }

  encrypt(plaintext: string): Result<EncryptedBlob> {
    if (!plaintext) {
      return failure(new ValidationError("plaintext required"));
    }
    try {
      const key = deriveKey(this.masterKey, this.keyVersion);
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const ciphertext = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();

      let wrappedDataKey: string | undefined;
      if (this.algorithm === "envelope_local") {
        // Local envelope: wrap a random data key with master (simulated DEK wrap)
        const dek = randomBytes(32);
        const wrapIv = randomBytes(12);
        const wrapCipher = createCipheriv("aes-256-gcm", key, wrapIv);
        const wrapped = Buffer.concat([wrapCipher.update(dek), wrapCipher.final()]);
        const wrapTag = wrapCipher.getAuthTag();
        wrappedDataKey = Buffer.concat([wrapIv, wrapTag, wrapped]).toString("base64");
      }

      return success({
        algorithm: this.algorithm,
        ciphertext: ciphertext.toString("base64"),
        iv: iv.toString("base64"),
        tag: tag.toString("base64"),
        keyVersionId: asKeyVersionId(this.keyVersion),
        wrappedDataKey,
      });
    } catch (e) {
      return failure(
        new ValidationError(`encryption failed: ${e instanceof Error ? e.message : "unknown"}`)
      );
    }
  }

  decrypt(blob: EncryptedBlob): Result<string> {
    try {
      const key = deriveKey(this.masterKey, String(blob.keyVersionId));
      const iv = Buffer.from(blob.iv, "base64");
      const tag = Buffer.from(blob.tag ?? "", "base64");
      const ciphertext = Buffer.from(blob.ciphertext, "base64");
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString("utf8");
      return success(plaintext);
    } catch (e) {
      return failure(
        new ValidationError(`decryption failed: ${e instanceof Error ? e.message : "unknown"}`)
      );
    }
  }
}
