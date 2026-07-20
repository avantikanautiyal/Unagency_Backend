/**
 * In-memory queue backends for each QueueKind.
 */

import type { IQueueBackend } from "../interfaces/execution";
import type { JobId } from "../contracts/job";
import type { QueueKind } from "../contracts/enums";

/** FIFO queue */
export class FifoQueueBackend implements IQueueBackend {
  private readonly items: JobId[] = [];

  constructor(readonly kind: QueueKind) {}

  enqueue(jobId: JobId): void {
    this.items.push(jobId);
  }

  dequeue(): JobId | undefined {
    return this.items.shift();
  }

  peek(): JobId | undefined {
    return this.items[0];
  }

  remove(jobId: JobId): void {
    const i = this.items.indexOf(jobId);
    if (i >= 0) this.items.splice(i, 1);
  }

  length(): number {
    return this.items.length;
  }

  list(): readonly JobId[] {
    return [...this.items];
  }
}

/** Priority queue — higher score dequeued first */
export class PriorityQueueBackend implements IQueueBackend {
  readonly kind: QueueKind = "priority";
  private readonly items: { jobId: JobId; score: number }[] = [];

  enqueue(jobId: JobId, score = 500): void {
    this.items.push({ jobId, score });
    this.items.sort((a, b) => b.score - a.score);
  }

  dequeue(): JobId | undefined {
    return this.items.shift()?.jobId;
  }

  peek(): JobId | undefined {
    return this.items[0]?.jobId;
  }

  remove(jobId: JobId): void {
    const i = this.items.findIndex((x) => x.jobId === jobId);
    if (i >= 0) this.items.splice(i, 1);
  }

  length(): number {
    return this.items.length;
  }

  list(): readonly JobId[] {
    return this.items.map((x) => x.jobId);
  }
}

/** Scheduled queue — release when scheduledAt <= now */
export class ScheduledQueueBackend implements IQueueBackend {
  readonly kind: QueueKind = "scheduled";
  private readonly items: { jobId: JobId; dueAtMs: number }[] = [];

  constructor(private readonly clockMs: () => number) {}

  enqueue(jobId: JobId, dueAtMs = 0): void {
    this.items.push({ jobId, dueAtMs });
    this.items.sort((a, b) => a.dueAtMs - b.dueAtMs);
  }

  dequeue(): JobId | undefined {
    const now = this.clockMs();
    const idx = this.items.findIndex((x) => x.dueAtMs <= now);
    if (idx < 0) return undefined;
    const [item] = this.items.splice(idx, 1);
    return item?.jobId;
  }

  peek(): JobId | undefined {
    const now = this.clockMs();
    return this.items.find((x) => x.dueAtMs <= now)?.jobId;
  }

  remove(jobId: JobId): void {
    const i = this.items.findIndex((x) => x.jobId === jobId);
    if (i >= 0) this.items.splice(i, 1);
  }

  length(): number {
    return this.items.length;
  }

  list(): readonly JobId[] {
    return this.items.map((x) => x.jobId);
  }
}

export class QueueRegistry {
  private readonly queues = new Map<QueueKind, IQueueBackend>();

  constructor(clockMs: () => number = () => Date.now()) {
    this.queues.set("immediate", new FifoQueueBackend("immediate"));
    this.queues.set("priority", new PriorityQueueBackend());
    this.queues.set("scheduled", new ScheduledQueueBackend(clockMs));
    this.queues.set("streaming", new FifoQueueBackend("streaming"));
    this.queues.set("long_running", new FifoQueueBackend("long_running"));
    this.queues.set("retry", new FifoQueueBackend("retry"));
    this.queues.set("dead_letter", new FifoQueueBackend("dead_letter"));
    this.queues.set("batch", new FifoQueueBackend("batch"));
  }

  get(kind: QueueKind): IQueueBackend {
    const q = this.queues.get(kind);
    if (!q) throw new Error(`unknown queue ${kind}`);
    return q;
  }

  lengths(): Record<QueueKind, number> {
    const out = {} as Record<QueueKind, number>;
    for (const [k, q] of this.queues) out[k] = q.length();
    return out;
  }
}
