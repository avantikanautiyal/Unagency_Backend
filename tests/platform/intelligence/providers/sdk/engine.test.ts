import {
  makeSdkRequest,
  setupSdkPlatform,
} from "../../../../../src/platform/intelligence/providers/sdk/testing";

describe("SDK engine", () => {
  it("returns NOT_IMPLEMENTED for placeholder wrapper execute", async () => {
    const { engine } = setupSdkPlatform();

    const result = await engine.execute(
      makeSdkRequest({ vendor: "openai", payload: { prompt: "hi" } })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.success).toBe(false);
    expect(result.value.error?.code).toBe("NOT_IMPLEMENTED");
    expect(result.value.error?.kind).toBe("not_implemented");
    expect(result.value.vendor).toBe("openai");
  });

  it("fails validation for missing operation", async () => {
    const { engine } = setupSdkPlatform();
    const bad = makeSdkRequest();
    const request = { ...bad, operation: "" };

    const result = await engine.execute(request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("describes and reports health for a registered vendor", async () => {
    const { engine } = setupSdkPlatform();

    const desc = engine.describe("anthropic");
    expect(desc.ok).toBe(true);
    if (desc.ok) {
      expect(desc.value.vendor).toBe("anthropic");
      expect(desc.value.version.raw).toBe("0.0.0-placeholder");
    }

    await engine.execute(makeSdkRequest({ vendor: "anthropic" }));
    const health = engine.health("anthropic");
    expect(health.registered).toBe(true);
  });

  it("fails when vendor is not registered", async () => {
    const platform = setupSdkPlatform({ registerPlaceholders: false });
    const result = await platform.engine.execute(makeSdkRequest());
    expect(result.ok).toBe(false);
  });
});
