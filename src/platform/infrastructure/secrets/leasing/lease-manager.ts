/**
 * Secret leasing — temporary access grants (Lease → Renew → Expire → Revoke).
 */

import { failure, success, type Result } from "../../../intelligence/shared/result";
import { ValidationError } from "../../../intelligence/shared/errors";
import type {
  LeaseId,
  LeaseSecretInput,
  SecretLease,
  SecretRef,
  SecretId,
} from "../contracts/secret";
import { asLeaseId } from "../contracts/secret";

export class SecretLeaseManager {
  private readonly leases = new Map<string, SecretLease>();

  constructor(
    private readonly createId: (prefix: string) => string,
    private readonly nowIso: () => string,
    private readonly clockMs: () => number = () => Date.now()
  ) {}

  create(input: LeaseSecretInput, ref: SecretRef): Result<SecretLease> {
    if (input.ttlMs <= 0) {
      return failure(new ValidationError("ttlMs must be positive"));
    }
    const now = this.clockMs();
    const lease: SecretLease = {
      leaseId: asLeaseId(this.createId("lease")),
      secretId: input.secretId,
      ref,
      state: "active",
      issuedAt: this.nowIso(),
      expiresAt: new Date(now + input.ttlMs).toISOString(),
      purpose: input.purpose,
      actor: input.actor,
    };
    this.leases.set(String(lease.leaseId), lease);
    return success(lease);
  }

  get(leaseId: LeaseId): Result<SecretLease> {
    const lease = this.leases.get(String(leaseId));
    if (!lease) return failure(new ValidationError("lease not found"));
    return success(this.refreshState(lease));
  }

  renew(leaseId: LeaseId, ttlMs: number): Result<SecretLease> {
    const got = this.get(leaseId);
    if (!got.ok) return got;
    const lease = got.value;
    if (lease.state === "revoked" || lease.state === "expired") {
      return failure(new ValidationError(`cannot renew lease in state ${lease.state}`));
    }
    if (ttlMs <= 0) {
      return failure(new ValidationError("ttlMs must be positive"));
    }
    const next: SecretLease = {
      ...lease,
      state: "renewed",
      renewedAt: this.nowIso(),
      expiresAt: new Date(this.clockMs() + ttlMs).toISOString(),
    };
    this.leases.set(String(leaseId), next);
    return success(next);
  }

  revoke(leaseId: LeaseId): Result<SecretLease> {
    const got = this.get(leaseId);
    if (!got.ok) return got;
    const next: SecretLease = { ...got.value, state: "revoked" };
    this.leases.set(String(leaseId), next);
    return success(next);
  }

  activeCount(): number {
    let n = 0;
    for (const lease of this.leases.values()) {
      if (this.refreshState(lease).state === "active" || lease.state === "renewed") {
        if (Date.parse(lease.expiresAt) > this.clockMs()) n += 1;
      }
    }
    return n;
  }

  listForSecret(secretId: SecretId): readonly SecretLease[] {
    return [...this.leases.values()]
      .map((l) => this.refreshState(l))
      .filter((l) => l.secretId === secretId);
  }

  private refreshState(lease: SecretLease): SecretLease {
    if (lease.state === "revoked") return lease;
    if (Date.parse(lease.expiresAt) <= this.clockMs()) {
      const expired: SecretLease = { ...lease, state: "expired" };
      this.leases.set(String(lease.leaseId), expired);
      return expired;
    }
    return lease;
  }
}
