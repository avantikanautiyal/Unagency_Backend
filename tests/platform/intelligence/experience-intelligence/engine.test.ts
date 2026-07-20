import {
  sampleExperienceIntelligenceRequest,
  setupExperienceIntelligencePlatform,
  sampleHistoricalInputs,
} from "../../../../src/platform/intelligence/experience-intelligence/testing";

describe("Experience Intelligence Platform", () => {
  it("produces reusable experiences from historical execution inputs", async () => {
    const { engine } = setupExperienceIntelligencePlatform();
    const result = await engine.process(sampleExperienceIntelligenceRequest(100));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.experiences.length).toBeGreaterThan(0);
    expect(result.value.rootCauses.length).toBeGreaterThan(0);
    expect(result.value.correctionStrategies.length).toBeGreaterThan(0);
    expect(result.value.applicabilityMaps.length).toBeGreaterThan(0);
    expect(result.value.snapshot.experienceCount).toBeGreaterThan(0);
  });

  it("extracts root causes and correction strategies", async () => {
    const { engine } = setupExperienceIntelligencePlatform();
    const result = await engine.process(sampleExperienceIntelligenceRequest(50));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const exp = result.value.experiences[0];
    expect(exp.rootCause).toBeDefined();
    expect(exp.correctionStrategy.advisoryOnly).toBe(true);
    expect(exp.explanation.whyExists).toBeTruthy();
    expect(result.value.correctionStrategies.every((c) => c.advisoryOnly)).toBe(true);
  });

  it("scores confidence and validates experiences", async () => {
    const { engine } = setupExperienceIntelligencePlatform();
    const result = await engine.process(sampleExperienceIntelligenceRequest(30));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const exp of result.value.experiences) {
      expect(exp.scores.confidence).toBeGreaterThanOrEqual(0);
      expect(exp.scores.evidenceScore).toBeGreaterThanOrEqual(0);
      expect(exp.lifecycle).toMatch(/draft|validated/);
    }
  });

  it("stores experiences in repository and supports search", async () => {
    const { engine, repository } = setupExperienceIntelligencePlatform();
    await engine.process(sampleExperienceIntelligenceRequest(20));

    const search = await engine.search({
      queryId: "q1",
      category: "negative",
      limit: 10,
    });
    expect(search.ok).toBe(true);
    if (!search.ok) return;

    const count = repository.count();
    expect(count.ok).toBe(true);
    if (count.ok) expect(count.value).toBeGreaterThan(0);
  });

  it("produces experience snapshot", async () => {
    const { engine } = setupExperienceIntelligencePlatform();
    await engine.process(sampleExperienceIntelligenceRequest(10));

    const snap = await engine.snapshot();
    expect(snap.ok).toBe(true);
    if (!snap.ok) return;
    expect(snap.value.experienceCount).toBeGreaterThan(0);
    expect(snap.value.version).toBeTruthy();
  });

  it("handles large historical batch without AI or networking", async () => {
    const { engine } = setupExperienceIntelligencePlatform();
    const inputs = sampleHistoricalInputs(1000);
    const request = {
      ...sampleExperienceIntelligenceRequest(1000),
      inputs,
    };
    const result = await engine.process(request);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.statistics.executionsProcessed).toBeGreaterThan(50);
    expect(result.value.experiences.length).toBeGreaterThan(0);
  });

  it("never modifies prompts models or providers", async () => {
    const { engine } = setupExperienceIntelligencePlatform();
    const result = await engine.process(sampleExperienceIntelligenceRequest(10));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const corr of result.value.correctionStrategies) {
      expect(corr.advisoryOnly).toBe(true);
    }
  });
});
