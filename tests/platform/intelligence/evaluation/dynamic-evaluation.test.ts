import {
  sampleMarketingCarouselDynamicRequest,
  sampleMedicalDynamicRequest,
  sampleSoftwareDynamicRequest,
  setupDynamicEvaluationPlatform,
} from "../../../../src/platform/intelligence/evaluation/testing";
import { createIntelligenceEvaluationEngine } from "../../../../src/platform/intelligence/evaluation/factories/create-evaluation-engine";
import { sampleEvaluationRequest } from "../../../../src/platform/intelligence/evaluation/testing";

describe("Dynamic Adaptive Evaluation", () => {
  it("builds a marketing evaluation pipeline for carousel content", async () => {
    const { engine } = setupDynamicEvaluationPlatform();
    const result = await engine.evaluate(sampleMarketingCarouselDynamicRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.strategy.pipelineFamily).toBe("marketing");
    const kinds = result.value.judgePlan.selectedJudges.map((j) => j.kind);
    expect(kinds).toEqual(expect.arrayContaining(["marketing", "creative", "brand", "grammar"]));
    expect(result.value.weightProfile.normalized).toBe(true);
    expect(result.value.explainability.whyJudgesSelected.length).toBeGreaterThan(0);
    expect(result.value.learningSignals.length).toBeGreaterThan(0);
    expect(result.value.evaluation.report.judgeResults.length).toBeGreaterThan(0);
    expect(result.value.evaluation.report.rubric.metadata?.dynamic).toBe(true);
  });

  it("builds a software evaluation pipeline for React Native", async () => {
    const { engine } = setupDynamicEvaluationPlatform();
    const result = await engine.evaluate(sampleSoftwareDynamicRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.strategy.pipelineFamily).toBe("software");
    const kinds = result.value.judgePlan.selectedJudges.map((j) => j.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(["architecture", "security", "performance", "testing"])
    );
  });

  it("builds a healthcare evaluation pipeline for medical reports", async () => {
    const { engine } = setupDynamicEvaluationPlatform();
    const result = await engine.evaluate(sampleMedicalDynamicRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.strategy.pipelineFamily).toBe("healthcare");
    expect(result.value.strategy.humanApprovalRequired).toBe(true);
    const kinds = result.value.judgePlan.selectedJudges.map((j) => j.kind);
    expect(kinds).toEqual(expect.arrayContaining(["medical", "factual", "compliance", "safety"]));
    expect(result.value.judgePlan.humanReviewRequired).toBe(true);
  });

  it("preserves the static IntelligenceEvaluationEngine", async () => {
    const engine = createIntelligenceEvaluationEngine();
    const result = await engine.evaluate(sampleEvaluationRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.report.judgeResults.length).toBeGreaterThan(0);
  });

  it("emits learning signals without performing learning", async () => {
    const { engine } = setupDynamicEvaluationPlatform();
    const result = await engine.evaluate(sampleMarketingCarouselDynamicRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.learningSignals.every((s) => s.signalId.length > 0)).toBe(true);
    expect(result.value.experienceCandidates.length).toBeGreaterThan(0);
  });
});
