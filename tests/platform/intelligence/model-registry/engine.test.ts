import {
  setupModelRegistryPlatform,
  TEST_GPT4O_MODEL,
  TEST_OPENAI_PROVIDER,
  sampleSearchRequest,
} from "../../../../src/platform/intelligence/model-registry/testing";
import { SEED_PROVIDERS } from "../../../../src/platform/intelligence/model-registry/discovery/inventory-seed";

describe("Model Registry engine", () => {
  it("loads seed inventory with providers and models", () => {
    const { registry } = setupModelRegistryPlatform();
    const providers = registry.listProviders();
    const models = registry.listModels();

    expect(providers.ok).toBe(true);
    expect(models.ok).toBe(true);
    if (!providers.ok || !models.ok) return;
    expect(providers.value.length).toBe(SEED_PROVIDERS.length);
    expect(models.value.length).toBeGreaterThanOrEqual(29);
  });

  it("retrieves canonical model metadata", () => {
    const { registry } = setupModelRegistryPlatform();
    const model = registry.getModel(TEST_GPT4O_MODEL);

    expect(model.ok).toBe(true);
    if (!model.ok) return;
    expect(model.value.displayName).toBe("GPT-4o");
    expect(model.value.flags.streaming).toBe(true);
    expect(model.value.limits.maximumContext).toBe(128000);
    expect(model.value.pricing.currency).toBe("USD");
  });

  it("exposes immutable snapshot and statistics", () => {
    const { registry } = setupModelRegistryPlatform();
    const snapshot = registry.snapshot();
    const stats = registry.statistics();

    expect(snapshot.ok && stats.ok).toBe(true);
    if (!snapshot.ok || !stats.ok) return;
    expect(snapshot.value.models.length).toBe(stats.value.totalModels);
    expect(stats.value.activeModels).toBeGreaterThan(0);
  });

  it("lists models by provider", () => {
    const { registry } = setupModelRegistryPlatform();
    const models = registry.listModels(TEST_OPENAI_PROVIDER);

    expect(models.ok).toBe(true);
    if (!models.ok) return;
    expect(models.value.length).toBeGreaterThanOrEqual(8);
    expect(models.value.every((m) => m.providerId === TEST_OPENAI_PROVIDER)).toBe(true);
  });
});
