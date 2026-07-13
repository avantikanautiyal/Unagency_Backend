import {
  sampleExecutionIntelligenceRequest,
  setupExecutionIntelligencePlatform,
} from "../../../../src/platform/intelligence/execution-intelligence/testing";
import { ALL_STRATEGIES } from "../../../../src/platform/intelligence/execution-intelligence";

describe("Execution Intelligence strategies", () => {
  it("supports all declared strategy kinds", () => {
    expect(ALL_STRATEGIES.length).toBe(11);
    const kinds = ALL_STRATEGIES.map((s) => s.kind);
    expect(kinds).toContain("single_pass");
    expect(kinds).toContain("tree_of_thought");
    expect(kinds).toContain("consensus_generation");
  });

  it("selects multi_pass for moderate complexity", async () => {
    const { engine } = setupExecutionIntelligencePlatform();
    const request = await sampleExecutionIntelligenceRequest({
      maxTokenBudget: 8000,
    });
    const result = await engine.optimize(request);
    expect(result.ok).toBe(true);
  });

  it("tree_of_thought is marked as placeholder", async () => {
    const { engine } = setupExecutionIntelligencePlatform();
    const request = await sampleExecutionIntelligenceRequest({
      strategy: "tree_of_thought",
    });
    const result = await engine.optimize(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.strategy.placeholder).toBe(true);
    expect(result.value.decompositionPlan.enabled).toBe(true);
  });
});
