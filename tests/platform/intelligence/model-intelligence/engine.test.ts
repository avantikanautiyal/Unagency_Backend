import {
  sampleCarouselRequest,
  setupModelIntelligencePlatform,
} from "../../../../src/platform/intelligence/model-intelligence/testing";

describe("Model Intelligence engine", () => {
  it("recommends ranked models for Instagram Carousel without provider execution", async () => {
    const { engine } = setupModelIntelligencePlatform();
    const result = await engine.recommend(sampleCarouselRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.candidates.candidates.length).toBeGreaterThan(0);
    expect(result.value.recommendation.primary.rank).toBe(1);
    expect(result.value.decisionRecord.winningModel.modelId).toBeDefined();
    expect(result.value.decisionRecord.reasonForSelection).toBeTruthy();
    expect(result.value.scoreCards.length).toBeGreaterThan(0);
  });

  it("explains rankings with strengths and weaknesses", async () => {
    const { engine } = setupModelIntelligencePlatform();
    const explained = await engine.explain(sampleCarouselRequest());

    expect(explained.ok).toBe(true);
    if (!explained.ok) return;

    const top = explained.value.candidates[0];
    expect(top.explanation.strengths.length).toBeGreaterThan(0);
    expect(top.explanation.summary).toBeTruthy();
    expect(top.overallScore).toBeGreaterThan(0);
  });

  it("produces ModelDecisionRecord artifact", async () => {
    const { engine } = setupModelIntelligencePlatform();
    const result = await engine.recommend(sampleCarouselRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const record = result.value.decisionRecord;
    expect(record.version).toBe("1.0.0");
    expect(record.fallbackModels.length).toBeGreaterThanOrEqual(0);
    expect(record.expectedQuality).toBeGreaterThan(0);
    expect(record.candidateModels.length).toBeGreaterThan(0);
  });

  it("includes leaderboards and predictions", async () => {
    const { engine } = setupModelIntelligencePlatform();
    const result = await engine.recommend(sampleCarouselRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.departmentLeaderboard).toBeDefined();
    expect(result.value.capabilityLeaderboard).toBeDefined();
    expect(result.value.predictions.length).toBeGreaterThan(0);
  });
});
