/**
 * Recraft image generation — verified wire contract.
 * POST /v1/images/generations (OpenAI-compatible shape)
 * Auth: Bearer
 *
 * Reference semantics via capability registry — style_reference_urls only
 * supports style transfer; identity roles are prompt-only.
 */

import {
  nearestSupportedAspectRatio,
  readAspectRatioFromPayload,
} from "../common/image-aspect-ratio";
import type {
  IVendorImageProtocol,
  VendorImageNormalizedResult,
  VendorImageWirePlan,
} from "../common/vendor-image-protocol";
import {
  applyProviderReferenceAdaptations,
  extractPrompt,
  extractReferenceImages,
  referenceImageToDataUrl,
} from "../common/vendor-image-protocol";
import { buildProviderReferenceRoleObservability } from "../../../ai/multimodal-context/reference-role";
import type { VerifiedImageProviderSpec } from "../configs/verified-image-provider-specs";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import {
  attachMediaOutputs,
  mapOpenAIImageDataToOutputs,
} from "../../common/media-output";

/** Recraft v3 sizes keyed by their ratio. */
const RECRAFT_SIZES: Readonly<Record<string, string>> = {
  "1:1": "1024x1024",
  "4:3": "1365x1024",
  "3:4": "1024x1365",
  "3:2": "1536x1024",
  "2:3": "1024x1536",
  "16:9": "1820x1024",
  "9:16": "1024x1820",
  "5:4": "1280x1024",
  "4:5": "1024x1280",
  "1:2": "1024x2048",
  "2:1": "2048x1024",
};

export class RecraftImageProtocol implements IVendorImageProtocol {
  readonly vendor = "recraft";

  validateModel(spec: VerifiedImageProviderSpec, wireModelId: string): boolean {
    const lower = wireModelId.toLowerCase();
    return (
      wireModelId === spec.inventoryModelId ||
      wireModelId === spec.wireModelId ||
      lower.includes("recraft")
    );
  }

  buildGenerateRequest(input: {
    spec: VerifiedImageProviderSpec;
    request: ProviderExecutionRequest;
    wireModelId: string;
  }): VendorImageWirePlan {
    const basePrompt = extractPrompt(input.request.payload);
    const refs = extractReferenceImages(
      input.request.payload ?? {},
      input.request.metadata as Readonly<Record<string, unknown>> | undefined,
    );
    const { prompt, adaptations } = applyProviderReferenceAdaptations({
      basePrompt,
      references: refs,
      vendor: this.vendor,
    });
    const primary = adaptations[0];
    const styleUrls =
      primary?.deliverBytes && primary.useStyleReferenceChannel
        ? refs
            .map((ref) => referenceImageToDataUrl(ref))
            .filter((url): url is string => Boolean(url))
            .slice(0, 10)
        : [];

    const body: Record<string, unknown> = {
      prompt,
      model: input.spec.wireModelId,
      n: 1,
    };
    const ratio = nearestSupportedAspectRatio(
      readAspectRatioFromPayload(input.request.payload ?? {}),
      Object.keys(RECRAFT_SIZES),
    );
    if (ratio) body.size = RECRAFT_SIZES[ratio];
    if (styleUrls.length > 0) {
      body.style_reference_urls = styleUrls;
    }

    return {
      request: {
        method: "POST",
        path: "/v1/images/generations",
        headers: { "Content-Type": "application/json" },
        body,
      },
      ...(adaptations.length ? { referenceAdaptation: adaptations } : {}),
      referenceRoleObservability: buildProviderReferenceRoleObservability({
        canonicalRole: primary?.canonicalRole ?? refs[0]?.semanticReferenceRole,
        resolutionSource:
          typeof (refs[0] as { referenceRoleResolutionSource?: string })
            ?.referenceRoleResolutionSource === "string"
            ? (refs[0] as { referenceRoleResolutionSource: string })
                .referenceRoleResolutionSource
            : undefined,
        transportFieldName:
          styleUrls.length > 0 ? "style_reference_urls" : undefined,
        adaptations,
      }),
    };
  }

  normalizeGenerateResponse(input: {
    spec: VerifiedImageProviderSpec;
    body: Readonly<Record<string, unknown>>;
    headers: Readonly<Record<string, string>>;
  }): VendorImageNormalizedResult {
    const outputs = mapOpenAIImageDataToOutputs(input.body);
    return {
      output: attachMediaOutputs(
        { content: `[${outputs.length} image(s)]`, provider: input.spec.vendor },
        outputs
      ),
      usage: { imagesGenerated: outputs.length },
    };
  }

  mapProviderError(status: number, body: Readonly<Record<string, unknown>>): string {
    return `Recraft HTTP ${status}: ${JSON.stringify(body).slice(0, 200)}`;
  }
}
