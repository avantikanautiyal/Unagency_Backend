/**
 * Credential masking.
 *
 * Purpose: Non-reversible masking so secrets never appear in logs/snapshots.
 * Responsibilities: partial/full/audit masking + safe logging helper.
 * Usage: Injected wherever a secret could otherwise leak.
 * Future Extension: Format-preserving masking.
 */

import type { ICredentialMasker } from "../interfaces/credential-masker";

export class CredentialMasker implements ICredentialMasker {
  constructor(private readonly visibleChars: number = 4) {}

  maskPartial(secret: string): string {
    if (secret.length === 0) {
      return "";
    }
    if (secret.length <= this.visibleChars) {
      return "*".repeat(secret.length);
    }
    const visible = secret.slice(-this.visibleChars);
    return `${"*".repeat(secret.length - this.visibleChars)}${visible}`;
  }

  maskFull(secret: string): string {
    return secret.length === 0 ? "" : "*".repeat(Math.min(secret.length, 12));
  }

  maskForAudit(secret: string): string {
    if (secret.length === 0) {
      return "<empty>";
    }
    return `<masked:${secret.length}>`;
  }

  safe(value: string): string {
    return this.maskForAudit(value);
  }
}
