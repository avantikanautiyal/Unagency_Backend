import {
  KlingVideoProtocol,
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
        modelId: "kling/kling-2-1",
        payload: { prompt: "X".repeat(3000), aspectRatio: "9:16" },
        context: {
          organizationId: "org_test",
          executionId: "exec_test",
          correlationId: "corr_test",
        },
      } as never,
      "kling-v2-1",
      [],
      "idem-1"
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const prompt = plan.value.body.prompt;
    expect(typeof prompt).toBe("string");
    expect((prompt as string).length).toBeLessThanOrEqual(2500);
  });
});
