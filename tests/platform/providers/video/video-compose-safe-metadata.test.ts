import {
  extractVideoComposeSafeMetadata,
  shouldComposeVideoTowardTarget,
  isVideoTargetComposeEnabled,
  resolveVideoTargetDurationSec,
} from "../../../../src/platform/providers/video/common/video-compose-safe-metadata";

describe("video-compose-safe-metadata", () => {
  it("extracts target duration and prompt from submit payload", () => {
    const meta = extractVideoComposeSafeMetadata({
      prompt: "Storyboard beat 1–4 cinematic continue",
      videoTargetDurationSec: 20,
      videoSegmentCount: 2,
      assets: [{ url: "https://example.com/x.png" }],
    });
    expect(meta.videoTargetDurationSec).toBe(20);
    expect(meta.videoSegmentCount).toBe(2);
    expect(meta.prompt).toContain("Storyboard");
    expect(meta).not.toHaveProperty("assets");
  });

  it("resolves duration from duration string", () => {
    expect(
      resolveVideoTargetDurationSec(
        extractVideoComposeSafeMetadata({ duration: "20s" }),
      ),
    ).toBe(20);
  });

  it("requires multi-segment plan for compose", () => {
    expect(
      shouldComposeVideoTowardTarget({
        capabilityId: "video.generate",
        safeMetadata: { videoTargetDurationSec: 20, prompt: "x" },
        outputType: "video",
        outputMimeType: "video/mp4",
      }),
    ).toBe(true);
    expect(
      shouldComposeVideoTowardTarget({
        capabilityId: "video.generate",
        safeMetadata: { videoTargetDurationSec: 8, prompt: "x" },
        outputType: "video",
      }),
    ).toBe(false);
  });

  it("applies to any video provider capability, not only minimax", () => {
    for (const capabilityId of [
      "video.generate",
      "video.short_form_generation",
    ]) {
      expect(
        shouldComposeVideoTowardTarget({
          capabilityId,
          safeMetadata: { videoTargetDurationSec: 20 },
          outputType: "video",
        }),
      ).toBe(true);
    }
    expect(
      shouldComposeVideoTowardTarget({
        capabilityId: "image.generate",
        safeMetadata: { videoTargetDurationSec: 20 },
        outputType: "image",
      }),
    ).toBe(false);
  });

  it("skips when already composed or composing", () => {
    expect(
      shouldComposeVideoTowardTarget({
        capabilityId: "video.generate",
        safeMetadata: { videoTargetDurationSec: 20, videoComposed: true },
        outputType: "video",
      }),
    ).toBe(false);
    expect(
      shouldComposeVideoTowardTarget({
        capabilityId: "video.generate",
        safeMetadata: { videoTargetDurationSec: 20, videoComposing: true },
        outputType: "video",
      }),
    ).toBe(false);
  });

  it("respects UNAGENCY_VIDEO_TARGET_COMPOSE=false", () => {
    const prev = process.env.UNAGENCY_VIDEO_TARGET_COMPOSE;
    process.env.UNAGENCY_VIDEO_TARGET_COMPOSE = "false";
    try {
      expect(isVideoTargetComposeEnabled()).toBe(false);
      expect(
        shouldComposeVideoTowardTarget({
          capabilityId: "video.generate",
          safeMetadata: { videoTargetDurationSec: 20 },
          outputType: "video",
        }),
      ).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.UNAGENCY_VIDEO_TARGET_COMPOSE;
      else process.env.UNAGENCY_VIDEO_TARGET_COMPOSE = prev;
    }
  });
});
