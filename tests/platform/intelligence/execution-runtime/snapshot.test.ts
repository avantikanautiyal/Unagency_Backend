import { createRuntimeFixture, sampleContext, samplePlan } from "./helpers";

describe("Execution snapshots", () => {
  it("captures immutable snapshot fields", async () => {
    const { runtime } = createRuntimeFixture();
    const created = await runtime.createSession({
      context: sampleContext(),
      plan: samplePlan(),
    });
    if (!created.ok) return;

    await created.value.start();
    const snap = created.value.snapshot();

    expect(snap.sessionId).toBe(created.value.sessionId);
    expect(snap.state).toBe("running");
    expect(snap.plan.planId).toBe("plan_test");
    expect(snap.capturedAt).toBeTruthy();
    expect(snap.context.organizationId).toBe("org_1");
  });
});
