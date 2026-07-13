import {
  makeEvaluationReport,
  makeObservabilityReport,
  setupExecutionOptimizationPlatform,
} from "../../../../src/platform/intelligence/execution-optimization/testing";
import { ExecutionOptimizationRequestBuilder } from "../../../../src/platform/intelligence/execution-optimization";
import { asCapabilityId } from "../../../../src/platform/intelligence/shared/identifiers";

describe("Execution Optimization learners", () => {
  it("detects quality patterns from low evaluation scores", async () => {
    const { engine } = setupExecutionOptimizationPlatform();
    const request = ExecutionOptimizationRequestBuilder.create()
      .withRequestId("opt_learner_1")
      .withCapabilityId(asCapabilityId("echo"))
      .withInputs({
        evaluationReports: [makeEvaluationReport(0.55, ["brand"])],
        observabilityReports: [
          makeObservabilityReport({ providerId: "p1", qualityScore: 0.9 }),
        ],
      })
      .build();

    const result = await engine.optimize(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.patterns.some((p) => p.id === "pat_quality_low")).toBe(true);
    expect(
      result.value.recommendations.some((r) => r.domain === "verification_strategy")
    ).toBe(true);
  });

  it("generates provider preference hints from observability", async () => {
    const { engine } = setupExecutionOptimizationPlatform();
    const request = ExecutionOptimizationRequestBuilder.create()
      .withRequestId("opt_learner_2")
      .withCapabilityId(asCapabilityId("echo"))
      .withInputs({
        observabilityReports: [
          makeObservabilityReport({
            providerId: "fast-provider",
            latencyMs: 500,
            qualityScore: 0.92,
          }),
          makeObservabilityReport({
            providerId: "slow-provider",
            latencyMs: 3000,
            qualityScore: 0.6,
          }),
        ],
      })
      .build();

    const result = await engine.optimize(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.value.recommendations.some(
        (r) => r.domain === "provider_selection" && r.title.includes("fast-provider")
      )
    ).toBe(true);
  });
});
