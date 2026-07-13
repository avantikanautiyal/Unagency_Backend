import { InMemoryExecutionStore } from "../../../../src/platform/intelligence/execution-runtime/store/execution-store";
import { sampleContext, samplePlan } from "./helpers";

describe("InMemoryExecutionStore", () => {
  it("saves and retrieves records", () => {
    const store = new InMemoryExecutionStore();
    const record = {
      sessionId: "s1",
      context: sampleContext(),
      plan: samplePlan(),
      state: "created" as const,
      lifecyclePhase: "idle" as const,
      metrics: {
        progress: 0,
        durationMs: 0,
        retries: 0,
        state: "created" as const,
        health: "healthy" as const,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      cancellation: { cancelled: false },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    expect(store.save(record).ok).toBe(true);
    expect(store.get("s1").ok).toBe(true);
    expect(store.list()).toHaveLength(1);
    expect(store.delete("s1").ok).toBe(true);
    expect(store.get("s1").ok).toBe(false);
  });
});
