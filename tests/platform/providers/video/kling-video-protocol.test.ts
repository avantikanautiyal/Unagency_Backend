import {
  KlingVideoProtocol,
  isKlingDiscontinuedModelError,
  resolveKlingApiKey,
} from "../../../../src/platform/providers/video/kling/kling-video-protocol";

describe("kling-video-protocol", () => {
  const protocol = new KlingVideoProtocol();

  it("buildAuthHeaders uses Bearer API key (not JWT)", () => {
    const apiKey = "api-key-kling-test-token";
    const headers = protocol.buildAuthHeaders({ apiKey });
    expect(headers.ok).toBe(true);
    if (!headers.ok) return;
    expect(headers.value.Authorization).toBe(`Bearer ${apiKey}`);
    expect(headers.value.Authorization).not.toMatch(/^Bearer eyJ/);
  });

  it("accepts legacy accessKey field as API key", () => {
    const headers = protocol.buildAuthHeaders({ accessKey: "legacy-access-key" });
    expect(headers.ok).toBe(true);
    if (!headers.ok) return;
    expect(headers.value.Authorization).toBe("Bearer legacy-access-key");
  });

  it("resolveKlingApiKey prefers apiKey over accessKey", () => {
    expect(resolveKlingApiKey({ apiKey: "primary", accessKey: "legacy" })).toBe("primary");
  });

  it("fails when no API key is provided", () => {
    const headers = protocol.buildAuthHeaders({});
    expect(headers.ok).toBe(false);
    if (headers.ok) return;
    expect(headers.error.message).toMatch(/KLING_API_KEY/);
  });

  it("truncates prompts longer than 2500 characters", () => {
    const plan = protocol.buildSubmit(
      {
        capabilityId: "video.generate",
        providerId: "provider.kling",
        modelId: "kling/kling-2-6",
        payload: { prompt: "X".repeat(3000), aspectRatio: "9:16" },
        context: {
          organizationId: "org_test",
          executionId: "exec_test",
          correlationId: "corr_test",
        },
      } as never,
      "kling-v2-6",
      [],
      "idem-1"
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const prompt = plan.value.body.prompt;
    expect(typeof prompt).toBe("string");
    expect((prompt as string).length).toBeLessThanOrEqual(2500);
  });

  it("remaps discontinued kling-v2-1 inventory to kling-v2-6", () => {
    expect(protocol.resolveWireModel("kling-2-1")).toBe("kling-v2-6");
    expect(protocol.resolveWireModel("kling-v2-1")).toBe("kling-v2-6");
    expect(protocol.resolveWireModel("kling/kling-2-6")).toBe("kling-v2-6");
  });

  it("exposes within-Kling wire fallbacks after the primary", () => {
    expect(protocol.resolveWireFallbacks("kling-v2-6")).toEqual([
      "kling-v2-5-turbo",
      "kling-v3",
      "kling-v2-1-master",
    ]);
  });

  it("detects discontinued model error messages", () => {
    expect(
      isKlingDiscontinuedModelError(
        "The model 'kling-v2-1' has been discontinued and is no longer available."
      )
    ).toBe(true);
    expect(isKlingDiscontinuedModelError("rate limit exceeded")).toBe(false);
  });
});
