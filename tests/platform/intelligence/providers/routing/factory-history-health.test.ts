import { createRoutingPlatform } from "../../../../../src/platform/intelligence/providers/routing/factories/create-routing-platform";
import { InMemoryRoutingHistory } from "../../../../../src/platform/intelligence/providers/routing/history/in-memory-history";
import { DefaultRoutingHealthProvider } from "../../../../../src/platform/intelligence/providers/routing/health/default-health-provider";
import { TEST_CAPABILITY_ID } from "../../../../../src/platform/intelligence/providers/routing/testing";
import { asProviderId } from "../../../../../src/platform/intelligence/shared/identifiers";

describe("Routing platform factory", () => {
  it("wires engine, diagnostics, history, and health", () => {
    const platform = createRoutingPlatform();
    expect(platform.engine).toBeDefined();
    expect(platform.diagnostics).toBeDefined();
    expect(platform.history).toBeDefined();
    expect(platform.health).toBeDefined();
  });
});

describe("Routing history", () => {
  it("records and aggregates quality scores", () => {
    const history = new InMemoryRoutingHistory();
    const providerId = asProviderId("p1");
    history.record({
      providerId,
      capabilityId: TEST_CAPABILITY_ID,
      success: true,
      qualityScore: 0.9,
      recordedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(history.qualityScore(providerId, TEST_CAPABILITY_ID)).toBe(0.9);
  });
});

describe("Routing health provider", () => {
  it("reports healthy/unknown snapshots", () => {
    const health = new DefaultRoutingHealthProvider();
    const id = asProviderId("p1");
    expect(health.isHealthy(id)).toBe(true);
    health.seed(id, {
      providerId: id,
      state: "unhealthy",
      checkedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(health.isHealthy(id)).toBe(false);
  });
});
