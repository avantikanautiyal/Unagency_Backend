/**
 * In-memory claimable job store — atomic tryClaim for multi-worker tests.
 * Simulates MongoJobStore.tryClaim without requiring Mongo.
 */

import type { IJobStore } from "../../execution/interfaces/execution";
import type { ExecutionJob, JobId, WorkerId } from "../../execution/contracts/job";

export class InMemoryClaimableJobStore implements IJobStore {
  private readonly jobs = new Map<string, ExecutionJob>();
  private readonly claimLocks = new Set<string>();

  save(job: ExecutionJob): void {
    this.jobs.set(String(job.jobId), job);
    if (
      job.status === "completed" ||
      job.status === "failed" ||
      job.status === "cancelled" ||
      job.status === "dead_letter" ||
      job.status === "queued" ||
      job.status === "retrying"
    ) {
      this.claimLocks.delete(String(job.jobId));
    }
  }

  get(jobId: JobId): ExecutionJob | undefined {
    return this.jobs.get(String(jobId));
  }

  list(): readonly ExecutionJob[] {
    return [...this.jobs.values()];
  }

  delete(jobId: JobId): void {
    this.jobs.delete(String(jobId));
    this.claimLocks.delete(String(jobId));
  }

  async tryClaim(
    jobId: JobId,
    workerId: WorkerId,
    ttlMs: number,
    nowIso: string
  ): Promise<ExecutionJob | undefined> {
    const id = String(jobId);
    const job = this.jobs.get(id);
    if (!job) return undefined;
    if (job.status !== "queued" && job.status !== "retrying") return undefined;
    if (this.claimLocks.has(id)) return undefined;

    this.claimLocks.add(id);
    const leaseExpiresAt = new Date(Date.now() + ttlMs).toISOString();
    const claimed: ExecutionJob = {
      ...job,
      status: "reserved",
      reservedBy: workerId,
      leaseExpiresAt,
      updatedAt: nowIso,
      attempt: job.attempt + 1,
    };
    this.jobs.set(id, claimed);
    return claimed;
  }

  async reclaimExpired(nowIso: string, nowMs: number): Promise<readonly ExecutionJob[]> {
    const recovered: ExecutionJob[] = [];
    for (const [id, job] of this.jobs) {
      if (job.status !== "reserved" && job.status !== "running") continue;
      if (!job.leaseExpiresAt) continue;
      const expires = Date.parse(job.leaseExpiresAt);
      if (!Number.isFinite(expires) || expires > nowMs) continue;

      const reset: ExecutionJob = {
        ...job,
        status: "queued",
        reservedBy: undefined,
        reservationId: undefined,
        leaseId: undefined,
        leaseExpiresAt: undefined,
        updatedAt: nowIso,
      };
      this.jobs.set(id, reset);
      this.claimLocks.delete(id);
      recovered.push(reset);
    }
    return recovered;
  }

  clear(): void {
    this.jobs.clear();
    this.claimLocks.clear();
  }

  /** Release claim lock after terminal state (test helper). */
  releaseClaim(jobId: JobId): void {
    this.claimLocks.delete(String(jobId));
  }
}
