/**
 * Ideogram image generation — verified wire contract.
 * POST /v1/ideogram-v3/generate
 * Auth: Api-Key
 *
 * Reference semantics are resolved via the provider capability registry:
 *   identity_mark → character_reference_images (identity preservation)
 *   style_reference → style_reference_images (style transfer)
 */

import type {
  IVendorImageProtocol,
  VendorImageNormalizedResult,
  VendorImageWirePlan,
} from "../common/vendor-image-protocol";
import {
  applyProviderReferenceAdaptations,
  extractPrompt,
  extractReferenceImages,
} from "../common/vendor-image-protocol";
import { buildProviderReferenceRoleObservability } from "../../../ai/multimodal-context/reference-role";
import { adaptCanonicalReferenceForProvider } from "../common/adapt-provider-reference";
import type { VerifiedImageProviderSpec } from "../configs/verified-image-provider-specs";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import {
  attachMediaOutputs,
  type CanonicalMediaOutput,
} from "../../common/media-output";

function extensionForMime(mimeType: string): string {
  const mime = mimeType.toLowerCase();
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("svg")) return "svg";
  return "png";
}

export class IdeogramImageProtocol implements IVendorImageProtocol {
  readonly vendor = "ideogram";

  validateModel(spec: VerifiedImageProviderSpec, wireModelId: string): boolean {
    const lower = wireModelId.toLowerCase();
    return (
      wireModelId === spec.inventoryModelId ||
      wireModelId === spec.wireModelId ||
      lower.includes("ideogram")
    );
  }

  buildGenerateRequest(input: {
    spec: VerifiedImageProviderSpec;
    request: ProviderExecutionRequest;
    wireModelId: string;
  }): VendorImageWirePlan {
    const basePrompt = extractPrompt(input.request.payload);
    const references = extractReferenceImages(
      input.request.payload,
      input.request.metadata as Readonly<Record<string, unknown>> | undefined,
    );
    const { prompt, adaptations } = applyProviderReferenceAdaptations({
      basePrompt,
      references,
      vendor: this.vendor,
    });
    const reference = references[0];
    const base64 = reference?.base64?.trim();
    const role = reference?.semanticReferenceRole;
    const wire =
      role != null
        ? adaptCanonicalReferenceForProvider({ vendor: this.vendor, role })
        : undefined;

    if (base64 && wire?.deliverBytes && wire.providerTransport) {
      const mimeType = reference?.mimeType || "image/png";
      const transport = wire.providerTransport.fieldName;
      return {
        request: {
          method: "POST",
          path: "/v1/ideogram-v3/generate",
          form: {
            fields: {
              prompt,
              rendering_speed: "DEFAULT",
            },
            files: [
              {
                fieldName: transport,
                filename: `${adaptations[0]?.canonicalRole ?? "reference"}.${extensionForMime(mimeType)}`,
                mimeType,
                base64,
              },
            ],
          },
        },
        referenceAdaptation: adaptations,
        referenceRoleObservability: buildProviderReferenceRoleObservability({
          canonicalRole:
            adaptations[0]?.canonicalRole ?? reference?.semanticReferenceRole,
          resolutionSource:
            typeof (reference as { referenceRoleResolutionSource?: string })
              ?.referenceRoleResolutionSource === "string"
              ? (reference as { referenceRoleResolutionSource: string })
                  .referenceRoleResolutionSource
              : undefined,
          transportFieldName: transport,
          adaptations,
        }),
      };
    }

    return {
      request: {
        method: "POST",
        path: "/v1/ideogram-v3/generate",
        headers: { "Content-Type": "application/json" },
        body: {
          prompt,
          rendering_speed: "DEFAULT",
        },
      },
      ...(adaptations.length ? { referenceAdaptation: adaptations } : {}),
      referenceRoleObservability: buildProviderReferenceRoleObservability({
        canonicalRole: adaptations[0]?.canonicalRole,
        adaptations,
      }),
    };
  }

  normalizeGenerateResponse(input: {
    spec: VerifiedImageProviderSpec;
    body: Readonly<Record<string, unknown>>;
    headers: Readonly<Record<string, string>>;
  }): VendorImageNormalizedResult {
    const data = input.body.data as Array<Record<string, unknown>> | undefined;
    const outputs: CanonicalMediaOutput[] = Array.isArray(data)
      ? data
          .map((item) => {
            const url = typeof item.url === "string" ? item.url : undefined;
            return url
              ? ({ type: "image", mimeType: "image/png", url } as CanonicalMediaOutput)
              : undefined;
          })
          .filter((x): x is CanonicalMediaOutput => Boolean(x))
      : [];
    return {
      output: attachMediaOutputs(
        { content: `[${outputs.length} image(s)]`, provider: input.spec.vendor },
        outputs
      ),
      usage: { imagesGenerated: outputs.length },
    };
  }

  mapProviderError(status: number, body: Readonly<Record<string, unknown>>): string {
    return `Ideogram HTTP ${status}: ${JSON.stringify(body).slice(0, 200)}`;
  }
}
