/**
 * Scheduler — promote due scheduled jobs into immediate queue.
 */

import type { IJobStore } from "../interfaces/execution";
import type { QueueRegistry } from "../queues/queue-registry";
import type { JobId } from "../contracts/job";

export class JobScheduler {
  constructor(
    private readonly store: IJobStore,
    private readonly queues: QueueRegistry,
    private readonly clockMs: () => number
  ) {}

  /** Move due scheduled jobs to immediate queue. */
  promoteDue(): readonly JobId[] {
    const promoted: JobId[] = [];
    const scheduled = this.queues.get("scheduled");
    // Drain all currently due
    for (;;) {
      const jobId = scheduled.dequeue();
      if (!jobId) break;
      const job = this.store.get(jobId);
      if (!job) continue;
      this.queues.get("immediate").enqueue(jobId);
      promoted.push(jobId);
    }
    void this.clockMs;
    return promoted;
  }
}
