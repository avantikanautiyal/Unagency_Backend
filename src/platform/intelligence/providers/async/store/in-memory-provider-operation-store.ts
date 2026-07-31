/**
 * In-memory durable provider operation store with atomic claim semantics.
 */

import type { ProviderOperationRecord } from "../contracts/provider-operation";
import type { IProviderOperationStore } from "../interfaces/provider-operation-store";

export class InMemoryProviderOperationStore implements IProviderOperationStore {
  private readonly byId = new Map<string, ProviderOperationRecord>();
  private readonly claimLocks = new Set<string>();

  async create(record: ProviderOperationRecord): Promise<void> {
    for (const rec of this.byId.values()) {
      if (rec.submissionKey === record.submissionKey) {
        throw new Error(`duplicate provider operation submissionKey: ${record.submissionKey}`);
      }
    }
    this.byId.set(record.operationId, record);
  }

  async get(operationId: string): Promise<ProviderOperationRecord | undefined> {
    return this.byId.get(operationId);
  }

  async getBySubmissionKey(submissionKey: string): Promise<ProviderOperationRecord | undefined> {
    for (const rec of this.byId.values()) {
      if (rec.submissionKey === submissionKey) return rec;
    }
    return undefined;
  }

  async getByExecutionId(executionId: string): Promise<ProviderOperationRecord | undefined> {
    const all = await this.listByExecutionId(executionId);
    return all[0];
  }

  async listByExecutionId(executionId: string): Promise<readonly ProviderOperationRecord[]> {
    return [...this.byId.values()]
      .filter((rec) => rec.executionId === executionId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async update(record: ProviderOperationRecord): Promise<void> {
    this.byId.set(record.operationId, record);
  }

  async listDueForPoll(nowMs: number, limit = 100): Promise<readonly ProviderOperationRecord[]> {
    const due: ProviderOperationRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.state !== "pending" && rec.state !== "submitted" && rec.state !== "completed" && rec.state !== "result_ingesting") {
        continue;
      }
      if (rec.leaseOwner) continue;
      const next = rec.nextPollAt ? Date.parse(rec.nextPollAt) : 0;
      if (!Number.isFinite(next) || next <= nowMs) due.push(rec);
      if (due.length >= limit) break;
    }
    return due;
  }

  async tryClaim(
    operationId: string,
    workerId: string,
    leaseTtlMs: number,
    nowIso: string,
    nowMs: number
  ): Promise<ProviderOperationRecord | undefined> {
    const rec = this.byId.get(operationId);
    if (!rec) return undefined;
    if (rec.leaseOwner && rec.leaseExpiresAt) {
      const exp = Date.parse(rec.leaseExpiresAt);
      if (Number.isFinite(exp) && exp > nowMs) return undefined;
    }
    if (this.claimLocks.has(operationId)) return undefined;
    this.claimLocks.add(operationId);

    const claimed: ProviderOperationRecord = {
      ...rec,
      leaseOwner: workerId,
      leaseExpiresAt: new Date(nowMs + leaseTtlMs).toISOString(),
      updatedAt: nowIso,
    };
    this.byId.set(operationId, claimed);
    return claimed;
  }

  async releaseClaim(operationId: string): Promise<void> {
    this.claimLocks.delete(operationId);
    const rec = this.byId.get(operationId);
    if (!rec) return;
    this.byId.set(operationId, {
      ...rec,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
    });
  }

  async reclaimExpiredLeases(
    nowIso: string,
    nowMs: number
  ): Promise<readonly ProviderOperationRecord[]> {
    const reclaimed: ProviderOperationRecord[] = [];
    for (const [id, rec] of this.byId) {
      if (!rec.leaseOwner || !rec.leaseExpiresAt) continue;
      const exp = Date.parse(rec.leaseExpiresAt);
      if (!Number.isFinite(exp) || exp > nowMs) continue;
      this.claimLocks.delete(id);
      const reset = {
        ...rec,
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
        updatedAt: nowIso,
      };
      this.byId.set(id, reset);
      reclaimed.push(reset);
    }
    return reclaimed;
  }

  clear(): void {
    this.byId.clear();
    this.claimLocks.clear();
  }

  /** Test helper — count provider submissions tracked externally on fake provider. */
  all(): readonly ProviderOperationRecord[] {
    return [...this.byId.values()];
  }
}
