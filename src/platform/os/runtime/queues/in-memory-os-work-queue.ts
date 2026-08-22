/**
 * In-memory OS work queue — atomic tryClaim for multi-worker tests.
 * Same CAS semantics as MongoOsWorkQueue.
 */

import type { IOsWorkQueue, OsWorkJob, OsWorkKind } from "../contracts/os-work-job";
import { logOsExecutionEvent } from "../../observability/execution-log";

export class InMemoryOsWorkQueue implements IOsWorkQueue {
  private readonly jobs = new Map<string, OsWorkJob>();
  private readonly claimLocks = new Set<string>();

  clear(): void {
    this.jobs.clear();
    this.claimLocks.clear();
  }

  async enqueue(job: OsWorkJob): Promise<OsWorkJob> {
    const existing = this.jobs.get(job.jobId);
    if (existing) return existing;
    this.jobs.set(job.jobId, job);
    logOsExecutionEvent("queue.job.queued", {
      requestId: job.executionId,
      executionId: job.executionId,
      organizationId: job.organizationId,
      status: "queued",
      taskId: job.taskId,
    });
    return job;
  }

  async tryClaim(
    jobId: string,
    workerId: string,
    leaseMs: number,
    nowIso: string
  ): Promise<OsWorkJob | undefined> {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;
    if (job.status !== "queued" && job.status !== "failed") return undefined;
    if (this.claimLocks.has(jobId)) return undefined;
    this.claimLocks.add(jobId);
    const claimed: OsWorkJob = {
      ...job,
      status: "claimed",
      claimedBy: workerId,
      attempts: job.attempts + 1,
      updatedAt: nowIso,
      leaseExpiresAt: new Date(Date.now() + leaseMs).toISOString(),
    };
    this.jobs.set(jobId, claimed);
    logOsExecutionEvent("queue.job.claimed", {
      requestId: job.executionId,
      executionId: job.executionId,
      organizationId: job.organizationId,
      status: "claimed",
      taskId: job.taskId,
    });
    return claimed;
  }

  async complete(jobId: string, nowIso: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;
    this.jobs.set(jobId, {
      ...job,
      status: "completed",
      updatedAt: nowIso,
    });
    this.claimLocks.delete(jobId);
    logOsExecutionEvent("queue.job.completed", {
      requestId: job.executionId,
      executionId: job.executionId,
      organizationId: job.organizationId,
      status: "completed",
      taskId: job.taskId,
    });
  }

  async fail(
    jobId: string,
    error: string,
    nowIso: string,
    deadLetter?: boolean
  ): Promise<OsWorkJob | undefined> {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;
    const terminal = deadLetter || job.attempts >= job.maxAttempts;
    const next: OsWorkJob = {
      ...job,
      status: terminal ? "dead_letter" : "failed",
      lastError: error,
      updatedAt: nowIso,
    };
    this.jobs.set(jobId, next);
    this.claimLocks.delete(jobId);
    logOsExecutionEvent(
      terminal ? "queue.job.failed" : "queue.job.retried",
      {
        requestId: job.executionId,
        executionId: job.executionId,
        organizationId: job.organizationId,
        status: next.status,
        taskId: job.taskId,
        errorCode: error,
      }
    );
    return next;
  }

  async get(jobId: string): Promise<OsWorkJob | undefined> {
    return this.jobs.get(jobId);
  }

  async listQueued(kind: OsWorkKind): Promise<readonly OsWorkJob[]> {
    return [...this.jobs.values()].filter(
      (j) => j.kind === kind && (j.status === "queued" || j.status === "failed")
    );
  }

  async reclaimExpired(nowIso: string, nowMs: number): Promise<readonly OsWorkJob[]> {
    const recovered: OsWorkJob[] = [];
    for (const [id, job] of this.jobs) {
      if (job.status !== "claimed") continue;
      if (!job.leaseExpiresAt) continue;
      const exp = Date.parse(job.leaseExpiresAt);
      if (!Number.isFinite(exp) || exp > nowMs) continue;
      const reset: OsWorkJob = {
        ...job,
        status: "queued",
        claimedBy: undefined,
        leaseExpiresAt: undefined,
        updatedAt: nowIso,
      };
      this.jobs.set(id, reset);
      this.claimLocks.delete(id);
      recovered.push(reset);
      logOsExecutionEvent("queue.job.recovered", {
        requestId: job.executionId,
        executionId: job.executionId,
        organizationId: job.organizationId,
        status: "queued",
        taskId: job.taskId,
      });
    }
    return recovered;
  }
}
