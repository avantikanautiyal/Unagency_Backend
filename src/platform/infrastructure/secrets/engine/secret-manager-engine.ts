/**
 * Secret Manager Engine — provider-independent secret lifecycle.
 */

import { failure, success, type Result } from "../../../intelligence/shared/result";
import { ValidationError } from "../../../intelligence/shared/errors";
import type { ISecretManager } from "../interfaces/secrets";
import type {
  ISecretBackend,
  ISecretEncryptor,
  ISecretCache,
  ISecretAuditor,
  ISecretMonitor,
} from "../interfaces/secrets";
import type {
  LeaseId,
  LeaseSecretInput,
  ProtectedSecretValue,
  RotateSecretInput,
  SecretFilter,
  SecretHealthReport,
  SecretId,
  SecretLease,
  SecretRecord,
  StoreSecretInput,
  UpdateSecretInput,
} from "../contracts/secret";
import {
  asSecretId,
  asSecretRef,
} from "../contracts/secret";
import { validateSecretInput, isExpired, isNearExpiration } from "../validation/secret-validator";
import { transitionLifecycle } from "../lifecycle/lifecycle";
import { maskSecret as maskFn, maskSecretValue } from "../masking/secret-masker";
import { rotateSecretRecord } from "../rotation/rotation-engine";
import { SecretLeaseManager } from "../leasing/lease-manager";
import { NEAR_EXPIRATION_MS } from "../constants";
import type { SecretAuditEvent } from "../contracts/audit";

export interface SecretManagerEngineDeps {
  readonly backend: ISecretBackend;
  readonly encryptor: ISecretEncryptor;
  readonly cache: ISecretCache;
  readonly auditor: ISecretAuditor;
  readonly monitor: ISecretMonitor;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export class SecretManagerEngine implements ISecretManager {
  private readonly records = new Map<string, SecretRecord>();
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;
  private readonly createId: (prefix: string) => string;
  private readonly leases: SecretLeaseManager;

  constructor(private readonly deps: SecretManagerEngineDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
    this.createId = deps.createId ?? ((p) => `${p}_${this.clockMs()}`);
    this.leases = new SecretLeaseManager(this.createId, this.nowIso, this.clockMs);
  }

  async storeSecret(input: StoreSecretInput): Promise<Result<SecretRecord>> {
    const start = this.clockMs();
    const validated = validateSecretInput(input);
    if (!validated.ok) {
      this.audit("store", "failure", undefined, undefined, input.actor, input.reason, start);
      return validated;
    }

    const secretId = asSecretId(this.createId("sec"));
    const ref = asSecretRef(`sec/${secretId}`);
    const encrypted = this.deps.encryptor.encrypt(input.value);
    if (!encrypted.ok) {
      this.audit("store", "failure", secretId, ref, input.actor, input.reason, start);
      return encrypted;
    }

    const put = await this.deps.backend.put(ref, encrypted.value);
    if (!put.ok) {
      this.audit("store", "failure", secretId, ref, input.actor, input.reason, start);
      return put;
    }

    this.deps.cache.set(String(ref), encrypted.value);

    const record: SecretRecord = {
      secretId,
      ref,
      name: input.name.trim(),
      type: input.type,
      lifecycle: "created",
      providerKind: this.deps.backend.kind,
      version: 1,
      keyVersionId: encrypted.value.keyVersionId,
      labels: input.labels ?? {},
      createdAt: this.nowIso(),
      updatedAt: this.nowIso(),
      expiresAt: input.expiresAt,
      tenantId: input.tenantId,
    };
    this.records.set(String(secretId), record);
    this.audit("store", "success", secretId, ref, input.actor, input.reason, start, {
      type: input.type,
      name: input.name,
    });
    return success(record);
  }

  async getSecret(secretId: SecretId): Promise<Result<ProtectedSecretValue>> {
    const start = this.clockMs();
    const record = this.records.get(String(secretId));
    if (!record || record.lifecycle === "deleted") {
      this.audit("get", "failure", secretId, undefined, undefined, undefined, start);
      return failure(new ValidationError("secret not found"));
    }

    // Load ciphertext (cache or backend) to derive masked length — never return plaintext.
    let blob = this.deps.cache.get(String(record.ref));
    if (!blob) {
      const fromBackend = await this.deps.backend.get(record.ref);
      if (fromBackend.ok) {
        blob = fromBackend.value;
        this.deps.cache.set(String(record.ref), blob);
      }
    }

    let length = 0;
    let masked = "<masked>";
    if (blob) {
      const decrypted = this.deps.encryptor.decrypt(blob);
      if (decrypted.ok) {
        length = decrypted.value.length;
        masked = maskSecretValue(decrypted.value);
      }
    }

    this.audit("get", "success", secretId, record.ref, undefined, undefined, start);
    return success({
      secretId: record.secretId,
      ref: record.ref,
      masked,
      length,
      version: record.version,
      lifecycle: record.lifecycle,
    });
  }

  async updateSecret(input: UpdateSecretInput): Promise<Result<SecretRecord>> {
    const start = this.clockMs();
    const existing = this.records.get(String(input.secretId));
    if (!existing || existing.lifecycle === "deleted") {
      this.audit("update", "failure", input.secretId, undefined, input.actor, input.reason, start);
      return failure(new ValidationError("secret not found"));
    }

    let version = existing.version;
    let keyVersionId = existing.keyVersionId;

    if (input.value !== undefined) {
      const encrypted = this.deps.encryptor.encrypt(input.value);
      if (!encrypted.ok) {
        this.audit("update", "failure", input.secretId, existing.ref, input.actor, input.reason, start);
        return encrypted;
      }
      const put = await this.deps.backend.put(existing.ref, encrypted.value);
      if (!put.ok) {
        this.audit("update", "failure", input.secretId, existing.ref, input.actor, input.reason, start);
        return put;
      }
      this.deps.cache.set(String(existing.ref), encrypted.value);
      version += 1;
      keyVersionId = encrypted.value.keyVersionId;
    }

    let lifecycle = existing.lifecycle;
    if (input.lifecycle) {
      const t = transitionLifecycle(existing.lifecycle, input.lifecycle);
      if (!t.ok) {
        this.audit("update", "failure", input.secretId, existing.ref, input.actor, input.reason, start);
        return t;
      }
      lifecycle = t.value;
    }

    const next: SecretRecord = {
      ...existing,
      labels: input.labels ?? existing.labels,
      expiresAt: input.expiresAt ?? existing.expiresAt,
      lifecycle,
      version,
      keyVersionId,
      updatedAt: this.nowIso(),
    };
    this.records.set(String(input.secretId), next);
    this.audit("update", "success", input.secretId, existing.ref, input.actor, input.reason, start);
    return success(next);
  }

  async deleteSecret(secretId: SecretId): Promise<Result<void>> {
    const start = this.clockMs();
    const existing = this.records.get(String(secretId));
    if (!existing) {
      this.audit("delete", "failure", secretId, undefined, undefined, undefined, start);
      return failure(new ValidationError("secret not found"));
    }
    const t = transitionLifecycle(existing.lifecycle, "deleted");
    if (!t.ok && existing.lifecycle !== "deleted") {
      // force delete from revoked/archived
      if (existing.lifecycle !== "revoked" && existing.lifecycle !== "archived") {
        this.audit("delete", "failure", secretId, existing.ref, undefined, undefined, start);
        return t;
      }
    }
    await this.deps.backend.delete(existing.ref);
    this.deps.cache.delete(String(existing.ref));
    this.records.set(String(secretId), {
      ...existing,
      lifecycle: "deleted",
      updatedAt: this.nowIso(),
    });
    this.audit("delete", "success", secretId, existing.ref, undefined, undefined, start);
    return success(undefined);
  }

  async rotateSecret(input: RotateSecretInput): Promise<Result<SecretRecord>> {
    const start = this.clockMs();
    const result = await rotateSecretRecord(input, {
      getRecord: (id) => this.records.get(id),
      setLifecycle: (id, lifecycle) => {
        const r = this.records.get(id);
        if (!r) return failure(new ValidationError("secret not found"));
        const next = { ...r, lifecycle, updatedAt: this.nowIso(), lastRotatedAt: this.nowIso() };
        this.records.set(id, next);
        return success(next);
      },
      writeNewValue: async (id, newValue, actor) => {
        return this.updateSecret({
          secretId: asSecretId(id),
          value: newValue,
          actor,
          reason: input.reason ?? "rotation",
        });
      },
      onFailure: () => this.deps.monitor.recordRotationFailure(),
    });
    this.audit(
      "rotate",
      result.ok ? "success" : "failure",
      input.secretId,
      result.ok ? result.value.ref : undefined,
      input.actor,
      input.reason,
      start
    );
    return result;
  }

  async leaseSecret(input: LeaseSecretInput): Promise<Result<SecretLease>> {
    const start = this.clockMs();
    const record = this.records.get(String(input.secretId));
    if (!record || record.lifecycle === "deleted" || record.lifecycle === "revoked") {
      this.audit("lease", "failure", input.secretId, undefined, input.actor, input.purpose, start);
      return failure(new ValidationError("secret not available for lease"));
    }
    const lease = this.leases.create(input, record.ref);
    this.audit(
      "lease",
      lease.ok ? "success" : "failure",
      input.secretId,
      record.ref,
      input.actor,
      input.purpose,
      start
    );
    return lease;
  }

  async renewLease(leaseId: LeaseId, ttlMs: number): Promise<Result<SecretLease>> {
    const start = this.clockMs();
    const result = this.leases.renew(leaseId, ttlMs);
    this.audit(
      "renew_lease",
      result.ok ? "success" : "failure",
      result.ok ? result.value.secretId : undefined,
      result.ok ? result.value.ref : undefined,
      undefined,
      undefined,
      start
    );
    return result;
  }

  async revokeLease(leaseId: LeaseId): Promise<Result<SecretLease>> {
    const start = this.clockMs();
    const result = this.leases.revoke(leaseId);
    this.audit(
      "revoke_lease",
      result.ok ? "success" : "failure",
      result.ok ? result.value.secretId : undefined,
      result.ok ? result.value.ref : undefined,
      undefined,
      undefined,
      start
    );
    return result;
  }

  async revealLeasedSecret(
    leaseId: LeaseId
  ): Promise<Result<{ value: string; lease: SecretLease }>> {
    const start = this.clockMs();
    const lease = this.leases.get(leaseId);
    if (!lease.ok) {
      this.audit("reveal", "denied", undefined, undefined, undefined, undefined, start);
      return lease;
    }
    if (lease.value.state !== "active" && lease.value.state !== "renewed") {
      this.audit("reveal", "denied", lease.value.secretId, lease.value.ref, lease.value.actor, undefined, start);
      return failure(new ValidationError(`lease not active: ${lease.value.state}`));
    }

    const record = this.records.get(String(lease.value.secretId));
    if (!record) {
      return failure(new ValidationError("secret not found"));
    }

    let blob = this.deps.cache.get(String(record.ref));
    if (!blob) {
      const got = await this.deps.backend.get(record.ref);
      if (!got.ok) return got;
      blob = got.value;
      this.deps.cache.set(String(record.ref), blob);
    }

    const decrypted = this.deps.encryptor.decrypt(blob);
    if (!decrypted.ok) {
      this.audit("reveal", "failure", record.secretId, record.ref, lease.value.actor, undefined, start);
      return decrypted;
    }

    // Audit without value
    this.audit("reveal", "success", record.secretId, record.ref, lease.value.actor, lease.value.purpose, start, {
      leaseId: String(leaseId),
    });
    return success({ value: decrypted.value, lease: lease.value });
  }

  async validateSecret(secretId: SecretId): Promise<Result<SecretRecord>> {
    const start = this.clockMs();
    const existing = this.records.get(String(secretId));
    if (!existing || existing.lifecycle === "deleted") {
      this.audit("validate", "failure", secretId, undefined, undefined, undefined, start);
      return failure(new ValidationError("secret not found"));
    }

    if (isExpired(existing.expiresAt, this.nowIso())) {
      const expired = {
        ...existing,
        lifecycle: "expired" as const,
        updatedAt: this.nowIso(),
      };
      this.records.set(String(secretId), expired);
      this.audit("validate", "failure", secretId, existing.ref, undefined, "expired", start);
      return success(expired);
    }

    const exists = await this.deps.backend.exists(existing.ref);
    if (!exists.ok || !exists.value) {
      this.audit("validate", "failure", secretId, existing.ref, undefined, "missing_backend", start);
      return failure(new ValidationError("backend material missing"));
    }

    const nextLifecycle =
      existing.lifecycle === "created" || existing.lifecycle === "validated"
        ? "active"
        : existing.lifecycle;
    const t = transitionLifecycle(existing.lifecycle, nextLifecycle === existing.lifecycle ? existing.lifecycle : "validated");
    // Prefer: created → validated → active
    let lifecycle = existing.lifecycle;
    if (existing.lifecycle === "created") {
      const v = transitionLifecycle("created", "validated");
      if (v.ok) lifecycle = "validated";
      const a = transitionLifecycle(lifecycle, "active");
      if (a.ok) lifecycle = "active";
    } else if (existing.lifecycle === "validated") {
      const a = transitionLifecycle("validated", "active");
      if (a.ok) lifecycle = "active";
    }

    void t;
    const next = { ...existing, lifecycle, updatedAt: this.nowIso() };
    this.records.set(String(secretId), next);
    this.audit("validate", "success", secretId, existing.ref, undefined, undefined, start);
    return success(next);
  }

  maskSecret(value: string): Result<string> {
    return maskFn(value);
  }

  auditSecret(secretId?: SecretId): Result<readonly SecretAuditEvent[]> {
    return success(this.deps.auditor.list(secretId));
  }

  async listSecrets(filter?: SecretFilter): Promise<Result<readonly SecretRecord[]>> {
    const start = this.clockMs();
    let list = [...this.records.values()].filter((r) => r.lifecycle !== "deleted");
    if (filter?.type) list = list.filter((r) => r.type === filter.type);
    if (filter?.lifecycle) list = list.filter((r) => r.lifecycle === filter.lifecycle);
    if (filter?.providerKind) list = list.filter((r) => r.providerKind === filter.providerKind);
    if (filter?.tenantId) list = list.filter((r) => r.tenantId === filter.tenantId);
    if (filter?.namePrefix) {
      list = list.filter((r) => r.name.startsWith(filter.namePrefix!));
    }
    this.audit("list", "success", undefined, undefined, undefined, undefined, start, {
      count: list.length,
    });
    return success(list);
  }

  async health(): Promise<Result<SecretHealthReport>> {
    const start = this.clockMs();
    const backendHealth = await this.deps.backend.health();
    const all = [...this.records.values()].filter((r) => r.lifecycle !== "deleted");
    const now = this.nowIso();
    const expiredCount = all.filter((r) => isExpired(r.expiresAt, now) || r.lifecycle === "expired").length;
    const nearExpirationCount = all.filter((r) =>
      isNearExpiration(r.expiresAt, now, NEAR_EXPIRATION_MS)
    ).length;
    const validatedCount = all.filter(
      (r) => r.lifecycle === "validated" || r.lifecycle === "active"
    ).length;
    const cache = this.deps.cache.stats();

    const report = this.deps.monitor.snapshot({
      healthy: backendHealth.ok && (backendHealth.value.healthy ?? false),
      providerKind: this.deps.backend.kind,
      secretCount: all.length,
      expiredCount,
      nearExpirationCount,
      rotationFailureCount: 0,
      activeLeaseCount: this.leases.activeCount(),
      cacheHits: cache.hits,
      cacheMisses: cache.misses,
      validatedCount,
    });

    this.audit("health", report.healthy ? "success" : "failure", undefined, undefined, undefined, undefined, start);
    return success(report);
  }

  /** Test/helper access to lease manager. */
  getLeaseManager(): SecretLeaseManager {
    return this.leases;
  }

  private audit(
    action: SecretAuditEvent["action"],
    outcome: SecretAuditEvent["outcome"],
    secretId: SecretId | undefined,
    ref: SecretRecord["ref"] | undefined,
    actor: string | undefined,
    reason: string | undefined,
    startMs: number,
    metadata?: Record<string, unknown>
  ): void {
    this.deps.auditor.record({
      action,
      outcome,
      secretId,
      ref,
      actor,
      reason,
      durationMs: this.clockMs() - startMs,
      metadata,
    });
  }
}
