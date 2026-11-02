import { HiggsfieldVideoProtocol } from "../../../../src/platform/providers/video/higgsfield/higgsfield-video-protocol";
import {
  HIGGSFIELD_VIDEO_SPEC,
  VERIFIED_VIDEO_PROVIDER_SPECS,
} from "../../../../src/platform/providers/video/configs/verified-video-provider-specs";

function request(payload: Record<string, unknown>) {
  return {
    capabilityId: "video.generate",
    providerId: "provider.higgsfield",
    modelId: "higgsfield/higgsfield-video",
    payload,
    context: { organizationId: "org_test", executionId: "exec_test" },
  } as never;
}

describe("higgsfield-video-protocol (Kling 3.0 Pro)", () => {
  const protocol = new HiggsfieldVideoProtocol();
  const wire = protocol.resolveWireModel("higgsfield/higgsfield-video")!;

  it("is LIVE-executable against the documented host", () => {
    expect(VERIFIED_VIDEO_PROVIDER_SPECS).toContain(HIGGSFIELD_VIDEO_SPEC);
    expect(HIGGSFIELD_VIDEO_SPEC.baseUrl).toBe("https://api.higgsfield.ai");
  });

  it("sends key id and secret in one Key header", () => {
    const headers = protocol.buildAuthHeaders({ accessKey: "id", secretKey: "sec" });
    expect(headers.ok && headers.value.Authorization).toBe("Key id:sec");
    expect(protocol.buildAuthHeaders({ accessKey: "id" }).ok).toBe(false);
  });

  it("uses text-to-video with an aspect ratio when no image is given", () => {
    const plan = protocol.buildSubmit(
      request({ prompt: "A shot", aspectRatio: "9:16", duration: 40 }),
      wire,
      [],
      "idem",
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.path).toBe("/kling-video/v3.0/pro/text-to-video");
    expect(plan.value.headers).toEqual({ "Idempotency-Key": "idem" });
    expect(plan.value.body).toEqual({
      prompt: "A shot",
      duration: 15,
      sound: "off",
      aspect_ratio: "9:16",
    });
  });

  it("uses image-to-video with the first http image and no aspect ratio", () => {
    const plan = protocol.buildSubmit(
      request({ prompt: "A shot", aspectRatio: "9:16", duration: "5s" }),
      wire,
      ["data:image/png;base64,AAAA", "https://cdn.example.com/a.png", "https://cdn.example.com/b.png"],
      "idem",
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.path).toBe("/kling-video/v3.0/pro/image-to-video");
    expect(plan.value.body).toEqual({
      prompt: "A shot",
      duration: 5,
      sound: "off",
      image_url: "https://cdn.example.com/a.png",
    });
  });

  it("parses submit and every poll state", () => {
    const submit = protocol.parseSubmit({ status: "queued", request_id: "r1" });
    expect(submit.ok && submit.value.providerJobId).toBe("r1");
    const poll = protocol.buildPoll("r1");
    expect(poll.ok && poll.value.path).toBe("/requests/r1/status");

    const status = (body: Record<string, unknown>) => {
      const r = protocol.parsePoll(body);
      return r.ok ? r.value.status : "error";
    };
    expect(status({ status: "queued" })).toBe("pending");
    expect(status({ status: "in_progress" })).toBe("pending");
    expect(status({ status: "completed", video: { url: "https://x/v.mp4" } })).toBe("completed");
    expect(status({ status: "completed" })).toBe("failed");
    expect(status({ status: "nsfw" })).toBe("failed");
    expect(status({ status: "failed" })).toBe("failed");
    expect(status({ status: "canceled" })).toBe("failed");
  });
});
