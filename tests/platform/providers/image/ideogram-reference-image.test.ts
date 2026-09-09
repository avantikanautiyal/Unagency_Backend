import { IdeogramImageProtocol } from "../../../../src/platform/providers/image/ideogram/ideogram-image-protocol";
import { IDEOGRAM_IMAGE_SPEC } from "../../../../src/platform/providers/image/configs/verified-image-provider-specs";
import { sanitizeProviderWireBody } from "../../../../src/platform/collaboration/conversational-task-intelligence/forensic-image-constraint-audit";
import type { ProviderExecutionRequest } from "../../../../src/platform/providers/runtime/contracts/provider-execution-request";

const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function requestWithLogo(prompt: string): ProviderExecutionRequest {
  return {
    requestId: "req_logo",
    providerId: IDEOGRAM_IMAGE_SPEC.canonicalProviderId as never,
    modelId: IDEOGRAM_IMAGE_SPEC.inventoryModelId,
    capabilityId: "image.generate" as never,
    payload: {
      prompt,
      text: prompt,
      image: {
        mimeType: "image/png",
        url: `data:image/png;base64,${TINY_PNG}`,
      },
    },
    metadata: {
      referenceInputPresent: true,
      referenceInputType: "brand_vault_asset",
      productAction: "route_visual",
    },
    context: {} as never,
    timeoutPolicy: {} as never,
    retryPolicy: {} as never,
  };
}

describe("Ideogram style reference for vault logos", () => {
  it("sends the logo as style_reference_images instead of dropping it", () => {
    const plan = new IdeogramImageProtocol().buildGenerateRequest({
      spec: IDEOGRAM_IMAGE_SPEC,
      request: requestWithLogo("Instagram feed post for Sunflower oats"),
      wireModelId: IDEOGRAM_IMAGE_SPEC.wireModelId,
    });
    expect(plan.request.form?.fields.prompt).toContain("Sunflower");
    expect(plan.request.form?.files?.[0]?.fieldName).toBe("style_reference_images");
    expect(plan.request.form?.files?.[0]?.base64).toBe(TINY_PNG);
    expect(plan.request.body).toBeUndefined();
  });

  it("keeps JSON generate when no reference image is present", () => {
    const plan = new IdeogramImageProtocol().buildGenerateRequest({
      spec: IDEOGRAM_IMAGE_SPEC,
      request: {
        ...requestWithLogo("plain prompt"),
        payload: { prompt: "plain prompt", text: "plain prompt" },
      },
      wireModelId: IDEOGRAM_IMAGE_SPEC.wireModelId,
    });
    expect(plan.request.body).toEqual({
      prompt: "plain prompt",
      rendering_speed: "DEFAULT",
    });
    expect(plan.request.form).toBeUndefined();
  });

  it("forensic wire audit detects style_reference_images", () => {
    const audit = sanitizeProviderWireBody({
      prompt: "Instagram post",
      rendering_speed: "DEFAULT",
      style_reference_images: ["style_reference_images"],
    });
    expect(audit.hasReferenceImage).toBe(true);
  });
});
