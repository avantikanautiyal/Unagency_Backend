/**
 * OpenAI Provider Adapter — reference adapter implementation.
 */

import { success, type Result } from "../../../shared/result";
import { asProviderId } from "../../../shared/identifiers";
import { AbstractMultimodalProviderAdapter } from "../../adapters/base/specialized-adapters";
import type { AbstractAdapterDeps } from "../../adapters/base/abstract-provider-adapter";
import type { ProviderAdapterMetadata } from "../../adapters/contracts/adapter-descriptor";
import type {
  ProviderAdapterRequest,
  ProviderWirePayload,
} from "../../adapters/contracts/adapter-io";
import type { ProviderManifest } from "../../adapters/contracts/provider-manifest";
import type { ProviderTranslationResult } from "../../adapters/contracts/results";
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
    const resolved = this.resolver.resolve(profile, inventory);

    const modelId = resolved.ok
      ? resolved.value.selectedModelId
      : request.modelId || inventory[0]?.id || "unresolved";

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
