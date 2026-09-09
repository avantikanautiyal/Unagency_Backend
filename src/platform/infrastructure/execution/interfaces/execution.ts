/**
 * Distributed Execution interfaces.
 */

import type { Result } from "../../../core/result";
import type {
  BatchJobSpec,
  BatchRecord,
  DeadLetterRecord,
  EnqueueJobInput,
  ExecutionJob,
  ExecutionMetricsSnapshot,
  JobId,
  JobProgressUpdate,
  WorkerId,
  WorkerRecord,
} from "../contracts/job";
import type { QueueKind, WorkerKind } from "../contracts/enums";

export interface IDistributedExecutionEngine {
  enqueue(input: EnqueueJobInput): Promise<Result<ExecutionJob>>;
  enqueueBatch(spec: BatchJobSpec): Promise<Result<BatchRecord>>;
  getJob(jobId: JobId): Result<ExecutionJob>;
  listJobs(filter?: { status?: string; queueKind?: QueueKind }): Result<readonly ExecutionJob[]>;
  cancel(jobId: JobId, reason?: string): Promise<Result<ExecutionJob>>;
  cancelBatch(batchId: string, reason?: string): Promise<Result<BatchRecord>>;
  pause(jobId: JobId): Promise<Result<ExecutionJob>>;
  resume(jobId: JobId): Promise<Result<ExecutionJob>>;
  /** Pump workers — reserves + executes available jobs. */
  tick(maxJobs?: number): Promise<Result<readonly ExecutionJob[]>>;
  getProgress(jobId: JobId): Result<JobProgressUpdate | undefined>;
  listDeadLetters(): Result<readonly DeadLetterRecord[]>;
  requeueDeadLetter(jobId: JobId): Promise<Result<ExecutionJob>>;
  metrics(): Result<ExecutionMetricsSnapshot>;
  registerWorker(kind: WorkerKind, capacity?: number): Result<WorkerRecord>;
  listWorkers(): Result<readonly WorkerRecord[]>;
  shutdown(): Promise<Result<void>>;
}

/**
 * Persistence port for execution jobs.
 * Optional tryClaim enables atomic multi-worker claiming (M9.4A).
 */
export interface IJobStore {
  save(job: ExecutionJob): void;
  get(jobId: JobId): ExecutionJob | undefined;
  list(): readonly ExecutionJob[];
  delete(jobId: JobId): void;
  /**
   * Atomically claim a runnable job for a worker.
   * Returns undefined if another worker already claimed it.
   * When present, DistributedExecutionEngine MUST claim before execute.
   */
  tryClaim?(
    jobId: JobId,
    workerId: WorkerId,
    ttlMs: number,
    nowIso: string
  ): Promise<ExecutionJob | undefined>;
  /**
   * Reclaim jobs whose lease expired while reserved/running.
   * Returns requeued jobs (status → queued).
   */
  reclaimExpired?(nowIso: string, nowMs: number): Promise<readonly ExecutionJob[]>;
  /**
   * Extend the claim lease for a still-running job so long website/document
   * generations are not reclaimed as stale mid-execute.
   */
  renewLease?(
    jobId: JobId,
    ttlMs: number,
    nowIso: string,
    workerId?: WorkerId
  ): Promise<boolean>;
  /** Reload queued/retrying jobs from durable storage (Mongo) into the local cache. */
  listRunnableFromDatabase?(): Promise<readonly ExecutionJob[]>;
  /** Load one job from durable storage when the in-memory cache misses. */
  hydrate?(jobId: JobId): Promise<ExecutionJob | undefined>;
  /** Await durable persistence for terminal or in-flight transitions (optional). */
  persist?(job: ExecutionJob): Promise<void>;
}

export interface IQueueBackend {
  readonly kind: QueueKind;
  enqueue(jobId: JobId, score?: number): void;
  dequeue(): JobId | undefined;
  peek(): JobId | undefined;
  remove(jobId: JobId): void;
  length(): number;
  list(): readonly JobId[];
}

export interface IJobExecutor {
  execute(job: ExecutionJob, signal: { cancelled: boolean }): Promise<
    Result<{
      summary: Readonly<Record<string, unknown>>;
      currentProvider?: string;
      stages?: readonly string[];
      durationMs: number;
    }>
  >;
}
