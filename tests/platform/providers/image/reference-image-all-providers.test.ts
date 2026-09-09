import { mapCanonicalToOpenAIRequest } from "../../../../src/platform/providers/openai/requests/request-mapper";
import type { ProviderAdapterRequest } from "../../../../src/platform/providers/adapters/contracts/adapter-io";
import { asProviderId } from "../../../../src/platform/core/identifiers";
import { asProviderAdapterId } from "../../../../src/platform/providers/adapters/contracts/identifiers";
import { RecraftImageProtocol } from "../../../../src/platform/providers/image/recraft/recraft-image-protocol";
import { RECRAFT_IMAGE_SPEC } from "../../../../src/platform/providers/image/configs/verified-image-provider-specs";
import { sanitizeProviderWireBody } from "../../../../src/platform/collaboration/conversational-task-intelligence/forensic-image-constraint-audit";
import type { ProviderExecutionRequest } from "../../../../src/platform/providers/runtime/contracts/provider-execution-request";
import {
  providerSupportsReferenceImage,
  listReferenceImageProviderIds,
} from "../../../../src/platform/providers/image/configs/image-provider-capabilities";

const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function openaiAdapterRequest(
  prompt: string,
  withImage: boolean,
): ProviderAdapterRequest {
  return {
    requestId: "req_ref",
    providerId: asProviderId("provider.openai"),
    adapterId: asProviderAdapterId("adapter.openai"),
    modelId: "gpt-image-1.5",
    capabilityId: "image.generate" as never,
    modality: "image",
    input: {
      prompt,
      text: prompt,
      ...(withImage
        ? {
            image: {
              mimeType: "image/png",
              url: `data:image/png;base64,${TINY_PNG}`,
            },
          }
        : {}),
    },
    parameters: {},
    features: [],
    streaming: false,
    timeoutMs: 60_000,
    metadata: {},
    createdAt: new Date().toISOString(),
  };
}

describe("OpenAI reference image → images.edits", () => {
  it("routes attached reference images to /images/edits with image_url payloads", () => {
    const wire = mapCanonicalToOpenAIRequest(
      openaiAdapterRequest("Jacket mockup with our brand logo", true),
      "gpt-image-1.5",
      { modality: "image" },
    );
    expect(wire.operation).toBe("images.edits");
    expect(wire.path).toBe("/images/edits");
    const body = wire.body as Record<string, unknown>;
    expect(Array.isArray(body.images)).toBe(true);
    expect((body.images as Array<{ image_url: string }>)[0]?.image_url).toContain(
      "data:image/png;base64,",
    );
    expect(body.input_fidelity).toBe("high");
    expect(String(body.prompt)).toMatch(/reference|logo|attached/i);
  });

  it("keeps text-only generate on /images/generations when no reference is present", () => {
    const wire = mapCanonicalToOpenAIRequest(
      openaiAdapterRequest("Abstract blue background", false),
      "gpt-image-1.5",
      { modality: "image" },
    );
    expect(wire.operation).toBe("images.generations");
    expect(wire.path).toBe("/images/generations");
    expect((wire.body as Record<string, unknown>).images).toBeUndefined();
  });
});

describe("Recraft style_reference_urls", () => {
  it("attaches reference images as style_reference_urls", () => {
    const request: ProviderExecutionRequest = {
      requestId: "req_recraft",
      providerId: RECRAFT_IMAGE_SPEC.canonicalProviderId as never,
      modelId: RECRAFT_IMAGE_SPEC.inventoryModelId,
      capabilityId: "image.generate" as never,
      payload: {
        prompt: "Social post for launch",
        image: {
          mimeType: "image/png",
          base64: TINY_PNG,
        },
      },
      metadata: {},
      context: {} as never,
      timeoutPolicy: {} as never,
      retryPolicy: {} as never,
    };
    const plan = new RecraftImageProtocol().buildGenerateRequest({
      spec: RECRAFT_IMAGE_SPEC,
      request,
      wireModelId: RECRAFT_IMAGE_SPEC.wireModelId,
    });
    const body = plan.request.body as Record<string, unknown>;
    expect(Array.isArray(body.style_reference_urls)).toBe(true);
    expect((body.style_reference_urls as string[])[0]).toContain("base64,");
  });

  it("forensic audit detects OpenAI images and Recraft style_reference_urls", () => {
    expect(
      sanitizeProviderWireBody({
        prompt: "x",
        images: [{ image_url: "data:image/png;base64,xx" }],
      }).hasReferenceImage,
    ).toBe(true);
    expect(
      sanitizeProviderWireBody({
        prompt: "x",
        style_reference_urls: ["data:image/png;base64,xx"],
      }).hasReferenceImage,
    ).toBe(true);
  });
});

describe("reference image capability registry", () => {
  it("marks OpenAI and Recraft as reference-capable", () => {
    expect(providerSupportsReferenceImage("provider.openai")).toBe(true);
    expect(providerSupportsReferenceImage("provider.recraft")).toBe(true);
    expect(providerSupportsReferenceImage("provider.google")).toBe(true);
    expect(providerSupportsReferenceImage("provider.ideogram")).toBe(true);
    expect(listReferenceImageProviderIds()).toEqual(
      expect.arrayContaining([
        "provider.openai",
        "provider.recraft",
        "provider.google",
        "provider.ideogram",
      ]),
    );
  });
});
