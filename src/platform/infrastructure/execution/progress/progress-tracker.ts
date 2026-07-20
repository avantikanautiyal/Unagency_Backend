/**
 * Progress event publisher.
 */

import type { JobProgressUpdate, JobId } from "../contracts/job";

export class ProgressTracker {
  private readonly latest = new Map<string, JobProgressUpdate>();
  private readonly history: JobProgressUpdate[] = [];

  publish(update: JobProgressUpdate): void {
    this.latest.set(String(update.jobId), update);
    this.history.push(update);
  }

  getLatest(jobId: JobId): JobProgressUpdate | undefined {
    return this.latest.get(String(jobId));
  }

  list(): readonly JobProgressUpdate[] {
    return [...this.history];
  }
}
