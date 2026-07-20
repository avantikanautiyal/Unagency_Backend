import {
  sampleInjectionRequest,
  setupExperienceInjectionPlatform,
  setupInjectionFromExperienceIntelligence,
  makeSeedExperiences,
} from "../../../../src/platform/intelligence/experience-injection/testing";

describe("Experience Injection Platform", () => {
  it("returns top relevant experiences from a large repository", async () => {
    const { engine } = await setupExperienceInjectionPlatform({ seedCount: 500 });
    const result = await engine.inject(sampleInjectionRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.statistics.candidatesRetrieved).toBeGreaterThan(50);
    expect(result.value.package.relevantExperiences.length).toBeLessThanOrEqual(10);
    expect(result.value.package.relevantExperiences.length).toBeGreaterThan(0);
    expect(result.value.package.advisoryOnly).toBe(true);
    expect(result.value.package.containsPromptContent).toBe(false);
  });

  it("resolves conflicting tone recommendations to one winner", async () => {
    const { engine } = await setupExperienceInjectionPlatform({ seedCount: 50 });
    const result = await engine.inject(sampleInjectionRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const toneInstructions = result.value.package.relevantExperiences
      .map((p) => p.experience.correctionStrategy.instruction.toLowerCase())
      .filter((t) => t.includes("playful") || t.includes("formal"));

    // At most one tone recommendation after conflict resolution
    expect(toneInstructions.length).toBeLessThanOrEqual(1);
    if (result.value.conflictResult.conflicts.some((c) => c.dimension.includes("tone"))) {
      expect(result.value.conflictResult.discarded.length).toBeGreaterThan(0);
    }
  });

  it("packages corrections best practices warnings and anti-patterns", async () => {
    const { engine } = await setupExperienceInjectionPlatform({ seedCount: 100 });
    const result = await engine.inject(sampleInjectionRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const pkg = result.value.package;
    expect(pkg.corrections.every((c) => c.advisoryOnly)).toBe(true);
    expect(pkg.explainability.perExperience.length).toBe(pkg.relevantExperiences.length);
    expect(pkg.explainability.summary).toBeTruthy();
  });

  it("scores relevance and ranks by priority", async () => {
    const { engine } = await setupExperienceInjectionPlatform({ seedCount: 80 });
    const result = await engine.inject(sampleInjectionRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.relevanceScores.length).toBeGreaterThan(0);
    const ranks = result.value.package.relevantExperiences.map((p) => p.rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("works with Experience Intelligence repository output", async () => {
    const { engine } = await setupInjectionFromExperienceIntelligence(40);
    const result = await engine.inject(sampleInjectionRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.package.version).toBe("1.0.0");
  });

  it("never includes prompt content or executes AI", async () => {
    const { engine } = await setupExperienceInjectionPlatform({ seedCount: 30 });
    const result = await engine.inject(sampleInjectionRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const serialized = JSON.stringify(result.value.package);
    expect(result.value.package.containsPromptContent).toBe(false);
    expect(serialized).not.toMatch(/system:\s*|user:\s*|assistant:\s*/i);
    for (const p of result.value.package.relevantExperiences) {
      expect(p.experience.correctionStrategy.advisoryOnly).toBe(true);
    }
  });

  it("seeds deterministic experiences for scale criteria", () => {
    const seeds = makeSeedExperiences(1000);
    expect(seeds.length).toBe(1000);
    expect(seeds[0].experienceId).toBeTruthy();
  });
});
