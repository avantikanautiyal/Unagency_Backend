/**
 * In-memory execution queue.
 *
 * Purpose: Priority + FIFO scheduling queue for provider executions.
 * Responsibilities: enqueue/dequeue/peek/remove/list/clear.
 * Usage: The runtime enqueues sessions and drains under concurrency limits.
 * Future Extension: Durable queue adapters (NO BullMQ/Redis in M4.1).
 */

import { failure, success } from "../../../core/result";
import type { Result } from "../../../core/result";
import type { ExecutionQueueItem } from "../contracts/queue";
import { ProviderRuntimeError } from "../errors";
import type { IExecutionQueue } from "../interfaces/execution-queue";

export class InMemoryExecutionQueue implements IExecutionQueue {
  private items: ExecutionQueueItem[] = [];

  get size(): number {
    return this.items.length;
  }

  enqueue(item: ExecutionQueueItem): Result<void> {
    if (this.items.some((i) => i.sessionId === item.sessionId)) {
      return failure(
        new ProviderRuntimeError("Session already queued", {
          sessionId: item.sessionId,
        })
      );
    }
    this.items.push(item);
    // Higher priority first; ties broken by earliest enqueue (FIFO).
    this.items.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return a.enqueuedAtMs - b.enqueuedAtMs;
    });
    return success(undefined);
  }

  dequeue(): Result<ExecutionQueueItem> {
    const item = this.items.shift();
    if (!item) {
      return failure(new ProviderRuntimeError("Queue is empty"));
    }
    return success(item);
  }

  peek(): ExecutionQueueItem | undefined {
    return this.items[0];
  }

  remove(sessionId: string): Result<void> {
    const index = this.items.findIndex((i) => i.sessionId === sessionId);
    if (index === -1) {
      return failure(
        new ProviderRuntimeError("Queued session not found", { sessionId })
      );
    }
    this.items.splice(index, 1);
    return success(undefined);
  }

  list(): readonly ExecutionQueueItem[] {
    return [...this.items];
  }

  clear(): void {
    this.items = [];
  }
}
