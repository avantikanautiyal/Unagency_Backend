/**
 * In-memory job persistence — Redis/BullMQ-ready via IJobStore later.
 */

import type { IJobStore } from "../interfaces/execution";
import type { ExecutionJob, JobId } from "../contracts/job";

export class InMemoryJobStore implements IJobStore {
  private readonly jobs = new Map<string, ExecutionJob>();

  save(job: ExecutionJob): void {
    this.jobs.set(String(job.jobId), job);
  }

  get(jobId: JobId): ExecutionJob | undefined {
    return this.jobs.get(String(jobId));
  }

  list(): readonly ExecutionJob[] {
    return [...this.jobs.values()];
  }

  delete(jobId: JobId): void {
    this.jobs.delete(String(jobId));
  }
}
