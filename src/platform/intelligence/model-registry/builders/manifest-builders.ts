/**
 * Manifest builders from seed data.
 */

import type { ProviderId } from "../../shared/identifiers";
import {
  asCanonicalModelId,
  asModelManifestId,
  asProviderManifestId,
} from "../contracts/identifiers";
import type { ModelCapability } from "../contracts/capabilities";
import type { ModelCompatibilityProfile } from "../contracts/compatibility";
import type { CanonicalModel, ModelManifest } from "../contracts/model";
import type { CanonicalProvider, ProviderManifest } from "../contracts/provider";
import type { ModelRegion } from "../contracts/regions";
import {
  providerIdForVendor,
  type SeedModelEntry,
  type SeedProviderEntry,
} from "../discovery/inventory-seed";

function checksum(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return `chk_${Math.abs(hash).toString(16)}`;
}

export function buildCanonicalProvider(
  entry: SeedProviderEntry,
  modelIds: readonly string[]
): CanonicalProvider {
  return {
    providerId: providerIdForVendor(entry.vendor),
    vendor: entry.vendor,
    displayName: entry.displayName,
    description: entry.description,
    departments: entry.departments,
    modalities: entry.modalities,
    supportedRegions: entry.regions,
    lifecycleState: entry.lifecycleState,
    metadata: { defaultModelId: entry.defaultModelId },
  };
}

export function buildProviderManifest(
  entry: SeedProviderEntry,
  modelIds: readonly string[],
  now: string
): ProviderManifest {
  const provider = buildCanonicalProvider(entry, modelIds);
  return {
    manifestId: asProviderManifestId(`pm_${entry.vendor}`),
    provider,
    modelIds,
    defaultModelId: entry.defaultModelId,
    capabilities: entry.capabilities,
    version: "1.0.0",
    createdAt: now,
    updatedAt: now,
  };
}

export function buildCanonicalModel(
  entry: SeedModelEntry,
  providerId: ProviderId
): CanonicalModel {
  const capabilities: ModelCapability[] = entry.capabilities.map((c) => ({
    capabilityId: c,
    label: c,
    supported: true,
  }));

  const regions: ModelRegion[] = entry.regions.map((r) => ({
    regionId: r,
    label: r,
    availability: entry.availability,
  }));

  const compatibility: ModelCompatibilityProfile = {
    modalities: entry.modalities,
    inputTypes: entry.inputTypes,
    outputTypes: entry.outputTypes,
    flags: entry.flags,
    compatibleCapabilities: entry.capabilities,
  };

  return {
    modelId: asCanonicalModelId(`${entry.providerVendor}/${entry.modelId}`),
    providerId,
    displayName: entry.displayName,
    version: entry.version,
    modalities: entry.modalities,
    capabilities,
    inputTypes: entry.inputTypes,
    outputTypes: entry.outputTypes,
    flags: entry.flags,
    limits: {
      maximumContext: entry.maximumContext,
      maximumOutput: entry.maximumOutput,
    },
    pricing: {
      inputPer1kTokens: entry.inputPer1k,
      outputPer1kTokens: entry.outputPer1k,
      currency: "USD",
    },
    latencyTier: entry.latencyTier,
    qualityTier: entry.qualityTier,
    availability: entry.availability,
    regions,
    lifecycle: {
      state: entry.lifecycleState,
      effectiveFrom: "2024-01-01T00:00:00.000Z",
    },
    departments: entry.departments,
    compatibility,
    aliases: entry.aliases,
  };
}

export function buildModelManifest(
  entry: SeedModelEntry,
  providerId: ProviderId,
  now: string
): ModelManifest {
  const model = buildCanonicalModel(entry, providerId);
  const payload = JSON.stringify({ modelId: model.modelId, version: model.version });
  return {
    manifestId: asModelManifestId(`mm_${entry.providerVendor}_${entry.modelId}`),
    model,
    checksum: checksum(payload),
    createdAt: now,
    updatedAt: now,
  };
}
