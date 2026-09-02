/**
 * Execution queue port.
 *
 * Purpose: In-memory scheduling queue for provider executions.
 * Responsibilities: Enqueue/dequeue by priority then FIFO; peek; remove.
 * Usage: The runtime enqueues sessions and drains under concurrency limits.
 * Future Extension: Durable queue adapters (NO BullMQ/Redis in M4.1).
 */

import type { Result } from "../../../core/result";
import type { ExecutionQueueItem } from "../contracts/queue";

export interface IExecutionQueue {
  readonly size: number;
  enqueue(item: ExecutionQueueItem): Result<void>;
  dequeue(): Result<ExecutionQueueItem>;
  peek(): ExecutionQueueItem | undefined;
  remove(sessionId: string): Result<void>;
  list(): readonly ExecutionQueueItem[];
  clear(): void;
}
