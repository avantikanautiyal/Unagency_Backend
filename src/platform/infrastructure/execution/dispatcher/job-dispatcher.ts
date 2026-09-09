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
    const peeked = this.peekNext();
    if (!peeked) return undefined;
    if (!this.take(peeked.jobId, peeked.queueKind)) return undefined;
    return peeked;
  }

  /** Inspect the next job without removing it from a queue. */
  peekNext(): { jobId: JobId; queueKind: QueueKind } | undefined {
    const n = DISPATCH_ORDER.length;
    for (let i = 0; i < n; i += 1) {
      const kind = DISPATCH_ORDER[(this.cursor + i) % n]!;
      const jobId = this.queues.get(kind).peek();
      if (jobId) {
        return { jobId, queueKind: kind };
      }
    }
    return undefined;
  }

  /** Remove a validated job from its queue without executing it. */
  drop(jobId: JobId, queueKind: QueueKind): void {
    this.queues.get(queueKind).remove(jobId);
  }

  /** Remove a job from its queue after peek validation (advances rotation). */
  take(jobId: JobId, queueKind: QueueKind): boolean {
    const q = this.queues.get(queueKind);
    if (!q.list().includes(jobId)) return false;
    q.remove(jobId);
    const idx = DISPATCH_ORDER.indexOf(queueKind);
    if (idx >= 0) {
      this.cursor = (idx + 1) % DISPATCH_ORDER.length;
    }
    return true;
  }
}
