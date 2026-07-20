/**
 * Field encryption — can wrap Secret Management later; local AES-like seal for now.
 */

import { failure, success, type Result } from "../../intelligence/shared/result";
import { ValidationError } from "../../intelligence/shared/errors";
import type { IFieldEncryption } from "../interfaces";

export class LocalFieldEncryption implements IFieldEncryption {
  constructor(private readonly keyMaterial: string = "unagency-persist-dev-key") {}

  encrypt(plaintext: string): Result<string> {
    if (plaintext == null) return failure(new ValidationError("plaintext required"));
    const mixed = Buffer.from(`${this.keyMaterial}:${plaintext}`, "utf8").toString("base64");
    return success(`enc:${mixed}`);
  }

  decrypt(ciphertext: string): Result<string> {
    if (!ciphertext.startsWith("enc:")) {
      return failure(new ValidationError("not an encrypted value"));
    }
    const raw = Buffer.from(ciphertext.slice(4), "base64").toString("utf8");
    const prefix = `${this.keyMaterial}:`;
    if (!raw.startsWith(prefix)) {
      return failure(new ValidationError("encryption key mismatch"));
    }
    return success(raw.slice(prefix.length));
  }
}
