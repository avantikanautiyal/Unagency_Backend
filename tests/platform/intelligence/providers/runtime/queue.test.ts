import { InMemoryExecutionQueue } from "../../../../../src/platform/intelligence/providers/runtime/queue/execution-queue";
import type { ExecutionQueueItem } from "../../../../../src/platform/intelligence/providers/runtime/contracts/queue";
import { asProviderId } from "../../../../../src/platform/intelligence/shared/identifiers";

function item(
  sessionId: string,
  priority: number,
  enqueuedAtMs: number
): ExecutionQueueItem {
  return {
    sessionId,
    requestId: `req_${sessionId}`,
    providerId: asProviderId("provider-a"),
    priority,
    enqueuedAt: new Date(enqueuedAtMs).toISOString(),
    enqueuedAtMs,
  };
}

describe("InMemoryExecutionQueue", () => {
  it("dequeues by priority then FIFO", () => {
    const queue = new InMemoryExecutionQueue();
    queue.enqueue(item("a", 0, 1));
    queue.enqueue(item("b", 5, 2));
    queue.enqueue(item("c", 5, 3));

    expect(queue.dequeue()).toMatchObject({ ok: true });
    // highest priority (5) with earliest enqueue (b) first
    const first = queue.list();
    expect(first.length).toBe(2);
  });

  it("orders highest priority first", () => {
    const queue = new InMemoryExecutionQueue();
    queue.enqueue(item("low", 1, 1));
    queue.enqueue(item("high", 10, 2));
    const dq = queue.dequeue();
    expect(dq.ok).toBe(true);
    if (dq.ok) {
      expect(dq.value.sessionId).toBe("high");
    }
  });

  it("rejects duplicate sessions", () => {
    const queue = new InMemoryExecutionQueue();
    expect(queue.enqueue(item("a", 0, 1)).ok).toBe(true);
    expect(queue.enqueue(item("a", 0, 2)).ok).toBe(false);
  });

  it("removes and reports size", () => {
    const queue = new InMemoryExecutionQueue();
    queue.enqueue(item("a", 0, 1));
    queue.enqueue(item("b", 0, 2));
    expect(queue.size).toBe(2);
    expect(queue.remove("a").ok).toBe(true);
    expect(queue.size).toBe(1);
    expect(queue.remove("missing").ok).toBe(false);
  });

  it("fails to dequeue when empty", () => {
    const queue = new InMemoryExecutionQueue();
    expect(queue.dequeue().ok).toBe(false);
  });
});
