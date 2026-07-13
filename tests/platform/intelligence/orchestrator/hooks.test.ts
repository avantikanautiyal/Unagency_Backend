import { createOrchestratorFixture, samplePlan, sampleRuntimeContext } from "./helpers";

describe("HookManager", () => {
  it("emits lifecycle hooks during orchestration", async () => {
    const { orchestrator, hooks } = createOrchestratorFixture();
    const seen: string[] = [];

    hooks.register("beforePlanExecution", () => {
      seen.push("beforePlanExecution");
    });
    hooks.register("beforeDispatch", () => {
      seen.push("beforeDispatch");
    });
    hooks.register("beforeRuntime", () => {
      seen.push("beforeRuntime");
    });
    hooks.register("afterRuntime", () => {
      seen.push("afterRuntime");
    });
    hooks.register("afterAggregation", () => {
      seen.push("afterAggregation");
    });
    hooks.register("onComplete", () => {
      seen.push("onComplete");
    });

    await orchestrator.orchestrate({
      plan: samplePlan(),
      runtimeContext: sampleRuntimeContext(),
    });

    expect(seen).toEqual([
      "beforePlanExecution",
      "beforeDispatch",
      "beforeRuntime",
      "afterRuntime",
      "afterAggregation",
      "onComplete",
    ]);
  });
});
