/**
 * Downstream project stages must receive the approved upstream creatives, not
 * only the brand logo. The Gemini adapter used to send references[0] alone —
 * which was always the logo — so every stage re-invented the design.
 */

import type { ProviderExecutionRequest } from "../../../../src/platform/providers/runtime/contracts/provider-execution-request";
import { GoogleImagenProtocol } from "../../../../src/platform/providers/image/google/google-imagen-protocol";
import { GOOGLE_IMAGEN_SPEC } from "../../../../src/platform/providers/image/configs/verified-image-provider-specs";
import {
  describeReferenceImages,
  extractReferenceImages,
  orderReferencesForContinuity,
} from "../../../../src/platform/providers/image/common/vendor-image-protocol";

const png = (seed: string) =>
  `data:image/png;base64,${Buffer.from(`png-bytes-${seed}`.padEnd(80, "x")).toString("base64")}`;

const logo = {
  url: png("logo"),
  mimeType: "image/png",
  assetId: "6acdf3b48adb08b135d7eca6",
  semanticReferenceRole: "identity_mark",
};
const threeD = {
  url: png("3d"),
  mimeType: "image/png",
  assetId: "cdfart_3d",
  semanticReferenceRole: "subject_reference",
  relationshipLabel: "cdf_upstream_visual_artifact",
  cdfUpstreamPhaseId: "3d-direction",
};
const frontPack = {
  url: png("front"),
  mimeType: "image/png",
  assetId: "cdfart_front",
  semanticReferenceRole: "subject_reference",
  relationshipLabel: "cdf_upstream_visual_artifact",
  cdfUpstreamPhaseId: "front-pack",
};

function request(): ProviderExecutionRequest {
  return {
    requestId: "req_continuity",
    providerId: GOOGLE_IMAGEN_SPEC.canonicalProviderId as never,
    modelId: GOOGLE_IMAGEN_SPEC.inventoryModelId,
    capabilityId: "image.generate" as never,
    payload: {
      prompt: "Complete pack system for the approved design.",
      // Product assets put the logo in `image` and first in `assets`.
      image: logo,
      assets: [logo, frontPack, threeD],
    },
    metadata: { logoAssetId: logo.assetId },
    context: {} as never,
    timeoutPolicy: {} as never,
    retryPolicy: {} as never,
  };
}

describe("continuity reference images", () => {
  it("orders upstream stage creatives before the brand logo", () => {
    const ordered = orderReferencesForContinuity(
      extractReferenceImages(request().payload ?? {}, request().metadata),
    );
    expect(ordered.map((r) => r.assetId)).toEqual([
      "cdfart_front",
      "cdfart_3d",
      "6acdf3b48adb08b135d7eca6",
    ]);
  });

  it("sends every reference to Gemini, upstream first, with a description of each", () => {
    const plan = new GoogleImagenProtocol().buildGenerateRequest({
      spec: GOOGLE_IMAGEN_SPEC,
      request: request(),
      wireModelId: GOOGLE_IMAGEN_SPEC.wireModelId,
    });
    const parts = ((plan.request.body as { contents?: Array<{ parts?: unknown[] }> })
      .contents?.[0]?.parts ?? []) as Array<Record<string, unknown>>;
    const images = parts.filter((p) => p.inlineData);
    expect(images).toHaveLength(3);
    const firstData = (images[0]!.inlineData as { data: string }).data;
    expect(firstData).toBe(frontPack.url.split(",")[1]);
    const text = String(parts.find((p) => p.text)?.text);
    expect(text).toContain("Image 1: the approved front pack stage output");
    expect(text).toContain("Image 3: the brand logo");
  });

  it("adds no description when only a logo is attached", () => {
    const refs = extractReferenceImages({ image: logo }, { logoAssetId: logo.assetId });
    expect(describeReferenceImages(refs)).toBe("");
  });
});
