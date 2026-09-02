/**
 * Derive a capability matrix profile from provider metadata.
 */

import type { ProviderDefinition } from "../metadata/provider-definition";
import type { ProviderCapabilityProfile } from "./contracts/provider-capabilities";

export function deriveCapabilityProfile(
  definition: ProviderDefinition
): ProviderCapabilityProfile {
  return {
    providerId: definition.id,
    features: {
      supportsText: definition.supportedModalities.includes("text"),
      supportsImage: definition.imageSupport,
      supportsVideo: definition.videoSupport,
      supportsEmbeddings: definition.embeddingsSupport,
      supportsModeration: definition.metadata.supportsModeration === true,
      supportsStreaming: definition.streamingSupport,
      supportsVision: definition.visionSupport,
      supportsAudio: definition.audioSupport,
      supportsFunctionCalling: definition.functionCallingSupport,
    },
    modalities: definition.supportedModalities,
    maxContextTokens:
      typeof definition.metadata.maxContextTokens === "number"
        ? definition.metadata.maxContextTokens
        : undefined,
    attributes: definition.metadata,
  };
}
