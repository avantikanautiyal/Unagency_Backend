/**
 * Distributed Execution Engine — in-memory job system.
 */

import { failure, success, type Result } from "../../../core/result";
import { ValidationError } from "../../../core/errors";
import type { IDistributedExecutionEngine, IJobExecutor, IJobStore } from "../interfaces/execution";
import type {
  BatchJobSpec,
  BatchRecord,
  DeadLetterRecord,
  EnqueueJobInput,
  ExecutionJob,
  ExecutionMetricsSnapshot,
  JobId,
  JobProgressUpdate,
  LeaseId,
  WorkerId,
  WorkerRecord,
} from "../contracts/job";
import { asJobId } from "../contracts/job";
import type { QueueKind, WorkerKind } from "../contracts/enums";
import { DEFAULT_LEASE_TTL_MS, DEFAULT_RETRY_POLICY } from "../constants";
import { InMemoryJobStore } from "../persistence/in-memory-job-store";
import { QueueRegistry } from "../queues/queue-registry";
import { JobScheduler } from "../scheduler/job-scheduler";
import { JobDispatcher } from "../dispatcher/job-dispatcher";
import { priorityScore } from "../priorities/priority";
import {
  computeRetryDelayMs,
  classifyError,
  isRetryable,
} from "../retries/retry-policy";
import { LeaseManager, ReservationManager } from "../leases/lease-manager";
import { ConcurrencyLimiter } from "../concurrency/concurrency-limiter";
import { ThrottleController } from "../throttling/throttle-controller";
import { ProgressTracker } from "../progress/progress-tracker";
import { DeadLetterStore } from "../dead-letter/dead-letter-store";
import { ExecutionMonitor } from "../monitoring/execution-monitor";
import { BatchRegistry } from "../batching/batch-registry";
import { WorkerRegistry } from "../workers/worker-registry";
import { requestCancellation, advanceCancellation } from "../cancellation/cancellation";
import { transitionJob } from "../lifecycle/job-lifecycle";

export interface DistributedExecutionEngineDeps {
  readonly executor: IJobExecutor;
  readonly store?: IJobStore;
  readonly maxConcurrency?: number;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export class DistributedExecutionEngine implements IDistributedExecutionEngine {
  private readonly store: IJobStore;
  private readonly queues: QueueRegistry;
  private readonly scheduler: JobScheduler;
  private readonly dispatcher: JobDispatcher;
  private readonly leases: LeaseManager;
  private readonly reservations: ReservationManager;
  private readonly concurrency: ConcurrencyLimiter;
  private readonly throttle: ThrottleController;
  private readonly progressTracker: ProgressTracker;
  private readonly deadLetters: DeadLetterStore;
  private readonly monitor: ExecutionMonitor;
  private readonly batches: BatchRegistry;
  private readonly workers: WorkerRegistry;
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;
  private readonly createId: (prefix: string) => string;
  private shutDown = false;
  /** retryAtMs by jobId for scheduled retries */
  private readonly retryAt = new Map<string, number>();
  /** Jobs already handed to the in-memory queue this process (avoid duplicate recovery). */
  private readonly recoveryDispatched = new Set<string>();
  /** Jobs this process is currently executing — never reclaim/re-claim them. */
  private readonly inFlightJobIds = new Set<string>();

  constructor(private readonly deps: DistributedExecutionEngineDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
    this.createId = deps.createId ?? ((p) => `${p}_${this.clockMs()}`);
    this.store = deps.store ?? new InMemoryJobStore();
    this.queues = new QueueRegistry(this.clockMs);
    this.scheduler = new JobScheduler(this.store, this.queues, this.clockMs);
    this.dispatcher = new JobDispatcher(this.queues);
    this.leases = new LeaseManager(this.createId, this.clockMs);
    this.reservations = new ReservationManager(this.createId, this.clockMs);
    this.concurrency = new ConcurrencyLimiter(deps.maxConcurrency ?? 8);
    this.throttle = new ThrottleController(this.clockMs);
    this.progressTracker = new ProgressTracker();
    this.deadLetters = new DeadLetterStore();
    this.monitor = new ExecutionMonitor(this.clockMs);
    this.batches = new BatchRegistry(this.createId, this.nowIso);
    this.workers = new WorkerRegistry(this.createId, this.nowIso);
    // Default execution worker
    this.workers.register("execution", 4);
    this.workers.register("retry", 2);
    this.workers.register("recovery", 1);
  }

  async enqueue(input: EnqueueJobInput): Promise<Result<ExecutionJob>> {
    if (this.shutDown) {
      return failure(new ValidationError("execution platform is shut down"));
    }
    if (!input.payload?.rawPrompt?.trim()) {
      return failure(new ValidationError("rawPrompt is required"));
    }

    const retryPolicy = {
      ...DEFAULT_RETRY_POLICY,
      ...input.retryPolicy,
    };

    const queueKind: QueueKind =
      input.queueKind ??
      (input.scheduledAt
        ? "scheduled"
        : input.priority && input.priority !== "normal"
          ? "priority"
          : "immediate");

    const job: ExecutionJob = {
      jobId: asJobId(this.createId("job")),
      queueKind,
      status: "queued",
      priority: input.priority ?? "normal",
      payload: input.payload,
      attempt: 0,
      maxAttempts: retryPolicy.maxAttempts,
      retryPolicy,
      scheduledAt: input.scheduledAt,
      batchId: input.batchId,
      progressPercent: 0,
      createdAt: this.nowIso(),
      updatedAt: this.nowIso(),
      cancelRequested: false,
    };

    this.store.save(job);
    this.enqueueToQueue(job);
    this.publishProgress(job, "queued", 0, "queued");
    return success(job);
  }

  async enqueueBatch(spec: BatchJobSpec): Promise<Result<BatchRecord>> {
    if (!spec.jobs.length) {
      return failure(new ValidationError("batch requires at least one job"));
    }
    const jobIds: JobId[] = [];
    const batchProbe = this.batches.create(spec, []);
    for (const j of spec.jobs) {
      const enq = await this.enqueue({
        ...j,
        batchId: batchProbe.batchId,
        queueKind: j.queueKind ?? "batch",
      });
      if (!enq.ok) return enq;
      jobIds.push(enq.value.jobId);
    }
    const record = this.batches.update(batchProbe.batchId, {
      jobIds,
      status: "queued",
    })!;
    return success(record);
  }

  getJob(jobId: JobId): Result<ExecutionJob> {
    const job = this.store.get(jobId);
    if (!job) return failure(new ValidationError("job not found"));
    return success(job);
  }

  listJobs(filter?: {
    status?: string;
    queueKind?: QueueKind;
  }): Result<readonly ExecutionJob[]> {
    let list = this.store.list();
    if (filter?.status) list = list.filter((j) => j.status === filter.status);
    if (filter?.queueKind) {
      list = list.filter((j) => j.queueKind === filter.queueKind);
    }
    return success(list);
  }

  async cancel(jobId: JobId, _reason?: string): Promise<Result<ExecutionJob>> {
    const job = this.store.get(jobId);
    if (!job) return failure(new ValidationError("job not found"));
    const cancelled = requestCancellation(job, this.nowIso());
    if (!cancelled.ok) return cancelled;
    this.store.save(cancelled.value);
    this.queues.get(job.queueKind).remove(jobId);
    this.monitor.recordCancellation();
    this.publishProgress(cancelled.value, cancelled.value.status, cancelled.value.progressPercent, "cancel");
    this.refreshBatch(job.batchId);
    return success(cancelled.value);
  }

  async cancelBatch(batchId: string, reason?: string): Promise<Result<BatchRecord>> {
    const batch = this.batches.get(batchId);
    if (!batch) return failure(new ValidationError("batch not found"));
    for (const id of batch.jobIds) {
      await this.cancel(id, reason);
    }
    const updated = this.batches.update(batchId, {
      cancelRequested: true,
      status: "cancelled",
      progressPercent: 100,
    })!;
    return success(updated);
  }

  async pause(jobId: JobId): Promise<Result<ExecutionJob>> {
    const job = this.store.get(jobId);
    if (!job) return failure(new ValidationError("job not found"));
    const t = transitionJob(job.status, "paused");
    if (!t.ok) return t;
    const next = { ...job, status: t.value, updatedAt: this.nowIso() };
    this.store.save(next);
    return success(next);
  }

  async resume(jobId: JobId): Promise<Result<ExecutionJob>> {
    const job = this.store.get(jobId);
    if (!job) return failure(new ValidationError("job not found"));
    if (job.status !== "paused") {
      return failure(new ValidationError("job is not paused"));
    }
    const next = {
      ...job,
      status: "queued" as const,
      updatedAt: this.nowIso(),
    };
    this.store.save(next);
    this.enqueueToQueue(next);
    return success(next);
  }

  async tick(maxJobs = 4): Promise<Result<readonly ExecutionJob[]>> {
    if (this.shutDown) {
      return failure(new ValidationError("execution platform is shut down"));
    }

    await this.ensureRunnableJobsQueued();

    this.scheduler.promoteDue();
    for (const job of this.store.list()) {
      if (job.status === "retrying") {
        const due = this.retryAt.get(String(job.jobId));
        if (due != null && due <= this.clockMs()) {
          const reset: ExecutionJob = {
            ...job,
            status: "queued",
            queueKind: "immediate",
            updatedAt: this.nowIso(),
          };
          this.store.save(reset);
          this.retryAt.delete(String(job.jobId));
          // ensure on immediate queue (scheduled may have already promoted)
          if (!this.queues.get("immediate").list().includes(job.jobId)) {
            this.queues.get("immediate").enqueue(job.jobId);
          }
        }
      }
    }
    this.promoteReadyRetries();

    // M9.4A: reclaim stale leases before claiming new work
    if (typeof this.store.reclaimExpired === "function") {
      try {
        const recovered = await this.store.reclaimExpired(
          this.nowIso(),
          this.clockMs()
        );
        for (const job of recovered) {
          if (this.inFlightJobIds.has(String(job.jobId))) {
            console.log(
              `[Direct] job recovery skipped | jobId=${String(job.jobId)} | reason=in_flight`,
            );
            continue;
          }
          if (
            !this.queues.get("immediate").list().includes(job.jobId) &&
            !this.recoveryDispatched.has(String(job.jobId))
          ) {
            this.recoveryDispatched.add(String(job.jobId));
            this.queues.get("immediate").enqueue(job.jobId);
          }
          console.log(
            `[Direct] job recovery reclaimed | jobId=${String(job.jobId)} | reason=stale`,
          );
        }
      } catch (err) {
        // Reclaim must not abort the tick — new jobs still need to run.
        console.warn(
          `⚙️  [Direct] lease reclaim failed | ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    const completed: ExecutionJob[] = [];
    for (let i = 0; i < maxJobs; i += 1) {
      if (!this.concurrency.tryAcquire()) break;
      const worker =
        this.workers.pickAvailable("execution") ?? this.workers.pickAvailable();
      if (!worker) {
        this.concurrency.release();
        break;
      }

      const candidate = this.dispatcher.peekNext();
      if (!candidate) {
        this.concurrency.release();
        break;
      }

      let job = this.store.get(candidate.jobId);
      if (!job && typeof this.store.hydrate === "function") {
        job = await this.store.hydrate(candidate.jobId);
      }
      if (!job) {
        this.dispatcher.drop(candidate.jobId, candidate.queueKind);
        this.recoveryDispatched.delete(String(candidate.jobId));
        console.log(
          `[Direct] job recovery skipped | jobId=${String(candidate.jobId)} | reason=missing_from_store`,
        );
        this.concurrency.release();
        continue;
      }
      if (
        job.status === "cancelled" ||
        job.status === "paused" ||
        job.status === "completed" ||
        job.status === "failed" ||
        job.status === "dead_letter"
      ) {
        this.dispatcher.drop(candidate.jobId, candidate.queueKind);
        this.recoveryDispatched.delete(String(candidate.jobId));
        console.log(
          `[Direct] job recovery skipped | jobId=${String(job.jobId)} | reason=already_${job.status}`,
        );
        this.concurrency.release();
        continue;
      }
      if (this.inFlightJobIds.has(String(job.jobId))) {
        this.dispatcher.drop(candidate.jobId, candidate.queueKind);
        this.concurrency.release();
        continue;
      }

      if (!this.dispatcher.take(candidate.jobId, candidate.queueKind)) {
        this.concurrency.release();
        continue;
      }

      const next = { jobId: candidate.jobId, queueKind: candidate.queueKind };

      const limits = {
        organizationId: job.payload.organizationId,
        workspaceId: job.payload.workspaceId,
        maxConcurrent: 10,
        maxPerMinute: 120,
      };
      if (!this.throttle.tryEnter(limits)) {
        this.queues.get(next.queueKind).enqueue(next.jobId);
        this.concurrency.release();
        break;
      }

      let reservation:
        | ReturnType<ReservationManager["reserve"]>
        | undefined;
      let lease: ReturnType<LeaseManager["acquire"]> | undefined;
      let running: ExecutionJob | undefined;

      try {
        if (typeof this.store.tryClaim === "function") {
          const claimed = await this.store.tryClaim(
            job.jobId,
            worker.workerId,
            DEFAULT_LEASE_TTL_MS,
            this.nowIso(),
          );
          if (!claimed) {
            const fresh =
              typeof this.store.hydrate === "function"
                ? await this.store.hydrate(job.jobId)
                : this.store.get(job.jobId);
            if (
              fresh &&
              (fresh.status === "queued" || fresh.status === "retrying")
            ) {
              this.enqueueToQueue({ ...fresh, queueKind: next.queueKind });
            } else {
              this.recoveryDispatched.delete(String(job.jobId));
              console.log(
                `[Direct] job recovery skipped | jobId=${String(job.jobId)} | reason=already_claimed`,
              );
            }
            continue;
          }
          console.log(
            `[Direct] job claimed | jobId=${String(claimed.jobId)} | attempt=${claimed.attempt}`,
          );
          reservation = this.reservations.reserve(worker.workerId, claimed.jobId);
          lease = this.leases.acquire(
            worker.workerId,
            claimed.jobId,
            DEFAULT_LEASE_TTL_MS,
          );
          running = {
            ...claimed,
            status: "reserved",
            reservedBy: worker.workerId,
            reservationId: reservation.reservationId,
            leaseId: lease.leaseId,
            leaseExpiresAt:
              claimed.leaseExpiresAt ??
              new Date(lease.expiresAtMs).toISOString(),
            updatedAt: this.nowIso(),
          };
          this.store.save(running);
        } else {
          reservation = this.reservations.reserve(worker.workerId, job.jobId);
          lease = this.leases.acquire(
            worker.workerId,
            job.jobId,
            DEFAULT_LEASE_TTL_MS,
          );
          running = {
            ...job,
            status: "reserved",
            reservedBy: worker.workerId,
            reservationId: reservation.reservationId,
            leaseId: lease.leaseId,
            leaseExpiresAt: new Date(lease.expiresAtMs).toISOString(),
            updatedAt: this.nowIso(),
            attempt: job.attempt + 1,
          };
          this.store.save(running);
          console.log(
            `[Direct] job claimed | jobId=${String(running.jobId)} | attempt=${running.attempt}`,
          );
        }

        this.workers.adjustActive(worker.workerId, 1);
        this.publishProgress(running, "reserved", 5, "reserved");

        running = {
          ...running,
          status: "running",
          startedAt: this.nowIso(),
          progressPercent: 10,
          updatedAt: this.nowIso(),
        };
        this.store.save(running);
        await this.persistJobIfSupported(running);
        this.publishProgress(running, "running", 10, "running");
        console.log(
          `[Direct] job execution started | jobId=${String(running.jobId)}`,
        );

        if (running.cancelRequested) {
          const advanced = advanceCancellation(running, this.nowIso());
          if (advanced.ok) {
            this.store.save(advanced.value);
            await this.persistJobIfSupported(advanced.value);
            completed.push(advanced.value);
          }
          continue;
        }

        const signal: { cancelled: boolean } = {
          cancelled: running.cancelRequested,
        };
        const latest = this.store.get(running.jobId);
        if (latest?.cancelRequested) signal.cancelled = true;

        this.inFlightJobIds.add(String(running.jobId));
        const heartbeatMs = Math.max(5_000, Math.floor(DEFAULT_LEASE_TTL_MS / 3));
        const leaseId = lease?.leaseId;
        const heartbeat = leaseId
          ? setInterval(() => {
              void this.renewInFlightLease(running, worker.workerId, leaseId);
            }, heartbeatMs)
          : undefined;
        if (heartbeat && typeof heartbeat.unref === "function") heartbeat.unref();
        let result: Awaited<ReturnType<IJobExecutor["execute"]>>;
        try {
          result = await this.deps.executor.execute(running, signal);
        } finally {
          if (heartbeat) clearInterval(heartbeat);
          this.inFlightJobIds.delete(String(running.jobId));
        }

        const owner = this.store.get(running.jobId);
        if (owner && owner.attempt > running.attempt) {
          console.log(
            `[Direct] job execution discarded | jobId=${String(running.jobId)} | reason=superseded_attempt | attempt=${running.attempt} current=${owner.attempt}`,
          );
          continue;
        }

        const after = this.store.get(running.jobId);
        if (after?.cancelRequested || after?.status === "cancel_requested") {
          const advanced = advanceCancellation(
            { ...running, cancelRequested: true, status: "cancel_requested" },
            this.nowIso(),
          );
          if (advanced.ok) {
            const cancelled = {
              ...advanced.value,
              status: "cancelled" as const,
              completedAt: this.nowIso(),
            };
            this.store.save(cancelled);
            await this.persistJobIfSupported(cancelled);
            completed.push(this.store.get(running.jobId)!);
            this.monitor.recordCancellation();
          }
          continue;
        }

        const queueMs =
          Date.parse(running.startedAt ?? running.createdAt) -
          Date.parse(running.createdAt);

        if (result.ok) {
          const done: ExecutionJob = {
            ...running,
            status: "completed",
            progressPercent: 100,
            currentStage: result.value.stages?.slice(-1)[0],
            currentProvider: result.value.currentProvider,
            resultSummary: result.value.summary,
            completedAt: this.nowIso(),
            updatedAt: this.nowIso(),
          };
          this.store.save(done);
          await this.persistJobIfSupported(done);
          this.recoveryDispatched.delete(String(done.jobId));
          this.publishProgress(done, "completed", 100, "completed");
          this.monitor.recordCompletion(
            result.value.durationMs,
            Math.max(0, queueMs),
            result.value.durationMs,
          );
          completed.push(done);
          this.refreshBatch(done.batchId);
          console.log(
            `[Direct] job execution completed | jobId=${String(done.jobId)} | status=completed`,
          );
        } else {
          const errMsg = result.error.message;
          const failureClass = classifyError(errMsg);
          const failedBase: ExecutionJob = {
            ...running,
            status: "failed",
            lastError: errMsg,
            updatedAt: this.nowIso(),
          };

          if (
            isRetryable(running.retryPolicy, failureClass) &&
            running.attempt < running.maxAttempts
          ) {
            const delay = computeRetryDelayMs(
              running.retryPolicy,
              running.attempt,
            );
            const retrying: ExecutionJob = {
              ...failedBase,
              status: "retrying",
              updatedAt: this.nowIso(),
            };
            this.store.save(retrying);
            await this.persistJobIfSupported(retrying);
            this.retryAt.set(String(retrying.jobId), this.clockMs() + delay);
            this.queues.get("scheduled").enqueue(
              retrying.jobId,
              this.clockMs() + delay,
            );
            this.monitor.recordRetry();
            this.publishProgress(retrying, "retrying", 20, "retrying");
            completed.push(retrying);
            console.log(
              `[Direct] job execution completed | jobId=${String(retrying.jobId)} | status=retrying`,
            );
          } else {
            const dead = this.deadLetters.move(
              failedBase,
              errMsg,
              this.nowIso(),
            );
            const dlq: ExecutionJob = {
              ...failedBase,
              status: "dead_letter",
              queueKind: "dead_letter",
              completedAt: this.nowIso(),
            };
            this.store.save(dlq);
            await this.persistJobIfSupported(dlq);
            this.recoveryDispatched.delete(String(dlq.jobId));
            this.queues.get("dead_letter").enqueue(dlq.jobId);
            this.monitor.recordFailure(0);
            this.publishProgress(dlq, "dead_letter", 100, dead.reason);
            completed.push(dlq);
            this.refreshBatch(dlq.batchId);
            console.log(
              `[Direct] job execution completed | jobId=${String(dlq.jobId)} | status=dead_letter`,
            );
          }
        }
      } finally {
        if (reservation && lease) {
          this.cleanupSlot(
            worker.workerId,
            reservation.reservationId,
            lease.leaseId,
            limits,
          );
        } else {
          this.throttle.exit(limits);
          this.concurrency.release();
        }
      }
    }

    return success(completed);
  }

  getProgress(jobId: JobId): Result<JobProgressUpdate | undefined> {
    return success(this.progressTracker.getLatest(jobId));
  }

  listDeadLetters(): Result<readonly DeadLetterRecord[]> {
    return success(this.deadLetters.list());
  }

  async requeueDeadLetter(jobId: JobId): Promise<Result<ExecutionJob>> {
    const dl = this.deadLetters.get(jobId);
    if (!dl) return failure(new ValidationError("dead letter not found"));
    const job = this.store.get(jobId);
    if (!job) return failure(new ValidationError("job not found"));
    this.deadLetters.remove(jobId);
    this.queues.get("dead_letter").remove(jobId);
    const next: ExecutionJob = {
      ...job,
      status: "queued",
      queueKind: "immediate",
      attempt: 0,
      lastError: undefined,
      updatedAt: this.nowIso(),
    };
    this.store.save(next);
    this.queues.get("immediate").enqueue(next.jobId);
    return success(next);
  }

  metrics(): Result<ExecutionMetricsSnapshot> {
    return success(
      this.monitor.snapshot({
        queueLengths: this.queues.lengths(),
        workerUtilization: this.workers.utilization(),
        deadLetterCount: this.deadLetters.count(),
        activeJobs: this.store.list().filter((j) => j.status === "running").length,
        nowIso: this.nowIso(),
      })
    );
  }

  registerWorker(kind: WorkerKind, capacity = 2): Result<WorkerRecord> {
    return success(this.workers.register(kind, capacity));
  }

  listWorkers(): Result<readonly WorkerRecord[]> {
    return success(this.workers.list());
  }

  async shutdown(): Promise<Result<void>> {
    this.shutDown = true;
    // Graceful: release in-flight claims to recoverable queued state (not permanent RUNNING)
    for (const job of this.store.list()) {
      if (job.status === "running" || job.status === "reserved") {
        this.store.save({
          ...job,
          status: "queued",
          reservedBy: undefined,
          reservationId: undefined,
          leaseId: undefined,
          leaseExpiresAt: undefined,
          cancelRequested: false,
          updatedAt: this.nowIso(),
          lastError: job.lastError ?? "shutdown_interrupted",
        });
      }
    }
    return success(undefined);
  }

  /** Simulate worker crash — releases lease; recovery worker can requeue. */
  failWorker(workerId: string): void {
    this.workers.markUnhealthy(workerId as never);
    for (const job of this.store.list()) {
      if (String(job.reservedBy) === workerId && job.status === "running") {
        const recovered: ExecutionJob = {
          ...job,
          status: "queued",
          reservedBy: undefined,
          reservationId: undefined,
          leaseId: undefined,
          updatedAt: this.nowIso(),
        };
        this.store.save(recovered);
        this.queues.get("immediate").enqueue(recovered.jobId);
      }
    }
  }

  /** Re-enqueue durable queued jobs that are not present in in-memory queue backends. */
  private async ensureRunnableJobsQueued(): Promise<void> {
    if (typeof this.store.listRunnableFromDatabase !== "function") return;
    try {
      const jobs = await this.store.listRunnableFromDatabase();
      let enqueued = 0;
      let skipped = 0;
      for (const job of jobs) {
        let fresh = job;
        if (typeof this.store.hydrate === "function") {
          const hydrated = await this.store.hydrate(job.jobId);
          if (hydrated) fresh = hydrated;
        }
        if (fresh.status !== "queued" && fresh.status !== "retrying") {
          skipped += 1;
          this.recoveryDispatched.delete(String(fresh.jobId));
          continue;
        }
        if (
          this.isJobEnqueued(fresh.jobId) ||
          this.recoveryDispatched.has(String(fresh.jobId))
        ) {
          skipped += 1;
          continue;
        }
        if (!fresh.payload?.rawPrompt?.trim()) {
          skipped += 1;
          console.log(
            `[Direct] job recovery skipped | jobId=${String(fresh.jobId)} | reason=invalid_payload`,
          );
          continue;
        }
        this.recoveryDispatched.add(String(fresh.jobId));
        this.enqueueToQueue({
          ...fresh,
          queueKind:
            fresh.queueKind === "dead_letter" || fresh.queueKind === "scheduled"
              ? "immediate"
              : fresh.queueKind,
        });
        enqueued += 1;
      }
      if (jobs.length > 0) {
        console.log(
          `[Direct] recovery scan | queued=${jobs.length} | reclaimable=${enqueued} | skipped=${skipped}`,
        );
      }
    } catch (err) {
      console.warn(
        `[Direct] queued job recovery failed | ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async persistJobIfSupported(job: ExecutionJob): Promise<void> {
    if (typeof this.store.persist === "function") {
      try {
        await this.store.persist(job);
      } catch (err) {
        console.warn(
          `[Direct] job persist failed | jobId=${String(job.jobId)} | status=${job.status} | ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private async renewInFlightLease(
    running: ExecutionJob,
    workerId: WorkerId,
    leaseId: LeaseId,
  ): Promise<void> {
    if (!this.inFlightJobIds.has(String(running.jobId))) return;
    const latest = this.store.get(running.jobId);
    if (
      !latest ||
      (latest.status !== "running" && latest.status !== "reserved") ||
      latest.attempt !== running.attempt
    ) {
      return;
    }
    this.leases.renew(leaseId, DEFAULT_LEASE_TTL_MS);
    if (typeof this.store.renewLease === "function") {
      await this.store.renewLease(
        running.jobId,
        DEFAULT_LEASE_TTL_MS,
        this.nowIso(),
        workerId,
      );
      return;
    }
    const leaseExpiresAt = new Date(
      this.clockMs() + DEFAULT_LEASE_TTL_MS,
    ).toISOString();
    const next = { ...latest, leaseExpiresAt, updatedAt: this.nowIso() };
    this.store.save(next);
    await this.persistJobIfSupported(next);
  }

  private isJobEnqueued(jobId: JobId): boolean {
    const kinds: QueueKind[] = [
      "priority",
      "immediate",
      "retry",
      "batch",
      "streaming",
      "long_running",
      "scheduled",
    ];
    return kinds.some((kind) => this.queues.get(kind).list().includes(jobId));
  }

  private enqueueToQueue(job: ExecutionJob): void {
    const q = this.queues.get(job.queueKind);
    if (job.queueKind === "priority") {
      q.enqueue(job.jobId, priorityScore(job.priority));
    } else if (job.queueKind === "scheduled") {
      const due = job.scheduledAt ? Date.parse(job.scheduledAt) : this.clockMs();
      q.enqueue(job.jobId, due);
    } else {
      q.enqueue(job.jobId);
    }
  }

  private promoteReadyRetries(): void {
    // scheduled queue handles delayed retries via due timestamps
  }

  private publishProgress(
    job: ExecutionJob,
    status: ExecutionJob["status"],
    pct: number,
    stage: string
  ): void {
    this.progressTracker.publish({
      jobId: job.jobId,
      status,
      progressPercent: pct,
      currentStage: stage,
      currentProvider: job.currentProvider,
      estimatedCompletionAt: job.estimatedCompletionAt,
      at: this.nowIso(),
    });
  }

  private cleanupSlot(
    workerId: WorkerRecord["workerId"],
    reservationId: NonNullable<ExecutionJob["reservationId"]>,
    leaseId: NonNullable<ExecutionJob["leaseId"]>,
    limits: { organizationId?: string; workspaceId?: string; maxConcurrent: number }
  ): void {
    this.workers.adjustActive(workerId, -1);
    this.reservations.release(reservationId);
    this.leases.release(leaseId);
    this.throttle.exit(limits);
    this.concurrency.release();
  }

  private refreshBatch(batchId: ExecutionJob["batchId"]): void {
    if (!batchId) return;
    const batch = this.batches.get(batchId);
    if (!batch) return;
    const jobs = batch.jobIds
      .map((id) => this.store.get(id))
      .filter(Boolean) as ExecutionJob[];
    const done = jobs.filter((j) =>
      ["completed", "failed", "dead_letter", "cancelled"].includes(j.status)
    ).length;
    const pct = jobs.length ? Math.round((done / jobs.length) * 100) : 0;
    const allCancelled = jobs.every((j) => j.status === "cancelled");
    const allDone = done === jobs.length;
    const anyDead = jobs.some((j) => j.status === "dead_letter" || j.status === "failed");
    this.batches.update(batchId, {
      progressPercent: pct,
      status: allCancelled
        ? "cancelled"
        : allDone
          ? anyDead
            ? "failed"
            : "completed"
          : jobs.some((j) => j.status === "running")
            ? "running"
            : "queued",
    });
  }
}
