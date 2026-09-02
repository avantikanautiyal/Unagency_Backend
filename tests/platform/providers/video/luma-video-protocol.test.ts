import { LumaVideoProtocol } from "../../../../src/platform/providers/video/luma/luma-video-protocol";

describe("luma-video-protocol", () => {
  const protocol = new LumaVideoProtocol();

  it("maps inventory model ids to ray-3.2", () => {
    expect(protocol.resolveWireModel("luma/luma-ray-2")).toBe("ray-3.2");
    expect(protocol.resolveWireModel("luma-ray-2")).toBe("ray-3.2");
  });

  it("builds Agents API video submit body", () => {
    const plan = protocol.buildSubmit(
      {
        capabilityId: "video.generate",
        providerId: "provider.luma",
        modelId: "luma/luma-ray-2",
        payload: {
          prompt: "Vertical performance ad for a coffee brand",
          aspectRatio: "9:16",
          duration: 5,
          resolution: "720p",
        },
        context: {
          organizationId: "org_test",
          executionId: "exec_test",
          correlationId: "corr_test",
        },
      } as never,
      "ray-3.2",
      ["https://cdn.example.com/logo.png"],
      "idem-1"
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.path).toBe("/v1/generations");
    expect(plan.value.body).toMatchObject({
      model: "ray-3.2",
      type: "video",
      aspect_ratio: "9:16",
      video: {
        resolution: "720p",
        duration: "5s",
        start_frame: { url: "https://cdn.example.com/logo.png" },
      },
    });
  });

  it("parses Agents API completed output", () => {
    const parsed = protocol.parsePoll({
      state: "completed",
      output: [{ type: "video", url: "https://storage.example.com/out.mp4" }],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.status).toBe("completed");
    expect(parsed.value.outputs?.[0]?.temporaryUrl).toBe(
      "https://storage.example.com/out.mp4"
    );
  });
});
