import { nearestSupportedAspectRatio } from "../../../../src/platform/providers/image/common/image-aspect-ratio";
import { GoogleImagenProtocol } from "../../../../src/platform/providers/image/google/google-imagen-protocol";
import { IdeogramImageProtocol } from "../../../../src/platform/providers/image/ideogram/ideogram-image-protocol";
import { RecraftImageProtocol } from "../../../../src/platform/providers/image/recraft/recraft-image-protocol";
import {
  GOOGLE_IMAGEN_SPEC,
  IDEOGRAM_IMAGE_SPEC,
  RECRAFT_IMAGE_SPEC,
} from "../../../../src/platform/providers/image/configs/verified-image-provider-specs";
import type { ProviderExecutionRequest } from "../../../../src/platform/providers/runtime/contracts/provider-execution-request";

function request(payload: Record<string, unknown>): ProviderExecutionRequest {
  return { capabilityId: "image.generate", payload, metadata: {} } as unknown as ProviderExecutionRequest;
}

describe("image providers receive the requested aspect ratio", () => {
  it("snaps to the closest supported ratio", () => {
    expect(nearestSupportedAspectRatio("1:1.414", ["1:1", "2:3", "3:4"])).toBe("3:4");
    expect(nearestSupportedAspectRatio("16:10", ["1:1", "16:9", "4:3"])).toBe("16:9");
    expect(nearestSupportedAspectRatio(undefined, ["1:1"])).toBeUndefined();
  });

  it("Gemini: imageConfig.aspectRatio only when the request names one", () => {
    const build = (payload: Record<string, unknown>) =>
      (new GoogleImagenProtocol().buildGenerateRequest({
        spec: GOOGLE_IMAGEN_SPEC,
        request: request(payload),
        wireModelId: GOOGLE_IMAGEN_SPEC.wireModelId,
      }).request.body as { generationConfig: Record<string, unknown> }).generationConfig;
    expect(build({ prompt: "Brochure page", aspectRatio: "3:4" }).imageConfig).toEqual({ aspectRatio: "3:4" });
    expect(build({ prompt: "Brochure page" }).imageConfig).toBeUndefined();
  });

  it("Ideogram sends aspect_ratio as WxH; Recraft sends a matching size", () => {
    const ideo = new IdeogramImageProtocol().buildGenerateRequest({
      spec: IDEOGRAM_IMAGE_SPEC,
      request: request({ prompt: "Page", aspectRatio: "3:4" }),
      wireModelId: IDEOGRAM_IMAGE_SPEC.wireModelId,
    }).request.body as Record<string, unknown>;
    expect(ideo.aspect_ratio).toBe("3x4");
    const recraft = new RecraftImageProtocol().buildGenerateRequest({
      spec: RECRAFT_IMAGE_SPEC,
      request: request({ prompt: "Page", aspectRatio: "3:4" }),
      wireModelId: RECRAFT_IMAGE_SPEC.wireModelId,
    }).request.body as Record<string, unknown>;
    expect(recraft.size).toBe("1024x1365");
  });
});
