/**
 * Distributed Execution interfaces.
 */

import type { Result } from "../../../intelligence/shared/result";
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

/** Persistence port — in-memory now; Redis/BullMQ/Kafka later. */
export interface IJobStore {
  save(job: ExecutionJob): void;
  get(jobId: JobId): ExecutionJob | undefined;
  list(): readonly ExecutionJob[];
  delete(jobId: JobId): void;
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
