/**
 * Dead letter store.
 */

import type { DeadLetterRecord, JobId, ExecutionJob } from "../contracts/job";

export class DeadLetterStore {
  private readonly items = new Map<string, DeadLetterRecord>();

  move(job: ExecutionJob, reason: string, nowIso: string): DeadLetterRecord {
    const record: DeadLetterRecord = {
      jobId: job.jobId,
      reason,
      attempts: job.attempt,
      lastError: job.lastError,
      movedAt: nowIso,
      payload: job.payload,
    };
    this.items.set(String(job.jobId), record);
    return record;
  }

  list(): readonly DeadLetterRecord[] {
    return [...this.items.values()];
  }

  get(jobId: JobId): DeadLetterRecord | undefined {
    return this.items.get(String(jobId));
  }

  remove(jobId: JobId): void {
    this.items.delete(String(jobId));
  }

  count(): number {
    return this.items.size;
  }
}
