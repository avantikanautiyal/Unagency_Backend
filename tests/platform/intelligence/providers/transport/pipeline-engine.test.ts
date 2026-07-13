import {
  makeCanonicalRequest,
  setupTransportPlatform,
} from "../../../../../src/platform/intelligence/providers/transport/testing";

describe("Transport pipeline + engine", () => {
  it("executes a canonical request end-to-end over the local transport", async () => {
    const { engine } = setupTransportPlatform();

    const result = await engine.execute(
      makeCanonicalRequest({ payload: { prompt: "hello" } })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.success).toBe(true);
    expect(result.value.response?.payload.prompt).toBe("hello");
    expect(result.value.statistics.protocol).toBe("local");
    expect(result.value.statistics.attempts).toBe(1);
    expect(result.value.sessionId).toBeDefined();
  });

  it("returns a canonical result (success=false) when validation fails", async () => {
    const { engine } = setupTransportPlatform();

    const result = await engine.execute(
      makeCanonicalRequest({ timeoutMs: -1 })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.success).toBe(false);
    expect(result.value.error?.code).toBe("VALIDATION_ERROR");
    expect(result.value.error?.kind).toBe("serialization");
  });

  it("surfaces a placeholder protocol as an unavailable transport", async () => {
    const { engine } = setupTransportPlatform();

    const result = await engine.execute(
      makeCanonicalRequest({ protocol: "https" })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.success).toBe(false);
    expect(result.value.error?.code).toBe("NOT_IMPLEMENTED");
    expect(result.value.error?.kind).toBe("unavailable");
  });

  it("exposes protocol capability + health via the engine", async () => {
    const { engine } = setupTransportPlatform();

    const cap = engine.capability("grpc");
    expect(cap.ok).toBe(true);
    if (cap.ok) {
      expect(cap.value.streaming).toBe(true);
      expect(cap.value.bidirectional).toBe(true);
    }

    await engine.execute(makeCanonicalRequest());
    const health = engine.health("local");
    expect(["healthy", "unknown"]).toContain(health.state);
  });
});
