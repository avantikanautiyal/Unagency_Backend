/**
 * OpenAI Provider Adapter — reference adapter implementation.
 */

import { failure, success, type Result } from "../../../core/result";
import { ValidationError } from "../../../core/errors";
import { asProviderId } from "../../../core/identifiers";
import { AbstractMultimodalProviderAdapter } from "../../adapters/base/specialized-adapters";
import type { AbstractAdapterDeps } from "../../adapters/base/abstract-provider-adapter";
import type { ProviderAdapterMetadata } from "../../adapters/contracts/adapter-descriptor";
import type {
  ProviderAdapterRequest,
  ProviderWirePayload,
} from "../../adapters/contracts/adapter-io";
import type { ProviderManifest } from "../../adapters/contracts/provider-manifest";
import type {
  ProviderTranslationResult,
  ProviderValidationResult,
} from "../../adapters/contracts/results";
import { asProviderAdapterId } from "../../adapters/contracts/identifiers";
import { mapCanonicalToOpenAIRequest } from "../requests/request-mapper";
import type { DesiredCapabilityProfile } from "../contracts/openai-contracts";
import type { IOpenAIModelResolver } from "../models/model-resolver";
import type { IOpenAIModelDiscovery } from "../discovery/model-discovery";
import {
  OPENAI_ADAPTER_ID,
  OPENAI_PROVIDER_ID,
  OPENAI_VENDOR,
  OPENAI_PROVIDER_VERSION,
} from "../constants";

export class OpenAIProviderAdapter extends AbstractMultimodalProviderAdapter {
  constructor(
    manifest: ProviderManifest,
    private readonly discovery: IOpenAIModelDiscovery,
    private readonly resolver: IOpenAIModelResolver,
    deps: AbstractAdapterDeps = {}
  ) {
    const metadata: ProviderAdapterMetadata = {
      adapterId: asProviderAdapterId(OPENAI_ADAPTER_ID),
      providerId: asProviderId(OPENAI_PROVIDER_ID),
      vendor: OPENAI_VENDOR,
      category: "multimodal",
      version: OPENAI_PROVIDER_VERSION,
      description: "OpenAI reference provider adapter",
      tags: ["openai", "reference"],
    };
    super(metadata, manifest, deps);
  }

  translateRequest(
    request: ProviderAdapterRequest
  ): Result<ProviderTranslationResult<ProviderWirePayload>> {
    const profile = extractProfile(request);
    const inventory = this.discovery.getCached();
    const requestedModelId = request.modelId?.trim();

    // Routing authority: if the request includes a concrete modelId, use it
    // as the single source of truth (no independent ranking/select).
    if (requestedModelId) {
      // Model Registry canonical ids use the form "<providerVendor>/<modelId>"
      // (e.g. "openai/gpt-4o"). The OpenAI leaf operates on wire-model ids
      // (e.g. "gpt-4o"), so strip any canonical provider prefix.
      const wireModelId = requestedModelId.includes("/")
        ? requestedModelId.split("/").slice(-1)[0] ?? requestedModelId
        : requestedModelId;

      const match = inventory.find((m) => m.id === wireModelId);
      if (!match) {
        return failure(
          new ValidationError(
            `Requested modelId '${requestedModelId}' (wire '${wireModelId}') is not available in OpenAI discovery cache`
          )
        );
      }

      const wire = mapCanonicalToOpenAIRequest(
        request,
        wireModelId,
        profile
      );
      return success({
        value: { ...wire, resolvedModelId: wireModelId },
        warnings: [],
        droppedFields: [],
      });
    }

    const resolved = this.resolver.resolve(profile, inventory);

    const modelId =
      resolved.ok ? resolved.value.selectedModelId : inventory[0]?.id ?? "unresolved";

    const wire = mapCanonicalToOpenAIRequest(request, modelId, profile);

    return success({
      value: {
        ...wire,
        resolvedModelId: modelId,
        resolution: resolved.ok ? resolved.value : undefined,
      },
      warnings: resolved.ok
        ? []
        : [
            {
              code: "model_resolution_fallback",
              message: resolved.ok ? "" : resolved.error.message,
              severity: "warning" as const,
            },
          ],
      droppedFields: [],
    });
  }

  validate(request: ProviderAdapterRequest): Result<ProviderValidationResult> {
    const wireModelId = request.modelId.includes("/")
      ? request.modelId.split("/").slice(-1)[0] ?? request.modelId
      : request.modelId;

    if (
      request.modality === "image" ||
      String(request.capabilityId).toLowerCase() === "image.generate" ||
      String(request.capabilityId).toLowerCase() === "image.edit"
    ) {
      const isImageModel =
        wireModelId.includes("dall-e") || wireModelId.includes("gpt-image");
      if (!isImageModel) {
        return success({
          valid: false,
          issues: [
            {
              code: "model_capability_mismatch",
              message: `Model '${request.modelId}' does not support image generation/edit`,
              severity: "error",
            },
          ],
        });
      }
    }

    const cap = String(request.capabilityId).toLowerCase();
    if (cap === "audio.transcribe" || cap === "speech.transcribe") {
      const isWhisper = wireModelId.includes("whisper");
      if (!isWhisper) {
        return success({
          valid: false,
          issues: [
            {
              code: "model_capability_mismatch",
              message: `Model '${request.modelId}' does not support audio.transcribe`,
              severity: "error",
            },
          ],
        });
      }
    }

    if (cap === "audio.synthesize" || cap === "audio.speech_generation" || cap === "speech.synthesize") {
      const isTts = wireModelId.startsWith("tts-");
      if (!isTts) {
        return success({
          valid: false,
          issues: [
            {
              code: "model_capability_mismatch",
              message: `Model '${request.modelId}' does not support audio.synthesize`,
              severity: "error",
            },
          ],
        });
      }
    }

    if (
      cap === "embedding.generate" ||
      cap === "text.embed" ||
      request.modality === "embedding"
    ) {
      const isEmbeddingModel = wireModelId.includes("embedding");
      if (!isEmbeddingModel) {
        return success({
          valid: false,
          issues: [
            {
              code: "model_capability_mismatch",
              message: `Model '${request.modelId}' does not support embedding.generate`,
              severity: "error",
            },
          ],
        });
      }
      const text =
        (typeof request.input.text === "string" && request.input.text.trim()) ||
        (typeof request.input.prompt === "string" && request.input.prompt.trim()) ||
        (typeof request.input.input === "string" && request.input.input.trim()) ||
        "";
      if (!text) {
        return success({
          valid: false,
          issues: [
            {
              code: "invalid_request",
              message: "embedding.generate requires non-empty text input",
              severity: "error",
            },
          ],
        });
      }
    }

    return super.validate({ ...request, modelId: wireModelId });
  }
}

function extractProfile(request: ProviderAdapterRequest): DesiredCapabilityProfile {
  const meta = request.metadata ?? {};
  return {
    capabilityId: request.capabilityId ? String(request.capabilityId) : undefined,
    modality: request.modality as DesiredCapabilityProfile["modality"],
    requireStreaming: request.streaming || request.features.includes("streaming"),
    requireToolCalling:
      request.features.includes("tool_calling") || Boolean(request.input.tools),
    requireVision: request.features.includes("vision") || request.modality === "image",
    requireAudio: request.features.includes("audio") || request.modality === "audio",
    requireEmbeddings:
      request.features.includes("embeddings") || request.modality === "embedding",
    requireReasoning: request.features.includes("reasoning"),
    requireStructuredOutputs: request.features.includes("structured_outputs"),
    requireJsonMode: request.features.includes("json_mode"),
    minContextWindow: typeof meta.minContextWindow === "number" ? meta.minContextWindow : undefined,
    maxCostPreference: (meta.maxCostPreference as DesiredCapabilityProfile["maxCostPreference"]) ?? "balanced",
    preferReasoning: Boolean(meta.preferReasoning),
  };
}
