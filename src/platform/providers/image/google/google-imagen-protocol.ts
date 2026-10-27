/**
 * Google Gemini native image generation (generateContent + IMAGE modality).
 * Imagen :predict is deprecated for new API keys — use gemini-*-image models.
 */

import type {
  IVendorImageProtocol,
  VendorImageNormalizedResult,
  VendorImageWirePlan,
} from "../common/vendor-image-protocol";
import {
  applyProviderReferenceAdaptations,
  approvedStageMode,
  describeReferenceImages,
  requestIsOneOfSeveralOptions,
  requestIsRefinement,
  requestIsNewViewpoint,
  extractPrompt,
  extractReferenceImages,
  orderReferencesForContinuity,
} from "../common/vendor-image-protocol";
import { buildProviderReferenceRoleObservability } from "../../../ai/multimodal-context/reference-role";
import {
  nearestSupportedAspectRatio,
  readAspectRatioFromPayload,
  resolvePayloadAspectRatio,
} from "../common/image-aspect-ratio";

/** Ratios Gemini image models accept in generationConfig.imageConfig. */
const GEMINI_IMAGE_ASPECT_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
import type { VerifiedImageProviderSpec } from "../configs/verified-image-provider-specs";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import {
  attachMediaOutputs,
  type CanonicalMediaOutput,
} from "../../common/media-output";

const WIRE_BY_MODEL: Record<string, string> = {
  "imagen-4": "gemini-3.1-flash-image",
  "imagen-4.0-generate-001": "gemini-3.1-flash-image",
  "gemini-2.5-flash-image": "gemini-2.5-flash-image",
  "gemini-3.1-flash-image": "gemini-3.1-flash-image",
  "gemini-3.1-flash-lite-image": "gemini-3.1-flash-lite-image",
  "gemini-3-pro-image": "gemini-3-pro-image",
};

/** Reference images per request — Gemini image models accept several inline parts. */
const MAX_GEMINI_REFERENCE_IMAGES = 6;

export class GoogleImagenProtocol implements IVendorImageProtocol {
  readonly vendor = "google";

  validateModel(spec: VerifiedImageProviderSpec, wireModelId: string): boolean {
    const lower = wireModelId.toLowerCase();
    return (
      wireModelId === spec.inventoryModelId ||
      wireModelId === spec.wireModelId ||
      lower.includes("imagen") ||
      lower.includes("flash-image") ||
      lower.includes("pro-image") ||
      Boolean(WIRE_BY_MODEL[wireModelId])
    );
  }

  buildGenerateRequest(input: {
    spec: VerifiedImageProviderSpec;
    request: ProviderExecutionRequest;
    wireModelId: string;
  }): VendorImageWirePlan {
    const basePrompt = extractPrompt(input.request.payload);
    const aspectRatio = resolvePayloadAspectRatio(input.request.payload);
    // Prompt text alone is ignored by Gemini when a reference image is attached
    // (it copies the reference's shape) — an explicit ratio goes on the wire.
    const wireAspectRatio = nearestSupportedAspectRatio(
      readAspectRatioFromPayload(input.request.payload),
      GEMINI_IMAGE_ASPECT_RATIOS,
    );
    const references = orderReferencesForContinuity(
      extractReferenceImages(
        input.request.payload,
        input.request.metadata as Readonly<Record<string, unknown>> | undefined,
      ),
    );
    const reference = references[0];
    const capability = String(input.request.capabilityId ?? "").toLowerCase();
    const operationKind =
      typeof input.request.metadata?.visualOperationKind === "string"
        ? input.request.metadata.visualOperationKind.toUpperCase()
        : "";
    const isArtifactEdit =
      capability === "image.edit" ||
      operationKind === "MODIFY" ||
      operationKind === "REGENERATE";
    const { prompt: rolePrompt, adaptations } = applyProviderReferenceAdaptations({
      basePrompt,
      references: isArtifactEdit ? [] : references,
      vendor: "google_gemini_image",
    });
    // An edit modifies one existing result; generation may carry the approved
    // upstream creatives plus the brand mark — send all of them, in order.
    const sentReferences = (isArtifactEdit ? references.slice(0, 1) : references)
      .filter((ref) => Boolean(ref.base64))
      .slice(0, MAX_GEMINI_REFERENCE_IMAGES);
    // Reference roles lead the prompt so a long brief cannot bury the approved design.
    const promptWithFormat = [
      aspectRatio ? `Generate a ${aspectRatio} aspect ratio image.` : "Generate an image.",
      isArtifactEdit && reference
        ? "The attached image is the existing result to modify — preserve unchanged elements unless the instruction explicitly changes them."
        : "",
      isArtifactEdit
        ? ""
        : describeReferenceImages(sentReferences, {
            oneOfSeveralOptions: requestIsOneOfSeveralOptions(
              input.request.metadata as Readonly<Record<string, unknown>> | undefined,
            ),
            refinement: requestIsRefinement(
              input.request.metadata as Readonly<Record<string, unknown>> | undefined,
            ),
            newViewpoint: requestIsNewViewpoint(
              input.request.metadata as Readonly<Record<string, unknown>> | undefined,
            ),
            stageMode: approvedStageMode(
              input.request.metadata as Readonly<Record<string, unknown>> | undefined,
            ),
          }),
      rolePrompt,
    ]
      .filter(Boolean)
      .join(" ");
    const model =
      WIRE_BY_MODEL[input.wireModelId] ??
      WIRE_BY_MODEL[input.spec.wireModelId] ??
      input.spec.wireModelId;
    const parts: Record<string, unknown>[] = [{ text: promptWithFormat }];
    const primary = adaptations[0];
    if (primary?.deliverBytes !== false) {
      for (const ref of sentReferences) {
        parts.push({
          inlineData: {
            mimeType: ref.mimeType,
            data: ref.base64,
          },
        });
      }
    }
    return {
      request: {
        method: "POST",
        path: `/models/${model}:generateContent`,
        headers: { "Content-Type": "application/json" },
        body: {
          contents: [
            {
              parts,
            },
          ],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            ...(wireAspectRatio ? { imageConfig: { aspectRatio: wireAspectRatio } } : {}),
          },
        },
      },
      ...(adaptations.length ? { referenceAdaptation: adaptations } : {}),
      referenceRoleObservability: buildProviderReferenceRoleObservability({
        canonicalRole:
          primary?.canonicalRole ?? reference?.semanticReferenceRole,
        resolutionSource:
          typeof (reference as { referenceRoleResolutionSource?: string })
            ?.referenceRoleResolutionSource === "string"
            ? (reference as { referenceRoleResolutionSource: string })
                .referenceRoleResolutionSource
            : undefined,
        transportFieldName: reference?.base64 ? "inlineData" : undefined,
        adaptations,
      }),
    };
  }

  normalizeGenerateResponse(input: {
    spec: VerifiedImageProviderSpec;
    body: Readonly<Record<string, unknown>>;
    headers: Readonly<Record<string, string>>;
  }): VendorImageNormalizedResult {
    const outputs: CanonicalMediaOutput[] = [];

    const predictions = input.body.predictions as
      | Array<Record<string, unknown>>
      | undefined;
    if (Array.isArray(predictions)) {
      predictions.forEach((item, index) => {
        const b64 =
          typeof item.bytesBase64Encoded === "string"
            ? item.bytesBase64Encoded
            : undefined;
        if (!b64) return;
        const mime =
          typeof item.mimeType === "string" ? item.mimeType : "image/png";
        outputs.push({
          type: "image",
          mimeType: mime,
          url: `data:${mime};base64,${b64}`,
          base64: b64,
          storageRef: `inline:base64:${index}`,
          metadata: { providerFormat: "base64" },
        });
      });
    }

    const candidates = input.body.candidates as
      | Array<Record<string, unknown>>
      | undefined;
    if (Array.isArray(candidates)) {
      let index = outputs.length;
      for (const cand of candidates) {
        const content = cand.content as Record<string, unknown> | undefined;
        const parts = content?.parts as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(parts)) continue;
        for (const part of parts) {
          const inline =
            (part.inlineData as Record<string, unknown> | undefined) ??
            (part.inline_data as Record<string, unknown> | undefined);
          if (!inline) continue;
          const b64 =
            typeof inline.data === "string" ? inline.data : undefined;
          if (!b64) continue;
          const mime =
            typeof inline.mimeType === "string"
              ? inline.mimeType
              : typeof inline.mime_type === "string"
                ? inline.mime_type
                : "image/png";
          outputs.push({
            type: "image",
            mimeType: mime,
            url: `data:${mime};base64,${b64}`,
            base64: b64,
            storageRef: `inline:base64:${index++}`,
            metadata: { providerFormat: "base64" },
          });
        }
      }
    }

    return {
      output: attachMediaOutputs(
        { content: `[${outputs.length} image(s)]`, provider: input.spec.vendor },
        outputs
      ),
      usage: { imagesGenerated: outputs.length },
    };
  }

  mapProviderError(status: number, body: Readonly<Record<string, unknown>>): string {
    return `Google image HTTP ${status}: ${JSON.stringify(body).slice(0, 200)}`;
  }
}
