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
        semanticReferenceRole: "identity_mark",
      },
    },
    metadata: {
      referenceInputPresent: true,
      // Provenance only — must not invent semantic role by itself.
      referenceInputType: "brand_vault_asset",
      productAction: "route_visual",
    },
    context: {} as never,
    timeoutPolicy: {} as never,
    retryPolicy: {} as never,
  };
}

describe("Ideogram reference images with canonical roles", () => {
  it("sends logo bytes and preserves identity_mark semantic role (not style_reference)", () => {
    const plan = new IdeogramImageProtocol().buildGenerateRequest({
      spec: IDEOGRAM_IMAGE_SPEC,
      request: requestWithLogo("Instagram feed post for Sunflower oats"),
      wireModelId: IDEOGRAM_IMAGE_SPEC.wireModelId,
    });
    expect(plan.request.form?.fields.prompt).toContain("Sunflower");
    expect(plan.request.form?.fields.prompt).toMatch(/REFERENCE ROLE = identity_mark/);
    expect(plan.referenceAdaptation?.[0]?.canonicalRole).toBe("identity_mark");
    expect(plan.referenceAdaptation?.[0]?.canonicalRole).not.toBe("style_reference");
    expect(plan.request.form?.files?.[0]?.fieldName).toBe(
      "character_reference_images",
    );
    expect(plan.referenceAdaptation?.[0]?.providerSemanticMeaning).toBe(
      "identity_preservation",
    );
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

  it("brand_vault_asset provenance alone does not invent identity_mark guidance", () => {
    const plan = new IdeogramImageProtocol().buildGenerateRequest({
      spec: IDEOGRAM_IMAGE_SPEC,
      request: {
        ...requestWithLogo("post"),
        payload: {
          prompt: "post",
          text: "post",
          image: {
            mimeType: "image/png",
            url: `data:image/png;base64,${TINY_PNG}`,
          },
        },
        metadata: {
          referenceInputPresent: true,
          referenceInputType: "brand_vault_asset",
        },
      },
      wireModelId: IDEOGRAM_IMAGE_SPEC.wireModelId,
    });
    expect(plan.referenceAdaptation ?? []).toHaveLength(0);
    expect(String(plan.request.form?.fields.prompt)).not.toMatch(
      /REFERENCE ROLE = identity_mark/,
    );
  });
});
