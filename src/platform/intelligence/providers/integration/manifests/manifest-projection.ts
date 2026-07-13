/**
 * Manifest projection helpers.
 *
 * Purpose: Derive inventories and discovery fields from ProviderManifest.
 * Responsibilities: Pure projection; no vendor logic.
 * Usage: Discovery, sync, diagnostics.
 * Future Extension: Negotiation profile projection.
 */

import type { ProviderManifest } from "../../adapters/contracts/provider-manifest";
import type {
  ProviderFeatureInventory,
  ProviderModelEntry,
  ProviderModelInventory,
} from "../contracts/inventory";
import type { ProviderDiscoveryResult } from "../contracts/reports";
import type { IntegrationLifecycleState } from "../contracts/enums";

function modelFeatures(model: ProviderManifest["models"][number]): string[] {
  const cap = model.capability;
  const features: string[] = [];
  if (cap.streaming) features.push("streaming");
  if (cap.toolCalling) features.push("toolCalling");
  if (cap.vision) features.push("vision");
  if (cap.audio) features.push("audio");
  if (cap.embeddings) features.push("embeddings");
  if (cap.reasoning) features.push("reasoning");
  if (cap.structuredOutputs) features.push("structuredOutputs");
  if (cap.jsonMode) features.push("jsonMode");
  return features;
}

export function projectFeatureInventory(
  manifest: ProviderManifest,
  capturedAt: string
): ProviderFeatureInventory {
  const manifestFeatures = Object.entries(manifest.features)
    .filter(([, v]) => v)
    .map(([k]) => k);
  return {
    providerId: manifest.providerId,
    features: manifestFeatures,
    capabilities: [...manifest.capabilities],
    modalities: [...manifest.modalities],
    capturedAt,
  };
}

export function projectModelInventory(
  manifest: ProviderManifest,
  capturedAt: string
): ProviderModelInventory {
  const models: ProviderModelEntry[] = manifest.models.map((m) => ({
    modelId: m.id,
    displayName: m.displayName,
    modalities: [...m.modalities],
    features: modelFeatures(m),
    contextWindow: m.capability.contextWindow,
  }));
  return {
    providerId: manifest.providerId,
    models,
    defaultModels: { ...manifest.defaultModels },
    capturedAt,
  };
}

export function projectDiscoveryResult(
  manifest: ProviderManifest,
  lifecycleState: IntegrationLifecycleState,
  discoveredAt: string
): ProviderDiscoveryResult {
  const featureInventory = projectFeatureInventory(manifest, discoveredAt);
  const modelInventory = projectModelInventory(manifest, discoveredAt);
  return {
    providerId: manifest.providerId,
    vendor: manifest.vendor,
    displayName: manifest.displayName,
    lifecycleState,
    models: modelInventory.models.map((m) => m.modelId),
    capabilities: featureInventory.capabilities,
    modalities: featureInventory.modalities,
    features: featureInventory.features,
    versions: [manifest.version.raw],
    regions: [...manifest.supportedRegions],
    limits: {
      requestsPerMinute: manifest.rateLimits.requestsPerMinute,
      tokensPerMinute: manifest.rateLimits.tokensPerMinute,
      requestsPerDay: manifest.rateLimits.requestsPerDay,
      concurrentRequests: manifest.rateLimits.concurrentRequests,
    },
    discoveredAt,
  };
}
