import { makeManifest } from "../../../../../src/platform/intelligence/providers/adapters/testing";
import {
  integrateProvider,
  makeIntegrationRequest,
  setupIntegrationPlatform,
} from "../../../../../src/platform/intelligence/providers/integration/testing";

describe("Integration engine", () => {
  it("registers, installs, and activates a provider", async () => {
    const platform = setupIntegrationPlatform();
    const manifest = makeManifest();

    const { register, install, activate } = await integrateProvider(
      platform,
      manifest
    );

    expect(register.success).toBe(true);
    expect(register.lifecycleState).toBe("registered");
    expect(install.lifecycleState).toBe("installed");
    expect(activate.lifecycleState).toBe("activated");
    expect(platform.registry.has(manifest.providerId)).toBe(true);
  });

  it("discovers registered providers from manifests", async () => {
    const platform = setupIntegrationPlatform();
    const manifest = makeManifest();
    await platform.engine.integrate(
      makeIntegrationRequest(manifest, { action: "register" })
    );

    const discovered = platform.engine.discover(manifest.providerId);
    expect(discovered.ok).toBe(true);
    if (!discovered.ok) return;
    expect(discovered.value[0].models).toContain("test-model");
    expect(discovered.value[0].capabilities).toContain("text.generate");
  });

  it("synchronizes manifest inventories into the registry", async () => {
    const platform = setupIntegrationPlatform();
    const manifest = makeManifest();
    await platform.engine.integrate(
      makeIntegrationRequest(manifest, { action: "register" })
    );

    const sync = await platform.engine.integrate(
      makeIntegrationRequest(manifest, { action: "synchronize", requestId: "sync_1" })
    );
    expect(sync.ok).toBe(true);
    if (!sync.ok) return;
    expect(sync.value.synchronization?.synchronized).toBe(true);
    expect(sync.value.synchronization?.modelInventory.models.length).toBeGreaterThan(0);
  });

  it("rejects duplicate registration", async () => {
    const platform = setupIntegrationPlatform();
    const manifest = makeManifest();
    await platform.engine.integrate(
      makeIntegrationRequest(manifest, { action: "register" })
    );
    const dup = await platform.engine.integrate(
      makeIntegrationRequest(manifest, { action: "register", requestId: "dup_1" })
    );
    expect(dup.ok).toBe(false);
  });

  it("reports statistics and health", async () => {
    const platform = setupIntegrationPlatform();
    await integrateProvider(platform, makeManifest());
    const stats = platform.engine.statistics();
    expect(stats.totalProviders).toBe(1);
    expect(stats.activated).toBe(1);
    expect(platform.engine.health().state).toBe("healthy");
  });
});
