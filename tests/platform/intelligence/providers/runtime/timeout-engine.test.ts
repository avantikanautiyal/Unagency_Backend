import { TimeoutEngine } from "../../../../../src/platform/intelligence/providers/runtime/timeout/timeout-engine";

describe("TimeoutEngine", () => {
  const engine = new TimeoutEngine();

  it("resolves timeout budgets from policy", () => {
    expect(
      engine.resolveExecutionTimeoutMs({ executionTimeoutMs: 1000 })
    ).toBe(1000);
    expect(
      engine.resolveStreamingTimeoutMs({
        executionTimeoutMs: 1000,
        streamingTimeoutMs: 2000,
      })
    ).toBe(2000);
    expect(
      engine.resolveStreamingTimeoutMs({ executionTimeoutMs: 1000 })
    ).toBe(1000);
    expect(engine.resolveQueueTimeoutMs({ executionTimeoutMs: 1000 })).toBe(0);
  });

  it("resolves work that finishes before timeout", async () => {
    const result = await engine.withTimeout(
      Promise.resolve("value"),
      1000,
      "execution"
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("value");
    }
  });

  it("fails when work exceeds the timeout", async () => {
    const never = new Promise<string>(() => {
      /* never resolves */
    });
    const result = await engine.withTimeout(never, 5, "execution");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TIMEOUT_ERROR");
    }
  });

  it("treats non-positive timeout as no timeout", async () => {
    const result = await engine.withTimeout(Promise.resolve(1), 0, "queue");
    expect(result.ok).toBe(true);
  });
});
