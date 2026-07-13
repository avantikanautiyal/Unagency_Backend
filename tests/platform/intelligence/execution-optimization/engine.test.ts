import {
  sampleExecutionOptimizationRequest,
  setupExecutionOptimizationPlatform,
} from "../../../../src/platform/intelligence/execution-optimization/testing";

describe("Execution Optimization engine", () => {
  it("produces complete ExecutionOptimizationResult from historical inputs", async () => {
    const { engine } = setupExecutionOptimizationPlatform();
    const request = await sampleExecutionOptimizationRequest();
    const result = await engine.optimize(request);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.advisoryOnly).toBe(true);
    expect(result.value.recommendations.length).toBeGreaterThan(0);
    expect(result.value.heuristicProposals.length).toBeGreaterThan(0);
    expect(result.value.scores.length).toBeGreaterThan(0);
    expect(result.value.confidence.score).toBeGreaterThan(0);
    expect(result.value.benchmarks.length).toBeGreaterThan(0);
    expect(result.value.simulations.length).toBeGreaterThan(0);
    expect(result.value.patterns.length).toBeGreaterThan(0);
    expect(result.value.statistics.evaluationsAnalyzed).toBe(1);
    expect(result.value.snapshot.topRecommendations.length).toBeGreaterThan(0);
  });

  it("never mutates — all recommendations are advisory", async () => {
    const { engine } = setupExecutionOptimizationPlatform();
    const request = await sampleExecutionOptimizationRequest();
    const result = await engine.optimize(request);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const rec of result.value.recommendations) {
      expect(rec.advisoryOnly).toBe(true);
      expect(rec.disposition).toBe("advisory");
    }
    for (const h of result.value.heuristicProposals) {
      expect(h.advisoryOnly).toBe(true);
    }
  });

  it("explains recommendations", async () => {
    const { engine } = setupExecutionOptimizationPlatform();
    const request = await sampleExecutionOptimizationRequest();
    const explained = await engine.explain(request);

    expect(explained.ok).toBe(true);
    if (!explained.ok) return;
    expect(explained.value.length).toBeGreaterThan(0);
  });

  it("rejects requests without historical inputs", async () => {
    const { engine } = setupExecutionOptimizationPlatform();
    const request = await sampleExecutionOptimizationRequest();
    const invalid = {
      ...request,
      inputs: { ...request.inputs, evaluationReports: [], observabilityReports: [], learningResults: [], intelligenceResults: [] },
    };
    const result = await engine.optimize(invalid);
    expect(result.ok).toBe(false);
  });
});
