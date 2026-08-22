/**
 * Mongo-backed job store with atomic claiming for multi-worker safety.
 */

import type { IJobStore } from "../../execution/interfaces/execution";
import type { ExecutionJob, JobId, WorkerId } from "../../execution/contracts/job";
import { EnterpriseJob } from "../mongo/models/enterprise-job.model";

export class MongoJobStore implements IJobStore {
  private readonly cache = new Map<string, ExecutionJob>();

  save(job: ExecutionJob): void {
    this.cache.set(String(job.jobId), job);
    void EnterpriseJob.updateOne(
      { jobId: String(job.jobId) },
      { $set: job },
      { upsert: true }
    ).catch(() => undefined);
  }

  get(jobId: JobId): ExecutionJob | undefined {
    return this.cache.get(String(jobId));
  }

  async hydrate(jobId: JobId): Promise<ExecutionJob | undefined> {
    const cached = this.cache.get(String(jobId));
    if (cached) return cached;
    const doc = await EnterpriseJob.findOne({ jobId: String(jobId) }).lean();
    if (!doc) return undefined;
    const job = doc as unknown as ExecutionJob;
    this.cache.set(String(jobId), job);
    return job;
  }

  list(): readonly ExecutionJob[] {
    return [...this.cache.values()];
  }

  async hydrateAll(): Promise<void> {
    const docs = await EnterpriseJob.find().lean();
    for (const doc of docs) {
      this.cache.set(String(doc.jobId), doc as unknown as ExecutionJob);
    }
  }

  delete(jobId: JobId): void {
    this.cache.delete(String(jobId));
    void EnterpriseJob.deleteOne({ jobId: String(jobId) }).catch(() => undefined);
  }

  /**
   * Atomic claim — only one worker can move queued/retrying → reserved.
   */
  async tryClaim(
    jobId: JobId,
    workerId: WorkerId,
    ttlMs: number,
    nowIso: string
  ): Promise<ExecutionJob | undefined> {
    const leaseExpiresAt = new Date(Date.now() + ttlMs).toISOString();
    const existing = this.cache.get(String(jobId));
    const nextAttempt = (existing?.attempt ?? 0) + 1;
    const doc = await EnterpriseJob.findOneAndUpdate(
      {
        jobId: String(jobId),
        status: { $in: ["queued", "retrying"] },
      },
      {
        $set: {
          status: "reserved",
          reservedBy: workerId,
          leaseExpiresAt,
          updatedAt: nowIso,
          attempt: nextAttempt,
        },
      },
      { new: true }
    ).lean();
    if (!doc) return undefined;
    const job = doc as unknown as ExecutionJob;
    this.cache.set(String(jobId), job);
    return job;
  }

  async reclaimExpired(nowIso: string, nowMs: number): Promise<readonly ExecutionJob[]> {
    const nowIsoLease = new Date(nowMs).toISOString();
    const docs = await EnterpriseJob.find({
      status: { $in: ["reserved", "running"] },
      leaseExpiresAt: { $lte: nowIsoLease },
    }).lean();

    const recovered: ExecutionJob[] = [];
    for (const doc of docs) {
      const updated = await EnterpriseJob.findOneAndUpdate(
        {
          jobId: doc.jobId,
          status: { $in: ["reserved", "running"] },
          leaseExpiresAt: { $lte: nowIsoLease },
        },
        {
          // Must not $set and $unset the same paths — Mongo rejects that conflict.
          $set: {
            status: "queued",
            updatedAt: nowIso,
          },
          $unset: {
            reservedBy: "",
            reservationId: "",
            leaseId: "",
            leaseExpiresAt: "",
          },
        },
        { new: true }
      ).lean();
      if (!updated) continue;
      const job = {
        ...(updated as unknown as ExecutionJob),
        reservedBy: undefined,
        reservationId: undefined,
        leaseId: undefined,
        leaseExpiresAt: undefined,
        status: "queued" as const,
      };
      this.cache.set(String(job.jobId), job);
      recovered.push(job);
    }
    return recovered;
  }
}
