/**
 * Mongo-backed job store with atomic claiming for multi-worker safety.
 */

import type { IJobStore } from "../../execution/interfaces/execution";
import type { ExecutionJob, JobId, WorkerId } from "../../execution/contracts/job";
import { EnterpriseJob } from "../mongo/models/enterprise-job.model";

function isClaimedStatus(status: ExecutionJob["status"]): boolean {
  return status === "reserved" || status === "running";
}

/** Prefer the later lease expiry so a stale status persist cannot regress renew. */
function newerLeaseExpiresAt(
  a: string | undefined,
  b: string | undefined,
): string | undefined {
  if (!a) return b;
  if (!b) return a;
  const aMs = Date.parse(a);
  const bMs = Date.parse(b);
  if (!Number.isFinite(aMs)) return b;
  if (!Number.isFinite(bMs)) return a;
  return aMs >= bMs ? a : b;
}

/**
 * Ownership fields are mutated ONLY by tryClaim / renewLease / reclaimExpired
 * (and intentional release to queued/terminal). Blind full-document $set of a
 * stale in-memory snapshot must never rewind leaseExpiresAt after a renew —
 * that is the job_47 regression (running persist overwrote a renewed lease →
 * reclaim → attempt 2 while execute still active).
 */
function stripOwnershipForClaimedPersist(
  job: ExecutionJob,
): Record<string, unknown> {
  const {
    leaseExpiresAt: _leaseExpiresAt,
    reservedBy: _reservedBy,
    reservationId: _reservationId,
    leaseId: _leaseId,
    ...rest
  } = job;
  return rest as Record<string, unknown>;
}

export class MongoJobStore implements IJobStore {
  private readonly cache = new Map<string, ExecutionJob>();

  save(job: ExecutionJob): void {
    const id = String(job.jobId);
    const prev = this.cache.get(id);
    let next = job;
    if (prev && isClaimedStatus(job.status) && isClaimedStatus(prev.status)) {
      // Ownership fields are never updated via save — only tryClaim/renew/reclaim.
      next = {
        ...job,
        reservedBy: prev.reservedBy,
        reservationId: prev.reservationId,
        leaseId: prev.leaseId,
        leaseExpiresAt: prev.leaseExpiresAt,
      };
    }
    this.cache.set(id, next);
    void this.persist(next).catch((err) => {
      console.warn(
        `[Direct] job persist failed | jobId=${id} | status=${next.status} | ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  async persist(job: ExecutionJob): Promise<void> {
    const id = String(job.jobId);
    if (isClaimedStatus(job.status)) {
      // Do not $set ownership fields — renewLease/tryClaim own those paths.
      await EnterpriseJob.updateOne(
        { jobId: id },
        { $set: stripOwnershipForClaimedPersist(job) },
        { upsert: true, maxTimeMS: 15_000 },
      );
      const prev = this.cache.get(id);
      this.cache.set(id, {
        ...job,
        reservedBy: job.reservedBy ?? prev?.reservedBy,
        reservationId: job.reservationId ?? prev?.reservationId,
        leaseId: job.leaseId ?? prev?.leaseId,
        leaseExpiresAt: newerLeaseExpiresAt(
          prev?.leaseExpiresAt,
          job.leaseExpiresAt,
        ),
      });
      return;
    }
    await EnterpriseJob.updateOne(
      { jobId: id },
      { $set: job },
      { upsert: true, maxTimeMS: 15_000 },
    );
    this.cache.set(id, job);
  }

  get(jobId: JobId): ExecutionJob | undefined {
    return this.cache.get(String(jobId));
  }

  async hydrate(jobId: JobId): Promise<ExecutionJob | undefined> {
    // Always prefer durable Mongo state for claim/recovery decisions so a
    // stale in-memory cache cannot keep tryClaim failing forever.
    const doc = await EnterpriseJob.findOne({ jobId: String(jobId) }).lean();
    if (!doc) {
      return this.cache.get(String(jobId));
    }
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

  /** Jobs persisted as runnable but lost from in-memory queues after restart. */
  async listRunnableFromDatabase(): Promise<readonly ExecutionJob[]> {
    const docs = await EnterpriseJob.collection
      .find(
        { status: { $in: ["queued", "retrying"] } },
        {
          projection: { jobId: 1, status: 1, queueKind: 1, createdAt: 1 },
          sort: { createdAt: -1 },
          limit: 64,
        }
      )
      .maxTimeMS(15_000)
      .toArray();
    const jobs: ExecutionJob[] = [];
    for (const doc of docs) {
      const jobId = String(doc.jobId);
      let job = this.cache.get(jobId);
      if (!job?.payload) {
        job = await this.hydrate(doc.jobId as JobId);
      }
      if (job && (job.status === "queued" || job.status === "retrying")) {
        this.cache.set(jobId, job);
        jobs.push(job);
      }
    }
    return jobs;
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
    const baseMs = Date.parse(nowIso);
    const leaseExpiresAt = new Date(
      (Number.isFinite(baseMs) ? baseMs : Date.now()) + ttlMs,
    ).toISOString();
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
      { new: true, maxTimeMS: 15_000 }
    ).lean();
    if (!doc) return undefined;
    const job = doc as unknown as ExecutionJob;
    this.cache.set(String(jobId), job);
    return job;
  }

  /**
   * Reclaim only when durable lease ownership has genuinely expired.
   * Active owners renew leaseExpiresAt; reclaim CAS fails if renewed.
   */
  async reclaimExpired(nowIso: string, nowMs: number): Promise<readonly ExecutionJob[]> {
    const nowIsoLease = new Date(nowMs).toISOString();
    const docs = await EnterpriseJob.find({
      status: { $in: ["reserved", "running"] },
      leaseExpiresAt: { $lte: nowIsoLease },
    }).lean();

    const recovered: ExecutionJob[] = [];
    for (const doc of docs) {
      // CAS: lease must still be expired and status still claimed.
      // A concurrent renewLease from the owning worker advances leaseExpiresAt
      // and causes this update to no-op — preserving active ownership.
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

  async renewLease(
    jobId: JobId,
    ttlMs: number,
    nowIso: string,
    workerId?: WorkerId
  ): Promise<boolean> {
    const baseMs = Date.parse(nowIso);
    const leaseExpiresAt = new Date(
      (Number.isFinite(baseMs) ? baseMs : Date.now()) + ttlMs,
    ).toISOString();
    const existing = this.cache.get(String(jobId));
    const filter: Record<string, unknown> = {
      jobId: String(jobId),
      status: { $in: ["reserved", "running"] },
    };
    // Durable ownership: only the reserved worker may renew.
    if (workerId) filter.reservedBy = String(workerId);
    const doc = await EnterpriseJob.findOneAndUpdate(
      filter,
      { $set: { leaseExpiresAt, updatedAt: nowIso } },
      { new: true, maxTimeMS: 5_000 },
    ).lean();
    if (!doc) {
      const durable = await EnterpriseJob.findOne(
        { jobId: String(jobId) },
        { status: 1, reservedBy: 1, attempt: 1, leaseExpiresAt: 1 },
      )
        .lean()
        .catch(() => null);
      console.log(
        `[Direct] lease renew miss durable | jobId=${String(jobId)} | worker=${String(workerId ?? "")} | status=${String(durable?.status ?? "missing")} | reservedBy=${String(durable?.reservedBy ?? "none")} | attempt=${String(durable?.attempt ?? "n/a")} | leaseExpiresAt=${String(durable?.leaseExpiresAt ?? "none")}`,
      );
      return false;
    }
    const job = {
      ...(existing ?? (doc as unknown as ExecutionJob)),
      ...(doc as unknown as ExecutionJob),
      leaseExpiresAt,
      updatedAt: nowIso,
    };
    this.cache.set(String(jobId), job);
    return true;
  }

  async reacquireUnclaimed(
    jobId: JobId,
    workerId: WorkerId,
    attempt: number,
    ttlMs: number,
    nowIso: string
  ): Promise<boolean> {
    const baseMs = Date.parse(nowIso);
    const leaseExpiresAt = new Date(
      (Number.isFinite(baseMs) ? baseMs : Date.now()) + ttlMs,
    ).toISOString();
    const doc = await EnterpriseJob.findOneAndUpdate(
      {
        jobId: String(jobId),
        attempt,
        status: { $in: ["queued", "retrying"] },
        cancelRequested: { $ne: true },
      },
      {
        $set: {
          status: "running",
          reservedBy: String(workerId),
          leaseExpiresAt,
          updatedAt: nowIso,
        },
      },
      { new: true, maxTimeMS: 5_000 },
    ).lean();
    if (!doc) return false;
    this.cache.set(String(jobId), doc as unknown as ExecutionJob);
    return true;
  }
}
