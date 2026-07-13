import { FailureCoordinator } from "../../../../src/platform/intelligence/orchestrator/failure/failure-coordinator";
import { samplePlan, sampleRuntimeContext } from "./helpers";

describe("FailureCoordinator", () => {
  it("suggests retry when attempts remain", () => {
    const coordinator = new FailureCoordinator();
    const decision = coordinator.coordinate({
      context: {
        orchestrationId: "o1",
        plan: samplePlan(),
        runtimeContext: sampleRuntimeContext(),
        startedAt: "2026-01-01T00:00:00.000Z",
      },
      plan: samplePlan(),
      error: new Error("boom"),
      attempt: 0,
    });

    expect(decision.ok).toBe(true);
    if (decision.ok) {
      expect(decision.value.action).toBe("retry");
      expect(decision.value.shouldPropagateCancellation).toBe(true);
      expect(decision.value.rollbackHookIds).toContain("onFailure");
    }
  });

  it("suggests fallback when retries exhausted", () => {
    const coordinator = new FailureCoordinator();
    const decision = coordinator.coordinate({
      context: {
        orchestrationId: "o1",
        plan: samplePlan(),
        runtimeContext: sampleRuntimeContext(),
        startedAt: "2026-01-01T00:00:00.000Z",
      },
      plan: samplePlan(),
      error: new Error("boom"),
      attempt: 1,
    });

    expect(decision.ok).toBe(true);
    if (decision.ok) {
      expect(decision.value.action).toBe("fallback");
      expect(decision.value.fallbackProviderId).toBe("provider-b");
    }
  });
});
