import { createRuntimeFixture, sampleContext, samplePlan } from "./helpers";

describe("ExecutionSession lifecycle", () => {
  it("starts and completes via runToCompletion", async () => {
    const { runtime } = createRuntimeFixture();
    const created = await runtime.createSession({
      context: sampleContext(),
      plan: samplePlan(),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await created.value.start();
    expect(created.value.state).toBe("running");

    await created.value.runToCompletion();
    expect(created.value.state).toBe("completed");
    expect(created.value.snapshot().result?.success).toBe(true);
  });

  it("supports pause and resume", async () => {
    const { runtime } = createRuntimeFixture();
    const created = await runtime.createSession({
      context: sampleContext(),
      plan: samplePlan(),
    });
    if (!created.ok) return;

    await created.value.start();
    await created.value.pause();
    expect(created.value.state).toBe("paused");

    await created.value.resume();
    expect(created.value.state).toBe("completed");
  });

  it("supports cancel", async () => {
    const { runtime } = createRuntimeFixture();
    const created = await runtime.createSession({
      context: sampleContext(),
      plan: samplePlan(),
    });
    if (!created.ok) return;

    await created.value.start();
    await created.value.cancel("user_abort");
    expect(created.value.state).toBe("cancelled");
    expect(created.value.cancellation.cancelled).toBe(true);
  });

  it("supports fail", async () => {
    const { runtime } = createRuntimeFixture();
    const created = await runtime.createSession({
      context: sampleContext(),
      plan: samplePlan(),
    });
    if (!created.ok) return;

    await created.value.start();
    await created.value.fail("boom", "ERR");
    expect(created.value.state).toBe("failed");
    expect(created.value.snapshot().result?.errorCode).toBe("ERR");
  });
});
