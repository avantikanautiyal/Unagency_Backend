/**
 * Credential masking port.
 *
 * Purpose: Produce safe, non-reversible representations of secrets.
 * Responsibilities: partial/full/audit masking and safe logging.
 * Usage: Used wherever a secret might otherwise be surfaced.
 * Future Extension: Format-preserving masking.
 *
 * Secrets must NEVER appear unmasked in logs, snapshots, or errors.
 */

export interface ICredentialMasker {
  maskPartial(secret: string): string;
  maskFull(secret: string): string;
  maskForAudit(secret: string): string;
  /** Safe representation for logging arbitrary values. */
  safe(value: string): string;
}
