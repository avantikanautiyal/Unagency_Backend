/**
 * Manifest projection.
 *
 * Purpose: Derive normalized profiles from a manifest so negotiation/runtime
 *   can consume manifests instead of hardcoded provider metadata.
 * Responsibilities: compatibility profile, per-model profile, default model.
 * Usage: Called by consumers that hold a ProviderManifest.
 * Future Extension: Region-scoped projections.
 */

import type { ProviderCompatibilityProfile } from "../contracts/streaming-profile";
import type { ProviderManifest } from "../contracts/provider-manifest";
import type { ProviderModelProfile } from "../contracts/provider-model";
import { capabilityFeatures } from "../capabilities/feature-catalog";
import { defaultModel, findModel } from "../models/model-helpers";

/**
 * Derive a compact compatibility profile from a manifest.
 */
export function deriveCompatibilityProfile(
  manifest: ProviderManifest
): ProviderCompatibilityProfile {
  const features = new Set<string>();
  let maxContext: number | undefined;

  for (const model of manifest.models) {
    for (const feature of capabilityFeatures(model.capability)) {
      features.add(feature);
    }
    if (model.capability.contextWindow !== undefined) {
      maxContext = Math.max(maxContext ?? 0, model.capability.contextWindow);
    }
  }

  const fallback = defaultModel(manifest);

  return {
    providerId: manifest.providerId,
    modalities: manifest.modalities,
    features: [...features],
    models: manifest.models.map((m) => m.id),
    defaultModelId: fallback?.id,
    streaming: manifest.streaming.supported,
    maxContextTokens: maxContext,
  };
}

/**
 * Derive a normalized profile for a single model.
 */
export function deriveModelProfile(
  manifest: ProviderManifest,
  modelId: string
): ProviderModelProfile | undefined {
  const model = findModel(manifest, modelId);
  if (!model) {
    return undefined;
  }
  return {
    providerId: manifest.providerId,
    modelId: model.id,
    modalities: model.modalities,
    capability: model.capability,
    streaming: manifest.streaming,
    supportedFeatures: capabilityFeatures(model.capability),
  };
}

/**
 * Resolve the default model id for a modality (falls back to manifest default).
 */
export function resolveDefaultModelId(
  manifest: ProviderManifest,
  modality?: string
): string | undefined {
  if (modality && manifest.defaultModels[modality]) {
    return manifest.defaultModels[modality];
  }
  return defaultModel(manifest)?.id;
}
