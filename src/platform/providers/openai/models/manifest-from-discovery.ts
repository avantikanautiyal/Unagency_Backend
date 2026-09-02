/**
 * Build ProviderManifest + ProviderModel[] from discovered OpenAI inventory.
 */

import { asProviderId } from "../../../core/identifiers";
import { ProviderManifestBuilder } from "../../adapters/builders/provider-manifest-builder";
import { ProviderModelBuilder } from "../../adapters/builders/provider-model-builder";
import type { ProviderManifest } from "../../adapters/contracts/provider-manifest";
import type { ProviderModality } from "../../adapters/contracts/enums";
import type { DiscoveredOpenAIModel } from "../contracts/openai-contracts";
import { OPENAI_PROVIDER_ID, OPENAI_PROVIDER_VERSION, OPENAI_VENDOR } from "../constants";
import { defaultQuotaMetadata } from "../authentication/openai-auth";

export function buildManifestFromDiscovery(
  models: readonly DiscoveredOpenAIModel[],
  options: {
    readonly status?: "ready" | "registered" | "degraded";
    readonly maturity?: "experimental" | "beta" | "stable";
    readonly nowIso?: string;
  } = {}
): ProviderManifest {
  const now = options.nowIso ?? new Date().toISOString();
  const providerModels = models.map((m, index) => {
    const modalities = (m.modalities.length
      ? m.modalities
      : ["text"]) as ProviderModality[];
    return new ProviderModelBuilder()
      .withId(m.id)
      .withDisplayName(m.id)
      .withModalities(modalities)
      .withCapability({
        streaming: m.capability.streaming,
        toolCalling: m.capability.toolCalling,
        vision: m.capability.vision,
        audio: m.capability.audio,
        embeddings: m.capability.embeddings,
        reasoning: m.capability.reasoning,
        structuredOutputs: m.capability.structuredOutputs,
        jsonMode: m.capability.jsonMode,
        contextWindow: m.capability.contextWindow,
        maxOutputTokens: m.capability.maxOutputTokens,
      })
      .asDefault(index === 0)
      .deprecated(m.lifecycle === "deprecated" || m.lifecycle === "legacy")
      .withMetadata({
        ownedBy: m.ownedBy,
        lifecycle: m.lifecycle,
        releaseDate: m.releaseDate,
        pricing: m.pricing,
      })
      .build();
  });

  const defaultText =
    models.find((m) => m.capability.toolCalling && !m.capability.embeddings)?.id ??
    models[0]?.id;

  const quota = defaultQuotaMetadata();

  return new ProviderManifestBuilder()
    .withProviderId(asProviderId(OPENAI_PROVIDER_ID))
    .withVendor(OPENAI_VENDOR)
    .withDisplayName("OpenAI")
    .withVersion(OPENAI_PROVIDER_VERSION)
    .withModalities(["text", "image", "audio", "embedding", "multimodal"])
    .withModels(providerModels)
    .withDefaultModels(defaultText ? { text: defaultText } : {})
    .withCapabilities(["text.generate", "text.embed", "image.generate", "audio.transcribe"])
    .withAuthenticationTypes(["api_key"])
    .withStreaming({
      supported: models.some((m) => m.capability.streaming),
      chunkModes: ["delta"],
      heartbeat: true,
      endMarker: true,
    })
    .withRateLimits({
      requestsPerMinute: quota.requestsPerMinute,
      tokensPerMinute: quota.tokensPerMinute,
      requestsPerDay: quota.requestsPerDay,
    })
    .withSupportedRegions(["us-east-1", "global"])
    .withStatus(options.status ?? "registered")
    .withMaturity(options.maturity ?? "experimental")
    .withTimestamps(now, now)
    .build();
}
