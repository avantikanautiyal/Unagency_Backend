import { DefaultSdkHealthMonitor } from "../../../../../src/platform/intelligence/providers/sdk/health/default-health-monitor";
import { setupSdkPlatform } from "../../../../../src/platform/intelligence/providers/sdk/testing";
import { createAllPlaceholderWrappers } from "../../../../../src/platform/intelligence/providers/sdk/factories/create-placeholder-wrappers";

describe("SDK health monitor", () => {
  it("tracks registration and execution health", () => {
    const monitor = new DefaultSdkHealthMonitor(() => "2026-01-01T00:00:00.000Z");
    monitor.markRegistered("openai", true);
    expect(monitor.vendorHealth("openai").state).toBe("healthy");

    monitor.record("openai", false);
    monitor.record("openai", false);
    expect(monitor.vendorHealth("openai").state).toBe("unhealthy");
  });
});

describe("SDK diagnostics", () => {
  it("reports registration for all placeholder vendors", () => {
    const { diagnostics } = setupSdkPlatform();
    const reports = diagnostics.registrationReport();
    expect(reports.length).toBe(15);
    expect(reports.every((r) => r.registered)).toBe(true);
  });

  it("evaluates compatibility and dependency reports", () => {
    const { diagnostics } = setupSdkPlatform();

    const compat = diagnostics.compatibilityReport("openai", {
      streaming: true,
      vision: true,
    });
    expect(compat.compatible).toBe(true);

    const dep = diagnostics.dependencyReport("groq");
    expect(dep.sdkPackageInstalled).toBe(false);
    expect(dep.transportAvailable).toBe(true);
  });

  it("returns version reports for registered vendors", () => {
    const { diagnostics } = setupSdkPlatform();
    const version = diagnostics.versionReport("mistral");
    expect(version?.wrapperVersion.raw).toBe("0.0.0-placeholder");
  });
});

describe("Placeholder SDK wrappers", () => {
  it("creates all 15 vendor wrappers with distinct vendors", () => {
    const wrappers = createAllPlaceholderWrappers();
    expect(wrappers).toHaveLength(15);
    const vendors = new Set(wrappers.map((w) => w.vendor));
    expect(vendors.size).toBe(15);
    for (const wrapper of wrappers) {
      expect(wrapper.describe().version.raw).toBe("0.0.0-placeholder");
    }
  });
});
