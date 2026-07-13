import { createRuntimeFixture } from "./helpers";
import { ControllableDispatcher } from "../../../../../src/platform/intelligence/providers/runtime/testing";
import { sampleRequest } from "../../../../../src/platform/intelligence/providers/runtime/testing";
import { ProviderExecutionEventTypes } from "../../../../../src/platform/intelligence/providers/runtime/contracts/provider-execution-event";

function counterIds(): (prefix: string) => string {
  let n = 0;
  return (prefix: string) => `${prefix}_${(n += 1)}`;
}

describe("ProviderRuntime lifecycle", () => {
  it("executes a request to completion through the full lifecycle", async () => {
    const { runtime, events } = createRuntimeFixture();
    const result = await runtime.execute(sampleRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("completed");
    expect(result.value.success).toBe(true);
    expect(result.value.response?.output.ok).toBe(true);

    const types = events.types();
    expect(types).toContain(ProviderExecutionEventTypes.SESSION_CREATED);
    expect(types).toContain(ProviderExecutionEventTypes.SESSION_QUEUED);
    expect(types).toContain(ProviderExecutionEventTypes.SESSION_RESERVED);
    expect(types).toContain(ProviderExecutionEventTypes.SESSION_DISPATCHING);
    expect(types).toContain(ProviderExecutionEventTypes.SESSION_WAITING);
    expect(types).toContain(ProviderExecutionEventTypes.SESSION_COMPLETED);

    await runtime.dispose();
  });

  it("streams a response when streaming is requested", async () => {
    const { runtime, events } = createRuntimeFixture({
      dispatcher: new ControllableDispatcher({ streamingChunks: 3 }),
    });
    const result = await runtime.execute(sampleRequest({ streaming: true }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("completed");
    expect(result.value.statistics.streamingChunks).toBe(3);
    expect(events.types()).toContain(
      ProviderExecutionEventTypes.SESSION_STREAMING
    );

    await runtime.dispose();
  });

  it("retries transient failures then succeeds", async () => {
    const dispatcher = new ControllableDispatcher({ failuresBeforeSuccess: 2 });
    const { runtime } = createRuntimeFixture({ dispatcher });
    const result = await runtime.execute(
      sampleRequest({
        retryPolicy: { strategy: "fixed", maxAttempts: 5, baseDelayMs: 0 },
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("completed");
    expect(result.value.statistics.retries).toBe(2);
    expect(dispatcher.attempts).toBe(3);

    await runtime.dispose();
  });

  it("fails after exhausting retries", async () => {
    const dispatcher = new ControllableDispatcher({ mode: "fail" });
    const { runtime } = createRuntimeFixture({ dispatcher });
    const result = await runtime.execute(
      sampleRequest({
        retryPolicy: { strategy: "fixed", maxAttempts: 2, baseDelayMs: 0 },
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("failed");
    expect(result.value.success).toBe(false);
    expect(dispatcher.attempts).toBe(2);

    await runtime.dispose();
  });

  it("times out a hung dispatch", async () => {
    const dispatcher = new ControllableDispatcher({ mode: "hang" });
    const { runtime } = createRuntimeFixture({ dispatcher });
    const result = await runtime.execute(
      sampleRequest({ timeoutPolicy: { executionTimeoutMs: 5 } })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("timed_out");
    expect(result.value.statistics.timeouts).toBeGreaterThanOrEqual(1);

    await runtime.dispose();
  });

  it("cancels a queued session before dispatch", async () => {
    const createId = counterIds();
    const dispatcher = new ControllableDispatcher({ mode: "hang" });
    const { runtime } = createRuntimeFixture({
      dispatcher,
      maxConcurrent: 1,
      createId,
    });

    const p1 = runtime.execute(
      sampleRequest({ requestId: "r1", timeoutPolicy: { executionTimeoutMs: 60_000 } })
    );
    // Let the first session occupy the single lease.
    await Promise.resolve();
    const p2 = runtime.execute(sampleRequest({ requestId: "r2" }));
    await Promise.resolve();

    const cancelled = await runtime.cancel("psession_2", "user_abort");
    expect(cancelled.ok).toBe(true);

    const r2 = await p2;
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.value.status).toBe("cancelled");
    }

    // Cancel the in-flight session to clean up.
    await runtime.cancel("psession_1", "cleanup");
    await p1;
    await runtime.dispose();
  });

  it("cancels an in-flight session", async () => {
    const createId = counterIds();
    const dispatcher = new ControllableDispatcher({ mode: "hang" });
    const { runtime } = createRuntimeFixture({ dispatcher, createId });

    const p = runtime.execute(
      sampleRequest({ timeoutPolicy: { executionTimeoutMs: 60_000 } })
    );
    await Promise.resolve();
    await Promise.resolve();

    const cancelled = await runtime.cancel("psession_1", "user_abort");
    expect(cancelled.ok).toBe(true);

    const result = await p;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("cancelled");
    }

    await runtime.dispose();
  });

  it("rejects dispatch when the circuit breaker is open", async () => {
    const dispatcher = new ControllableDispatcher({ mode: "fail" });
    const { runtime } = createRuntimeFixture({
      dispatcher,
      circuitBreakerConfig: {
        failureThreshold: 1,
        successThreshold: 1,
        resetTimeoutMs: 60_000,
      },
    });

    // First failure opens the breaker.
    const first = await runtime.execute(sampleRequest({ requestId: "r1" }));
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.value.status).toBe("failed");
    }

    // Second request is rejected by the open breaker.
    const second = await runtime.execute(sampleRequest({ requestId: "r2" }));
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value.status).toBe("failed");
      expect(second.value.error?.message).toContain("circuit breaker");
    }

    await runtime.dispose();
  });

  it("queues under concurrency limits and completes all", async () => {
    const { runtime } = createRuntimeFixture({ maxConcurrent: 1 });
    const results = await Promise.all([
      runtime.execute(sampleRequest({ requestId: "r1" })),
      runtime.execute(sampleRequest({ requestId: "r2" })),
      runtime.execute(sampleRequest({ requestId: "r3" })),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);

    const snapshot = runtime.getRuntimeSnapshot();
    expect(snapshot.statistics.totalExecutions).toBe(3);
    expect(snapshot.statistics.completed).toBe(3);

    await runtime.dispose();
  });

  it("records runtime metrics and exposes snapshots", async () => {
    const { runtime } = createRuntimeFixture();
    const result = await runtime.execute(sampleRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const snapshotResult = runtime.getSession(result.value.sessionId);
    expect(snapshotResult.ok).toBe(true);
    if (snapshotResult.ok) {
      expect(snapshotResult.value.status).toBe("completed");
      expect(snapshotResult.value.statistics.attempts).toBe(1);
    }

    const runtimeSnapshot = runtime.getRuntimeSnapshot();
    expect(runtimeSnapshot.statistics.totalExecutions).toBe(1);
    expect(runtimeSnapshot.statistics.completed).toBe(1);
    expect(runtimeSnapshot.statistics.averageDurationMs).toBeGreaterThanOrEqual(0);

    await runtime.dispose();
  });

  it("validates requests", async () => {
    const { runtime } = createRuntimeFixture();
    const bad = sampleRequest();
    const result = await runtime.execute({ ...bad, requestId: "" });
    expect(result.ok).toBe(false);
    await runtime.dispose();
  });

  it("returns not-found for unknown sessions", () => {
    const { runtime } = createRuntimeFixture();
    expect(runtime.getSession("missing").ok).toBe(false);
  });
});
