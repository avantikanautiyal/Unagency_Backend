import { setupModelRegistryPlatform } from "../../../../src/platform/intelligence/model-registry/testing";
import { createModelRegistryPlatform } from "../../../../src/platform/intelligence/model-registry";
import { InMemoryModelRegistryStore } from "../../../../src/platform/intelligence/model-registry/models/in-memory-model-registry";
import { buildModelManifest, buildProviderManifest } from "../../../../src/platform/intelligence/model-registry/builders/manifest-builders";
import { SEED_PROVIDERS, SEED_MODELS } from "../../../../src/platform/intelligence/model-registry/discovery/inventory-seed";
import { providerIdForVendor } from "../../../../src/platform/intelligence/model-registry";

describe("Model Registry validation", () => {
  it("validates seed registry with no issues", () => {
    const { validation } = setupModelRegistryPlatform();
    const issues = validation.validateRegistry();

    expect(issues.ok).toBe(true);
    if (!issues.ok) return;
    expect(issues.value).toHaveLength(0);
  });

  it("rejects duplicate provider registration", () => {
    const store = new InMemoryModelRegistryStore();
    const now = "2026-01-01T00:00:00.000Z";
    const entry = SEED_PROVIDERS[0];
    const manifest = buildProviderManifest(entry, ["gpt-4o"], now);
    expect(store.registerProviderManifest(manifest).ok).toBe(true);
    expect(store.registerProviderManifest(manifest).ok).toBe(false);
  });

  it("rejects model for unknown provider", () => {
    const store = new InMemoryModelRegistryStore();
    const now = "2026-01-01T00:00:00.000Z";
    const modelEntry = SEED_MODELS[0];
    const manifest = buildModelManifest(modelEntry, providerIdForVendor("unknown"), now);
    expect(store.registerModelManifest(manifest).ok).toBe(false);
  });

  it("estimates pricing without provider execution", () => {
    const { pricing, registry } = setupModelRegistryPlatform();
    const model = registry.getModel("openai/gpt-4o");
    expect(model.ok).toBe(true);
    if (!model.ok) return;
    const cost = pricing.estimateCost(model.value, 1000, 500);
    expect(cost.ok).toBe(true);
    if (!cost.ok) return;
    expect(cost.value).toBeGreaterThan(0);
  });
});
