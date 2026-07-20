/**
 * Secret Management interfaces.
 */

import type { Result } from "../../../intelligence/shared/result";
import type { SecretAuditEvent } from "../contracts/audit";
import type {
  LeaseSecretInput,
  ProtectedSecretValue,
  RotateSecretInput,
  SecretFilter,
  SecretHealthReport,
  SecretLease,
  SecretRecord,
  StoreSecretInput,
  UpdateSecretInput,
  SecretId,
  SecretRef,
  LeaseId,
} from "../contracts/secret";
import type { EncryptedBlob } from "../contracts/secret";
import type { SecretProviderKind } from "../contracts/enums";

export interface ISecretManager {
  storeSecret(input: StoreSecretInput): Promise<Result<SecretRecord>>;
  getSecret(secretId: SecretId): Promise<Result<ProtectedSecretValue>>;
  updateSecret(input: UpdateSecretInput): Promise<Result<SecretRecord>>;
  deleteSecret(secretId: SecretId): Promise<Result<void>>;
  rotateSecret(input: RotateSecretInput): Promise<Result<SecretRecord>>;
  leaseSecret(input: LeaseSecretInput): Promise<Result<SecretLease>>;
  renewLease(leaseId: LeaseId, ttlMs: number): Promise<Result<SecretLease>>;
  revokeLease(leaseId: LeaseId): Promise<Result<SecretLease>>;
  /**
   * Reveal plaintext only under a valid active lease — trusted consumers only
   * (e.g. Identity adapter). Never write plaintext to logs/audit.
   */
  revealLeasedSecret(leaseId: LeaseId): Promise<Result<{ value: string; lease: SecretLease }>>;
  validateSecret(secretId: SecretId): Promise<Result<SecretRecord>>;
  maskSecret(value: string): Result<string>;
  auditSecret(secretId?: SecretId): Result<readonly SecretAuditEvent[]>;
  listSecrets(filter?: SecretFilter): Promise<Result<readonly SecretRecord[]>>;
  health(): Promise<Result<SecretHealthReport>>;
}

export interface ISecretBackend {
  readonly kind: SecretProviderKind;
  put(ref: SecretRef, blob: EncryptedBlob): Promise<Result<void>>;
  get(ref: SecretRef): Promise<Result<EncryptedBlob>>;
  delete(ref: SecretRef): Promise<Result<void>>;
  exists(ref: SecretRef): Promise<Result<boolean>>;
  health(): Promise<Result<{ healthy: boolean; detail?: string }>>;
}

export interface ISecretEncryptor {
  encrypt(plaintext: string): Result<EncryptedBlob>;
  decrypt(blob: EncryptedBlob): Result<string>;
  currentKeyVersion(): string;
}

export interface ISecretCache {
  get(key: string): EncryptedBlob | undefined;
  set(key: string, value: EncryptedBlob, ttlMs?: number): void;
  delete(key: string): void;
  clear(): void;
  stats(): { hits: number; misses: number; size: number };
}

export interface ISecretAuditor {
  record(event: Omit<SecretAuditEvent, "eventId" | "at"> & { at?: string }): void;
  list(secretId?: SecretId): readonly SecretAuditEvent[];
}

export interface ISecretMonitor {
  recordRotationFailure(): void;
  snapshot(partial: Omit<SecretHealthReport, "checkedAt" | "healthy"> & { healthy?: boolean }): SecretHealthReport;
}
