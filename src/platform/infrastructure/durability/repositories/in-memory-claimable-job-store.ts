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
    const id = String(job.jobId);
    const prev = this.jobs.get(id);
    let next = job;
    // Mirror MongoJobStore.persist for claimed rows: ownership fields are mutated
    // only by tryClaim / renewLease / reclaimExpired — never by status persist.
    if (
      prev &&
      (job.status === "reserved" || job.status === "running") &&
      (prev.status === "reserved" || prev.status === "running")
    ) {
      next = {
        ...job,
        reservedBy: prev.reservedBy,
        reservationId: prev.reservationId,
        leaseId: prev.leaseId,
        leaseExpiresAt: prev.leaseExpiresAt,
      };
    }
    this.jobs.set(id, next);
    if (
      next.status === "completed" ||
      next.status === "failed" ||
      next.status === "cancelled" ||
      next.status === "dead_letter" ||
      next.status === "queued" ||
      next.status === "retrying"
    ) {
      this.claimLocks.delete(id);
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
    const baseMs = Date.parse(nowIso);
    const leaseExpiresAt = new Date(
      (Number.isFinite(baseMs) ? baseMs : Date.now()) + ttlMs,
    ).toISOString();
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

  /**
   * Reclaim only when durable lease ownership has genuinely expired.
   * Concurrent renewLease (same owner) advances leaseExpiresAt and wins.
   */
  async reclaimExpired(nowIso: string, nowMs: number): Promise<readonly ExecutionJob[]> {
    const recovered: ExecutionJob[] = [];
    for (const [id, job] of this.jobs) {
      if (job.status !== "reserved" && job.status !== "running") continue;
      if (!job.leaseExpiresAt) continue;
      const expires = Date.parse(job.leaseExpiresAt);
      // Re-read after expiry check to mimic CAS against concurrent renew.
      const latest = this.jobs.get(id);
      if (!latest || (latest.status !== "reserved" && latest.status !== "running")) {
        continue;
      }
      const latestExpires = latest.leaseExpiresAt
        ? Date.parse(latest.leaseExpiresAt)
        : NaN;
      if (!Number.isFinite(latestExpires) || latestExpires > nowMs) continue;

      const reset: ExecutionJob = {
        ...latest,
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

  /**
   * Renew lease only for the durable owner.
   * Atomic within a single Node process (sync Map RMW). Not a cross-process
   * CAS — distributed ownership proofs must use MongoJobStore in production.
   */
  async renewLease(
    jobId: JobId,
    ttlMs: number,
    nowIso: string,
    workerId?: WorkerId
  ): Promise<boolean> {
    const id = String(jobId);
    const job = this.jobs.get(id);
    if (!job) return false;
    if (job.status !== "reserved" && job.status !== "running") return false;
    // Durable ownership: only the reserved worker may renew.
    if (workerId && String(job.reservedBy ?? "") !== String(workerId)) return false;
    const baseMs = Date.parse(nowIso);
    this.jobs.set(id, {
      ...job,
      leaseExpiresAt: new Date(
        (Number.isFinite(baseMs) ? baseMs : Date.now()) + ttlMs,
      ).toISOString(),
      updatedAt: nowIso,
    });
    return true;
  }

  clear(): void {
    this.jobs.clear();
    this.claimLocks.clear();
  }

  async listRunnableFromDatabase(): Promise<readonly ExecutionJob[]> {
    return [...this.jobs.values()].filter(
      (job) => job.status === "queued" || job.status === "retrying",
    );
  }

  async hydrate(jobId: JobId): Promise<ExecutionJob | undefined> {
    return this.jobs.get(String(jobId));
  }

  async persist(job: ExecutionJob): Promise<void> {
    this.save(job);
  }

  /** Release claim lock after terminal state (test helper). */
  releaseClaim(jobId: JobId): void {
    this.claimLocks.delete(String(jobId));
  }
}
