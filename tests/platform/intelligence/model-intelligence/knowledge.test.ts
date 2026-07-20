import { setupModelIntelligencePlatform } from "../../../../src/platform/intelligence/model-intelligence/testing";
import { createModelRegistryPlatform } from "../../../../src/platform/intelligence/model-registry";
import { buildKnowledgeProfile } from "../../../../src/platform/intelligence/model-intelligence/repositories/knowledge-base-seed";
import { InMemoryModelKnowledgeBase } from "../../../../src/platform/intelligence/model-intelligence/repositories/in-memory-knowledge-base";

describe("Model Knowledge Base", () => {
  it("builds rich profiles from registry models", () => {
    const { registry } = createModelRegistryPlatform();
    const models = registry.listModels();
    expect(models.ok).toBe(true);
    if (!models.ok) return;

    const profile = buildKnowledgeProfile(models.value[0]);
    expect(profile.knownStrengths.length).toBeGreaterThan(0);
    expect(profile.recommendedUseCases.length).toBeGreaterThan(0);
    expect(profile.costTier).toBeDefined();
    expect(profile.performanceTier).toBeDefined();
  });

  it("stores and retrieves knowledge profiles", () => {
    const { registry } = createModelRegistryPlatform();
    const models = registry.listModels();
    if (!models.ok) return;

    const kb = new InMemoryModelKnowledgeBase(
      models.value.slice(0, 3).map((m) => buildKnowledgeProfile(m))
    );
    const list = kb.list();
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.value).toHaveLength(3);
  });
});

describe("Model Intelligence knowledge integration", () => {
  it("uses knowledge base in recommendations", async () => {
    const { engine } = setupModelIntelligencePlatform();
    const result = await engine.recommend({
      requestId: "mi_1",
      capabilityId: "text.generate" as never,
      department: "marketing",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.statistics.modelsProfiled).toBeGreaterThan(20);
  });
});
