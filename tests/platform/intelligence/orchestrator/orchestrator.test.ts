import { createOrchestratorFixture, samplePlan, sampleRuntimeContext } from "./helpers";

describe("IntelligenceOrchestrator pipeline", () => {
  it("orchestrates an approved plan to completion", async () => {
    const { orchestrator } = createOrchestratorFixture();
    const result = await orchestrator.orchestrate({
      plan: samplePlan(),
      runtimeContext: sampleRuntimeContext(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("completed");
    expect(result.value.planId).toBe("plan_orch");
    expect(result.value.aggregated?.success).toBe(true);
    expect(result.value.contributions).toHaveLength(1);
  });

  it("rejects invalid plans", async () => {
    const { orchestrator } = createOrchestratorFixture();
    const plan = samplePlan();
    const result = await orchestrator.orchestrate({
      plan: { ...plan, planId: "", graph: { ...plan.graph, nodes: [] } },
      runtimeContext: sampleRuntimeContext(),
    });
    expect(result.ok).toBe(false);
  });
});
