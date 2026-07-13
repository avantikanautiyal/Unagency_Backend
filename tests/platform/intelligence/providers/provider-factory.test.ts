import { ProviderFactory } from "../../../../src/platform/intelligence/providers/factory/provider-factory";
import { ProviderRegistry } from "../../../../src/platform/intelligence/providers/registry/provider-registry";
import { InMemoryProviderHealthStore } from "../../../../src/platform/intelligence/providers/health/in-memory-provider-health-store";
import { buildSampleProvider } from "../../../../src/platform/intelligence/providers/testing/test-fixtures";
import { asProviderId } from "../../../../src/platform/intelligence/shared/identifiers";

describe("ProviderFactory", () => {
  it("creates a placeholder adapter from definition", async () => {
    const factory = new ProviderFactory();
    const provider = buildSampleProvider();
    const adapter = factory.createAdapter(provider);

    expect(adapter.ok).toBe(true);
    if (adapter.ok) {
      expect(adapter.value.providerId).toBe(provider.id);
      const result = await adapter.value.execute({
        capabilityId: "analyzeBrief",
        input: {},
      });
      expect(result.ok).toBe(false);
    }
  });

  it("creates adapter for registered provider", () => {
    const registry = new ProviderRegistry(new InMemoryProviderHealthStore());
    registry.registerProvider(buildSampleProvider());

    const factory = new ProviderFactory();
    const adapter = factory.createAdapterForProvider(
      registry,
      asProviderId("provider-a")
    );
    expect(adapter.ok).toBe(true);
  });
});
