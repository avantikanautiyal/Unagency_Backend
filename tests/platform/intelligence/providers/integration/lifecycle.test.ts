import { InMemoryIntegrationRegistry } from "../../../../../src/platform/intelligence/providers/integration/registry/in-memory-integration-registry";
import { InMemoryLifecycleManager } from "../../../../../src/platform/intelligence/providers/integration/lifecycle/in-memory-lifecycle-manager";
import { makeManifest } from "../../../../../src/platform/intelligence/providers/adapters/testing";
import { asIntegrationId } from "../../../../../src/platform/intelligence/providers/integration/contracts/identifiers";
import { canTransitionLifecycle } from "../../../../../src/platform/intelligence/providers/integration/contracts/enums";

describe("Lifecycle manager", () => {
  it("enforces valid lifecycle transitions", () => {
    expect(canTransitionLifecycle("registered", "installed")).toBe(true);
    expect(canTransitionLifecycle("registered", "activated")).toBe(false);

    const registry = new InMemoryIntegrationRegistry();
    const lifecycle = new InMemoryLifecycleManager(registry);
    const manifest = makeManifest();
    registry.register(manifest, asIntegrationId("int_1"));

    expect(lifecycle.transition(manifest.providerId, "installed").ok).toBe(true);
    expect(lifecycle.transition(manifest.providerId, "activated").ok).toBe(true);
    expect(lifecycle.getState(manifest.providerId)).toBe("activated");
  });

  it("rejects invalid transitions", () => {
    const registry = new InMemoryIntegrationRegistry();
    const lifecycle = new InMemoryLifecycleManager(registry);
    const manifest = makeManifest();
    registry.register(manifest, asIntegrationId("int_1"));

    const invalid = lifecycle.transition(manifest.providerId, "activated");
    expect(invalid.ok).toBe(false);
  });
});
