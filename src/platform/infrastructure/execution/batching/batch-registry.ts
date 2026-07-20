/**
 * Batch tracking.
 */

import type { BatchId, BatchRecord, BatchJobSpec, JobId } from "../contracts/job";
import { asBatchId } from "../contracts/job";

export class BatchRegistry {
  private readonly batches = new Map<string, BatchRecord>();

  constructor(
    private readonly createId: (prefix: string) => string,
    private readonly nowIso: () => string
  ) {}

  create(spec: BatchJobSpec, jobIds: readonly JobId[]): BatchRecord {
    const batchId = spec.batchId ?? asBatchId(this.createId("batch"));
    const record: BatchRecord = {
      batchId,
      mode: spec.mode,
      name: spec.name,
      jobIds,
      createdAt: this.nowIso(),
      cancelRequested: false,
      progressPercent: 0,
      status: "queued",
    };
    this.batches.set(String(batchId), record);
    return record;
  }

  get(batchId: BatchId | string): BatchRecord | undefined {
    return this.batches.get(String(batchId));
  }

  update(batchId: BatchId | string, patch: Partial<BatchRecord>): BatchRecord | undefined {
    const existing = this.batches.get(String(batchId));
    if (!existing) return undefined;
    const next = { ...existing, ...patch };
    this.batches.set(String(batchId), next);
    return next;
  }

  list(): readonly BatchRecord[] {
    return [...this.batches.values()];
  }
}
