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

/** Everything except the two heavy fields. */
const LIGHT_JOB_PROJECTION: Record<string, 0> = { payload: 0, resultSummary: 0 };

/** Runnable rows whose payload could not be loaded back off and are retried later. */
const HYDRATE_BACKOFF_BASE_MS = 5_000;
const HYDRATE_BACKOFF_MAX_MS = 10 * 60_000;

function isTerminalStatus(status: ExecutionJob["status"]): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "dead_letter"
  );
}

const INLINE_DATA_OMITTED = "[inline-data-omitted]";
const INLINE_DATA_MAX_CHARS = 32 * 1024;

/**
 * Inline `data:` URLs (vault bytes resolved for providers) are duplicated across
 * payload.metadata and can reach many MB — too large to write to Mongo on every
 * enqueue. The full payload stays in the in-memory cache for this process.
 */
function omitInlineData(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > INLINE_DATA_MAX_CHARS && value.startsWith("data:")
      ? INLINE_DATA_OMITTED
      : value;
  }
  if (Array.isArray(value)) return value.map(omitInlineData);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = omitInlineData(v);
    return out;
  }
  return value;
}

function hasOmittedInlineData(payload: unknown): boolean {
  try {
    return JSON.stringify(payload ?? null).includes(INLINE_DATA_OMITTED);
  } catch {
    return false;
  }
}

export class MongoJobStore implements IJobStore {
  private readonly cache = new Map<string, ExecutionJob>();
  private readonly hydrateBackoff = new Map<
    string,
    { failures: number; retryAtMs: number }
  >();

  /** Durable docs carry a slimmed payload; keep the full in-memory one when present. */
  private withCachedPayload(doc: ExecutionJob): ExecutionJob {
    const cached = this.cache.get(String(doc.jobId));
    if (!cached) return doc;
    return {
      ...doc,
      ...(cached.payload !== undefined ? { payload: cached.payload } : {}),
      // Light reads omit resultSummary — keep the copy this process already holds.
      ...(doc.resultSummary === undefined && cached.resultSummary !== undefined
        ? { resultSummary: cached.resultSummary }
        : {}),
    };
  }

  /**
   * Job rows carry multi-MB `payload` / `resultSummary`. Once this process
   * holds the payload, state checks (hydrate, claim, lease renew, reclaim)
   * read only the small state fields instead of re-downloading the whole row.
   */
  private lightProjectionFor(jobId: JobId | string): Record<string, 0> | undefined {
    return this.cache.get(String(jobId))?.payload !== undefined
      ? LIGHT_JOB_PROJECTION
      : undefined;
  }

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
      const { payload, ...fields } = stripOwnershipForClaimedPersist(job);
      await EnterpriseJob.updateOne(
        { jobId: id },
        { $set: fields, $setOnInsert: { payload: omitInlineData(payload) } },
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
    const { payload, ...fields } = job;
    await EnterpriseJob.updateOne(
      { jobId: id },
      { $set: fields, $setOnInsert: { payload: omitInlineData(payload) } },
      { upsert: true, maxTimeMS: 15_000 },
    );
    this.cache.set(id, job);
  }

  get(jobId: JobId): ExecutionJob | undefined {
    return this.cache.get(String(jobId));
  }

  /**
   * Durably record a user stop. Queued rows become `cancelled`; a claimed row
   * keeps its status/lease (the owner finishes the cancellation) but carries
   * `cancelRequested`, which recovery and re-claim paths refuse to run.
   */
  async persistCancelRequest(
    jobId: JobId,
    status: ExecutionJob["status"],
    nowIso: string,
  ): Promise<void> {
    const terminal = status === "cancelled";
    await EnterpriseJob.updateOne(
      { jobId: String(jobId), status: { $nin: ["completed", "dead_letter"] } },
      {
        $set: {
          cancelRequested: true,
          updatedAt: nowIso,
          ...(terminal ? { status: "cancelled", completedAt: nowIso } : {}),
        },
      },
      { maxTimeMS: 15_000 },
    );
  }

  async hydrate(jobId: JobId): Promise<ExecutionJob | undefined> {
    // Always prefer durable Mongo state for claim/recovery decisions so a
    // stale in-memory cache cannot keep tryClaim failing forever.
    const light = this.lightProjectionFor(jobId);
    let doc = await EnterpriseJob.findOne({ jobId: String(jobId) }, light)
      .maxTimeMS(15_000)
      .lean();
    if (!doc) {
      return this.cache.get(String(jobId));
    }
    // A finished job whose result this process does not hold needs the full row.
    if (
      light &&
      isTerminalStatus((doc as unknown as ExecutionJob).status) &&
      this.cache.get(String(jobId))?.resultSummary === undefined
    ) {
      doc =
        (await EnterpriseJob.findOne({ jobId: String(jobId) })
          .maxTimeMS(15_000)
          .lean()) ?? doc;
    }
    const job = this.withCachedPayload(doc as unknown as ExecutionJob);
    this.cache.set(String(jobId), job);
    return job;
  }

  list(): readonly ExecutionJob[] {
    return [...this.cache.values()];
  }

  async hydrateAll(): Promise<void> {
    const docs = await EnterpriseJob.find().lean();
    for (const doc of docs) {
      this.cache.set(
        String(doc.jobId),
        this.withCachedPayload(doc as unknown as ExecutionJob),
      );
    }
  }

  /** Jobs persisted as runnable but lost from in-memory queues after restart. */
  async listRunnableFromDatabase(): Promise<readonly ExecutionJob[]> {
    const docs = await EnterpriseJob.collection
      .find(
        { status: { $in: ["queued", "retrying"] }, cancelRequested: { $ne: true } },
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
        // One unreadable row must not abort the scan or be re-fetched every
        // tick: failures back off exponentially (with jitter) per job.
        const backoff = this.hydrateBackoff.get(jobId);
        if (backoff && Date.now() < backoff.retryAtMs) continue;
        try {
          job = await this.hydrate(doc.jobId as JobId);
          this.hydrateBackoff.delete(jobId);
        } catch (err) {
          const failures = (backoff?.failures ?? 0) + 1;
          const delayMs = Math.min(
            HYDRATE_BACKOFF_MAX_MS,
            HYDRATE_BACKOFF_BASE_MS * 2 ** (failures - 1),
          );
          const retryAtMs = Date.now() + delayMs * (0.5 + Math.random() * 0.5);
          this.hydrateBackoff.set(jobId, { failures, retryAtMs });
          console.warn(
            JSON.stringify({
              scope: "execution.job_store",
              event: "runnable_job_hydrate_failed",
              jobId,
              failures,
              retryInMs: Math.round(retryAtMs - Date.now()),
              error: err instanceof Error ? err.message : String(err),
            }),
          );
          continue;
        }
      }
      if (job && hasOmittedInlineData(job.payload)) {
        // Its images were never written to Mongo (see omitInlineData) and the
        // process that held them restarted — it can never run. Close it out
        // instead of skipping it on every scan forever; the client sees it fail.
        const lastError =
          "Job was interrupted by a server restart before it ran; its attached images were not saved. Please try again.";
        const nowIso = new Date().toISOString();
        try {
          await EnterpriseJob.collection.updateOne(
            { jobId, status: { $in: ["queued", "retrying"] } },
            {
              $set: {
                status: "dead_letter",
                queueKind: "dead_letter",
                lastError,
                updatedAt: nowIso,
                completedAt: nowIso,
              },
            },
          );
          this.cache.set(jobId, {
            ...job,
            status: "dead_letter",
            queueKind: "dead_letter",
            lastError,
            updatedAt: nowIso,
            completedAt: nowIso,
          } as ExecutionJob);
          console.warn(
            `[Direct] job dead-lettered | jobId=${jobId} | reason=inline_media_not_persisted`,
          );
        } catch (err) {
          console.warn(
            `[Direct] job recovery skipped | jobId=${jobId} | reason=inline_media_not_persisted | deadLetterFailed=${err instanceof Error ? err.message : String(err)}`,
          );
        }
        continue;
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
    // Hard cap: lease reclaims and restarts must never re-run a job beyond its
    // configured attempts (a job once ran 76 times against paid providers).
    if (
      existing &&
      typeof existing.maxAttempts === "number" &&
      existing.maxAttempts > 0 &&
      (existing.attempt ?? 0) >= existing.maxAttempts
    ) {
      const lastError = `attempt cap reached (${existing.attempt}/${existing.maxAttempts}) — not re-run`;
      await EnterpriseJob.updateOne(
        { jobId: String(jobId), status: { $in: ["queued", "retrying"] } },
        {
          $set: {
            status: "dead_letter",
            queueKind: "dead_letter",
            lastError,
            completedAt: nowIso,
            updatedAt: nowIso,
          },
        },
        { maxTimeMS: 15_000 },
      );
      this.cache.set(String(jobId), {
        ...existing,
        status: "dead_letter",
        queueKind: "dead_letter",
        lastError,
        completedAt: nowIso,
        updatedAt: nowIso,
      });
      console.warn(
        JSON.stringify({
          scope: "execution.job_store",
          event: "attempt_cap_dead_letter",
          jobId: String(jobId),
          attempt: existing.attempt,
          maxAttempts: existing.maxAttempts,
        }),
      );
      return undefined;
    }
    const nextAttempt = (existing?.attempt ?? 0) + 1;
    const doc = await EnterpriseJob.findOneAndUpdate(
      {
        jobId: String(jobId),
        status: { $in: ["queued", "retrying"] },
        cancelRequested: { $ne: true },
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
      { new: true, maxTimeMS: 15_000, projection: this.lightProjectionFor(jobId) }
    ).lean();
    if (!doc) return undefined;
    const job = this.withCachedPayload(doc as unknown as ExecutionJob);
    this.cache.set(String(jobId), job);
    return job;
  }

  /**
   * Reclaim only when durable lease ownership has genuinely expired.
   * Active owners renew leaseExpiresAt; reclaim CAS fails if renewed.
   */
  async reclaimExpired(nowIso: string, nowMs: number): Promise<readonly ExecutionJob[]> {
    const nowIsoLease = new Date(nowMs).toISOString();
    const docs = await EnterpriseJob.find(
      {
        status: { $in: ["reserved", "running"] },
        leaseExpiresAt: { $lte: nowIsoLease },
      },
      { jobId: 1 },
    )
      .maxTimeMS(15_000)
      .lean();

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
        { new: true, maxTimeMS: 15_000, projection: this.lightProjectionFor(doc.jobId) }
      ).lean();
      if (!updated) continue;
      const job = {
        ...this.withCachedPayload(updated as unknown as ExecutionJob),
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
      { new: true, maxTimeMS: 5_000, projection: LIGHT_JOB_PROJECTION },
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
      ...this.withCachedPayload(doc as unknown as ExecutionJob),
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
      { new: true, maxTimeMS: 5_000, projection: this.lightProjectionFor(jobId) },
    ).lean();
    if (!doc) return false;
    this.cache.set(
      String(jobId),
      this.withCachedPayload(doc as unknown as ExecutionJob),
    );
    return true;
  }
}
