/**
 * Core secret contracts — references and protected values only on public paths.
 */

import type {
  EncryptionAlgorithm,
  LeaseState,
  SecretLifecycleState,
  SecretProviderKind,
  SecretType,
} from "./enums";

export type SecretId = string & { readonly __brand: "SecretId" };
export type SecretRef = string & { readonly __brand: "SecretRef" };
export type LeaseId = string & { readonly __brand: "LeaseId" };
export type KeyVersionId = string & { readonly __brand: "KeyVersionId" };

export function asSecretId(id: string): SecretId {
  return id as SecretId;
}
export function asSecretRef(ref: string): SecretRef {
  return ref as SecretRef;
}
export function asLeaseId(id: string): LeaseId {
  return id as LeaseId;
}
export function asKeyVersionId(id: string): KeyVersionId {
  return id as KeyVersionId;
}

/** Metadata only — never includes plaintext. */
export interface SecretRecord {
  readonly secretId: SecretId;
  readonly ref: SecretRef;
  readonly name: string;
  readonly type: SecretType;
  readonly lifecycle: SecretLifecycleState;
  readonly providerKind: SecretProviderKind;
  readonly version: number;
  readonly keyVersionId?: KeyVersionId;
  readonly labels: Readonly<Record<string, string>>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly expiresAt?: string;
  readonly lastRotatedAt?: string;
  readonly tenantId?: string;
}

/** Safe public return — never the raw secret. */
export interface ProtectedSecretValue {
  readonly secretId: SecretId;
  readonly ref: SecretRef;
  readonly masked: string;
  readonly length: number;
  readonly version: number;
  readonly lifecycle: SecretLifecycleState;
}

export interface SecretLease {
  readonly leaseId: LeaseId;
  readonly secretId: SecretId;
  readonly ref: SecretRef;
  readonly state: LeaseState;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly renewedAt?: string;
  readonly purpose: string;
  readonly actor?: string;
}

export interface EncryptedBlob {
  readonly algorithm: EncryptionAlgorithm;
  readonly ciphertext: string;
  readonly iv: string;
  readonly tag?: string;
  readonly keyVersionId: KeyVersionId;
  readonly wrappedDataKey?: string;
}

export interface StoreSecretInput {
  readonly name: string;
  readonly type: SecretType;
  readonly value: string;
  readonly labels?: Readonly<Record<string, string>>;
  readonly expiresAt?: string;
  readonly tenantId?: string;
  readonly actor?: string;
  readonly reason?: string;
}

export interface UpdateSecretInput {
  readonly secretId: SecretId;
  readonly value?: string;
  readonly labels?: Readonly<Record<string, string>>;
  readonly expiresAt?: string;
  readonly lifecycle?: SecretLifecycleState;
  readonly actor?: string;
  readonly reason?: string;
}

export interface RotateSecretInput {
  readonly secretId: SecretId;
  readonly newValue?: string;
  readonly actor?: string;
  readonly reason?: string;
}

export interface LeaseSecretInput {
  readonly secretId: SecretId;
  readonly ttlMs: number;
  readonly purpose: string;
  readonly actor?: string;
}

export interface SecretFilter {
  readonly type?: SecretType;
  readonly lifecycle?: SecretLifecycleState;
  readonly providerKind?: SecretProviderKind;
  readonly tenantId?: string;
  readonly namePrefix?: string;
}

export interface SecretHealthReport {
  readonly healthy: boolean;
  readonly providerKind: SecretProviderKind;
  readonly secretCount: number;
  readonly expiredCount: number;
  readonly nearExpirationCount: number;
  readonly rotationFailureCount: number;
  readonly activeLeaseCount: number;
  readonly cacheHits: number;
  readonly cacheMisses: number;
  readonly validatedCount: number;
  readonly checkedAt: string;
}
