import { ProviderRegistry } from "../../../../src/platform/intelligence/providers/registry/provider-registry";
import { ProviderCapabilityMatrix } from "../../../../src/platform/intelligence/providers/capability-matrix/implementations/provider-capability-matrix";
import { InMemoryProviderHealthStore } from "../../../../src/platform/intelligence/providers/health/in-memory-provider-health-store";
import { asProviderId } from "../../../../src/platform/intelligence/shared/identifiers";
import { buildSampleProvider } from "../../../../src/platform/intelligence/providers/testing/test-fixtures";

describe("ProviderRegistry", () => {
  let registry: ProviderRegistry;
  let matrix: ProviderCapabilityMatrix;
  let health: InMemoryProviderHealthStore;

  beforeEach(() => {
    health = new InMemoryProviderHealthStore();
    matrix = new ProviderCapabilityMatrix();
    registry = new ProviderRegistry(health, matrix);
  });

  it("registers and resolves providers", () => {
    const provider = buildSampleProvider();
    const registered = registry.registerProvider(provider);
    expect(registered.ok).toBe(true);
    expect(registry.providerExists(asProviderId("provider-a"))).toBe(true);

    const resolved = registry.resolveProvider(asProviderId("provider-a"));
    expect(resolved.ok).toBe(true);
  });

  it("rejects duplicate registration", () => {
    const provider = buildSampleProvider();
    registry.registerProvider(provider);
    expect(registry.registerProvider(provider).ok).toBe(false);
  });

  it("lists healthy providers", () => {
    registry.registerProvider(buildSampleProvider({ id: "healthy" }));
    registry.registerProvider(
      buildSampleProvider({ id: "offline", status: "offline" })
    );

    const healthy = registry.listHealthyProviders();
    expect(healthy.map((p) => String(p.id))).toEqual(["healthy"]);
  });

  it("unregisters and updates matrix", () => {
    registry.registerProvider(buildSampleProvider());
    expect(matrix.list()).toHaveLength(1);

    registry.unregisterProvider(asProviderId("provider-a"));
    expect(registry.providerExists(asProviderId("provider-a"))).toBe(false);
    expect(matrix.list()).toHaveLength(0);
  });

  it("validates provider metadata", () => {
    const invalid = {
      ...buildSampleProvider(),
      version: "bad",
    };
    expect(registry.validateProvider(invalid).ok).toBe(false);
  });
});
