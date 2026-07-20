/**
 * Job and queue contracts.
 */

import type {
  BatchMode,
  JobPriority,
  JobStatus,
  QueueKind,
  RetryStrategy,
  WorkerKind,
} from "./enums";

export type JobId = string & { readonly __brand: "JobId" };
export type BatchId = string & { readonly __brand: "BatchId" };
export type WorkerId = string & { readonly __brand: "WorkerId" };
export type LeaseId = string & { readonly __brand: "LeaseId" };
export type ReservationId = string & { readonly __brand: "ReservationId" };

export function asJobId(id: string): JobId {
  return id as JobId;
}
export function asBatchId(id: string): BatchId {
  return id as BatchId;
}
export function asWorkerId(id: string): WorkerId {
  return id as WorkerId;
}
export function asLeaseId(id: string): LeaseId {
  return id as LeaseId;
}
export function asReservationId(id: string): ReservationId {
  return id as ReservationId;
}

export interface RetryPolicy {
  readonly strategy: RetryStrategy;
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly retryableClasses?: readonly string[];
}

export interface ExecutionJobPayload {
  readonly rawPrompt: string;
  readonly organizationId?: string;
  readonly workspaceId?: string;
  readonly scenarioHint?: string;
  readonly budgetLimit?: number;
  readonly tokenBudgetLimit?: number;
  readonly correlationId?: string;
  readonly capabilityHint?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ExecutionJob {
  readonly jobId: JobId;
  readonly queueKind: QueueKind;
  readonly status: JobStatus;
  readonly priority: JobPriority;
  readonly payload: ExecutionJobPayload;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly retryPolicy: RetryPolicy;
  readonly scheduledAt?: string;
  readonly reservedBy?: WorkerId;
  readonly reservationId?: ReservationId;
  readonly leaseId?: LeaseId;
  readonly leaseExpiresAt?: string;
  readonly batchId?: BatchId;
  readonly progressPercent: number;
  readonly currentStage?: string;
  readonly currentProvider?: string;
  readonly estimatedCompletionAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly lastError?: string;
  readonly resultSummary?: Readonly<Record<string, unknown>>;
  readonly cancelRequested: boolean;
}

export interface EnqueueJobInput {
  readonly payload: ExecutionJobPayload;
  readonly queueKind?: QueueKind;
  readonly priority?: JobPriority;
  readonly retryPolicy?: Partial<RetryPolicy>;
  readonly scheduledAt?: string;
  readonly batchId?: BatchId;
}

export interface JobProgressUpdate {
  readonly jobId: JobId;
  readonly status: JobStatus;
  readonly progressPercent: number;
  readonly currentStage?: string;
  readonly currentProvider?: string;
  readonly estimatedCompletionAt?: string;
  readonly message?: string;
  readonly at: string;
}

export interface BatchJobSpec {
  readonly batchId?: BatchId;
  readonly mode: BatchMode;
  readonly jobs: readonly EnqueueJobInput[];
  readonly name?: string;
}

export interface BatchRecord {
  readonly batchId: BatchId;
  readonly mode: BatchMode;
  readonly name?: string;
  readonly jobIds: readonly JobId[];
  readonly createdAt: string;
  readonly cancelRequested: boolean;
  readonly progressPercent: number;
  readonly status: "queued" | "running" | "completed" | "failed" | "cancelled";
}

export interface WorkerRecord {
  readonly workerId: WorkerId;
  readonly kind: WorkerKind;
  readonly capacity: number;
  readonly activeJobs: number;
  readonly healthy: boolean;
  readonly lastHeartbeatAt: string;
}

export interface DeadLetterRecord {
  readonly jobId: JobId;
  readonly reason: string;
  readonly attempts: number;
  readonly lastError?: string;
  readonly movedAt: string;
  readonly payload: ExecutionJobPayload;
}

export interface ThrottleLimits {
  readonly organizationId?: string;
  readonly workspaceId?: string;
  readonly providerId?: string;
  readonly capabilityId?: string;
  readonly maxConcurrent: number;
  readonly maxPerMinute?: number;
}

export interface ExecutionMetricsSnapshot {
  readonly queueLengths: Readonly<Record<QueueKind, number>>;
  readonly workerUtilization: number;
  readonly retryCount: number;
  readonly failureRate: number;
  readonly averageExecutionMs: number;
  readonly averageQueueMs: number;
  readonly providerTimeMs: number;
  readonly throughputPerMinute: number;
  readonly cancellationRate: number;
  readonly deadLetterCount: number;
  readonly activeJobs: number;
  readonly capturedAt: string;
}
