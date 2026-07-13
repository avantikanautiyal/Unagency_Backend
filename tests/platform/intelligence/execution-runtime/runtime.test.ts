import { createRuntimeFixture, sampleContext, samplePlan } from "./helpers";

describe("ExecutionRuntime", () => {
  it("executes a plan with placeholder completion", async () => {
    const { runtime } = createRuntimeFixture();
    const result = await runtime.executePlan({
      context: sampleContext(),
      plan: samplePlan(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state).toBe("completed");

    const snapshot = await runtime.getExecution(result.value.sessionId);
    expect(snapshot.ok).toBe(true);
    if (snapshot.ok) {
      expect(snapshot.value.metrics.progress).toBe(1);
    }
  });

  it("monitors execution metrics", async () => {
    const { runtime } = createRuntimeFixture();
    const created = await runtime.createSession({
      context: sampleContext(),
      plan: samplePlan(),
    });
    if (!created.ok) return;

    await created.value.start();
    const metrics = await runtime.monitorExecution(created.value.sessionId);
    expect(metrics.ok).toBe(true);
    if (metrics.ok) {
      expect(metrics.value.state).toBe("running");
    }
  });

  it("disposes active sessions", async () => {
    const { runtime } = createRuntimeFixture();
    const created = await runtime.createSession({
      context: sampleContext(),
      plan: samplePlan(),
    });
    if (!created.ok) return;
    await created.value.start();

    await runtime.dispose();
    const snapshot = await runtime.getExecution(created.value.sessionId);
    expect(snapshot.ok).toBe(false);
  });
});
