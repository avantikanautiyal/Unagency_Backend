import { DefaultTransportHealthMonitor } from "../../../../../src/platform/intelligence/providers/transport/health/default-health-monitor";
import {
  makeCanonicalRequest,
  setupTransportPlatform,
} from "../../../../../src/platform/intelligence/providers/transport/testing";

describe("Transport health monitor", () => {
  it("derives health from recorded observations", () => {
    const monitor = new DefaultTransportHealthMonitor(() => "2026-01-01T00:00:00.000Z");

    expect(monitor.protocolHealth("local").state).toBe("unknown");

    monitor.record("local", true, 4);
    monitor.record("local", true, 6);
    expect(monitor.protocolHealth("local").state).toBe("healthy");

    monitor.record("grpc", false);
    monitor.record("grpc", false);
    expect(monitor.protocolHealth("grpc").state).toBe("unhealthy");
  });
});

describe("Transport diagnostics", () => {
  it("reports serialization + latency after an execution", async () => {
    const { engine, diagnostics } = setupTransportPlatform();
    await engine.execute(makeCanonicalRequest());

    const serde = diagnostics.serializationStatistics();
    expect(serde.serializations).toBeGreaterThan(0);
    expect(serde.deserializations).toBeGreaterThan(0);
    expect(diagnostics.latency("local").averageMs).toBeGreaterThanOrEqual(0);
  });

  it("evaluates protocol compatibility against a requirement", () => {
    const { diagnostics } = setupTransportPlatform();

    const local = diagnostics.protocolCompatibility("local", { streaming: true });
    expect(local.compatible).toBe(true);

    const https = diagnostics.protocolCompatibility("https", { streaming: true });
    expect(https.compatible).toBe(false);
    expect(https.reasons.length).toBeGreaterThan(0);
  });

  it("reports connection statistics", () => {
    const { diagnostics, connectionManager } = setupTransportPlatform();
    connectionManager.acquire({ protocol: "local" });
    expect(diagnostics.connectionStatistics().total).toBeGreaterThan(0);
  });
});
