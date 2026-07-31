/**
 * Build minimal ProviderManifest for text provider leaves.
 */

import { asProviderId } from "../../shared/identifiers";
import { ProviderManifestBuilder } from "../adapters/builders/provider-manifest-builder";
import { ProviderModelBuilder } from "../adapters/builders/provider-model-builder";
import type { ProviderManifest } from "../adapters/contracts/provider-manifest";

export function buildTextProviderManifest(input: {
  readonly providerId: string;
  readonly vendor: string;
  readonly displayName: string;
  readonly version: string;
  readonly wireModels: readonly string[];
  readonly capabilities: readonly string[];
  readonly visionWireModels?: readonly string[];
  readonly imageWireModels?: readonly string[];
  readonly nowIso: string;
}): ProviderManifest {
  const models = input.wireModels.map((id, index) => {
    const hasVision = input.visionWireModels?.includes(id) ?? false;
    const hasImage = input.imageWireModels?.includes(id) ?? false;
    const hasEmbedding =
      id.includes("embed") ||
      id.includes("embedding") ||
      (input.capabilities.includes("embedding.generate") &&
        (id.includes("embed") || id.includes("embedding")));
    const isEmbeddingOnly = hasEmbedding && !hasVision && !hasImage && !id.includes("command");
    return new ProviderModelBuilder()
      .withId(id)
      .withDisplayName(id)
      .withModalities(
        hasImage
          ? ["image"]
          : isEmbeddingOnly
            ? ["embedding"]
            : hasVision
              ? ["text", "multimodal"]
              : ["text"]
      )
      .withCapability({
        streaming: !isEmbeddingOnly,
        toolCalling: !hasImage && !isEmbeddingOnly,
        vision: hasVision,
        audio: false,
        embeddings: hasEmbedding || isEmbeddingOnly,
        reasoning: input.capabilities.includes("reasoning.analyze") && !isEmbeddingOnly,
        structuredOutputs: !hasImage && !isEmbeddingOnly,
        jsonMode: !hasImage && !isEmbeddingOnly,
        contextWindow: 128_000,
        maxOutputTokens: isEmbeddingOnly ? 0 : 8192,
      })
      .asDefault(index === 0)
      .build();
  });

  return new ProviderManifestBuilder()
    .withProviderId(asProviderId(input.providerId))
    .withVendor(input.vendor)
    .withDisplayName(input.displayName)
    .withVersion(input.version)
    .withModalities(
      input.imageWireModels?.length
        ? ["text", "image", "multimodal"]
        : input.capabilities.includes("embedding.generate")
          ? ["text", "embedding", ...(input.visionWireModels?.length ? (["multimodal"] as const) : [])]
          : input.visionWireModels?.length
            ? ["text", "multimodal"]
            : ["text"]
    )
    .withModels(models)
    .withDefaultModels(input.wireModels[0] ? { text: input.wireModels[0] } : {})
    .withCapabilities([...input.capabilities])
    .withAuthenticationTypes(["api_key"])
    .withStreaming({ supported: true, chunkModes: ["delta"], heartbeat: false, endMarker: true })
    .withRateLimits({})
    .withSupportedRegions(["global"])
    .withStatus("ready")
    .withMaturity("stable")
    .withMetadata({ protocol: "text" })
    .withTimestamps(input.nowIso, input.nowIso)
    .build();
}
