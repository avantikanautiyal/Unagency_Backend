import { setupIntegrationPlatform } from "../../../../../src/platform/intelligence/providers/integration/testing";
import { makeManifest } from "../../../../../src/platform/intelligence/providers/adapters/testing";
import { DefaultIntegrationHealthMonitor } from "../../../../../src/platform/intelligence/providers/integration/health/default-health-monitor";
import { ProviderIntegrationRequestBuilder } from "../../../../../src/platform/intelligence/providers/integration/builders/integration-request-builder";
import { createIntegrationPlatform } from "../../../../../src/platform/intelligence/providers/integration/factories/create-integration-platform";

describe("Integration health monitor", () => {
  it("aggregates subsystem health", () => {
    const monitor = new DefaultIntegrationHealthMonitor(() => "2026-01-01T00:00:00.000Z");
    expect(monitor.aggregate().state).toBe("healthy");
    monitor.recordRegistryCheck(false);
    expect(monitor.aggregate().state).toBe("degraded");
  });
});

describe("Integration diagnostics", () => {
  it("reports registration records after integration", async () => {
    const platform = setupIntegrationPlatform();
    const manifest = makeManifest();
    await platform.engine.integrate(
      ProviderIntegrationRequestBuilder.create()
        .withRequestId("req_1")
        .withAction("register")
        .withManifest(manifest)
        .build()
    );
    expect(platform.diagnostics.registrationRecords()).toHaveLength(1);
  });
});

describe("Integration request builder", () => {
  it("builds immutable integration requests", () => {
    const manifest = makeManifest();
    const request = ProviderIntegrationRequestBuilder.create()
      .withRequestId("req_builder")
      .withAction("install")
      .withManifest(manifest)
      .build();
    expect(request.action).toBe("install");
    expect(request.providerId).toBe(manifest.providerId);
  });
});

describe("Integration platform factory", () => {
  it("wires all subsystems", () => {
    const platform = createIntegrationPlatform();
    expect(platform.engine).toBeDefined();
    expect(platform.registry).toBeDefined();
    expect(platform.diagnostics).toBeDefined();
    expect(platform.lifecycle).toBeDefined();
  });
});
