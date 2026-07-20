import {
  setupModelRegistryPlatform,
  TEST_OPENAI_PROVIDER,
  sampleSearchRequest,
} from "../../../../src/platform/intelligence/model-registry/testing";
import { providerIdForVendor } from "../../../../src/platform/intelligence/model-registry";

describe("Model Registry discovery and search", () => {
  it("discovers all providers and capabilities", () => {
    const { discovery } = setupModelRegistryPlatform();
    const result = discovery.discoverAll();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.totalProviders).toBe(11);
    expect(result.value.capabilities).toContain("text.generate");
    expect(result.value.capabilities).toContain("embedding.generate");
  });

  it("discovers single provider", () => {
    const { discovery } = setupModelRegistryPlatform();
    const result = discovery.discoverProvider(providerIdForVendor("anthropic"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.totalProviders).toBe(1);
    expect(result.value.models.some((m) => m.displayName.includes("Claude"))).toBe(true);
  });

  it("searches models by query", () => {
    const { search } = setupModelRegistryPlatform();
    const result = search.search({ query: "gpt-4o", limit: 10 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.models.length).toBeGreaterThan(0);
    expect(result.value.models[0].displayName.toLowerCase()).toContain("gpt");
  });

  it("filters by capability and modality", () => {
    const { search } = setupModelRegistryPlatform();
    const embedding = search.search({
      capability: "embedding.generate",
      modality: "embedding",
    });
    const vision = search.search({
      capability: "vision.analyze",
      modality: "multimodal",
    });

    expect(embedding.ok && vision.ok).toBe(true);
    if (!embedding.ok || !vision.ok) return;
    expect(embedding.value.total).toBeGreaterThan(0);
    expect(vision.value.total).toBeGreaterThan(0);
  });

  it("filters by latency tier and max cost", () => {
    const { search } = setupModelRegistryPlatform();
    const fast = search.search({
      latencyTier: "ultra_low",
      maxInputCostPer1k: 1,
    });

    expect(fast.ok).toBe(true);
    if (!fast.ok) return;
    expect(fast.value.models.length).toBeGreaterThan(0);
    for (const m of fast.value.models) {
      expect(m.latencyTier).toBe("ultra_low");
      expect(m.pricing.inputPer1kTokens ?? 0).toBeLessThanOrEqual(1);
    }
  });

  it("filters by provider and region", () => {
    const { search } = setupModelRegistryPlatform();
    const result = search.search(
      sampleSearchRequest({
        providerId: TEST_OPENAI_PROVIDER,
        region: "us-east-1",
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.models.length).toBeGreaterThan(0);
  });
});
