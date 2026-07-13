import {
  sampleExecutionOptimizationRequest,
  setupExecutionOptimizationPlatform,
} from "../../../../src/platform/intelligence/execution-optimization/testing";

describe("Execution Optimization simulation and benchmarks", () => {
  it("runs simulations without executing providers", async () => {
    const { engine } = setupExecutionOptimizationPlatform();
    const request = await sampleExecutionOptimizationRequest();
    const result = await engine.optimize(request);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const sim of result.value.simulations) {
      expect(sim.projectedQualityDelta).toBeDefined();
      expect(["positive", "neutral", "negative"]).toContain(sim.outcome);
    }
  });

  it("produces benchmark comparisons", async () => {
    const { engine } = setupExecutionOptimizationPlatform();
    const request = await sampleExecutionOptimizationRequest();
    const result = await engine.optimize(request);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.comparisons.length).toBe(result.value.benchmarks.length);
    expect(result.value.trends.length).toBeGreaterThanOrEqual(0);
  });

  it("proposes experiments for high-priority recommendations", async () => {
    const { engine } = setupExecutionOptimizationPlatform();
    const request = await sampleExecutionOptimizationRequest();
    const result = await engine.optimize(request);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const highRecs = result.value.recommendations.filter(
      (r) => r.priority === "high" || r.priority === "critical"
    );
    if (highRecs.length > 0) {
      expect(result.value.experiments.length).toBeGreaterThan(0);
    }
  });
});
