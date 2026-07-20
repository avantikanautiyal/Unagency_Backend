/**
 * Fair-ish dispatcher — picks next queue in rotation with priority bias.
 */

import type { QueueKind } from "../contracts/enums";
import type { JobId } from "../contracts/job";
import type { QueueRegistry } from "../queues/queue-registry";

const DISPATCH_ORDER: readonly QueueKind[] = [
  "priority",
  "immediate",
  "retry",
  "batch",
  "streaming",
  "long_running",
];

export class JobDispatcher {
  private cursor = 0;

  constructor(private readonly queues: QueueRegistry) {}

  /** Dequeue next available job id across queue kinds. */
  next(): { jobId: JobId; queueKind: QueueKind } | undefined {
    const n = DISPATCH_ORDER.length;
    for (let i = 0; i < n; i += 1) {
      const kind = DISPATCH_ORDER[(this.cursor + i) % n]!;
      const jobId = this.queues.get(kind).dequeue();
      if (jobId) {
        this.cursor = (this.cursor + i + 1) % n;
        return { jobId, queueKind: kind };
      }
    }
    return undefined;
  }
}
