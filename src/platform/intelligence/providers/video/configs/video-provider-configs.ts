/**
 * Video provider configs — sourced from provider-catalog-seed.ts metadata.
 * vendorApiVerified=false until vendor submit/poll wire contracts are verified in-repo.
 */

import { getCatalogEntry } from "../../../provider-catalog/catalog/provider-catalog-seed";
import { slugCatalogModelLabel } from "../catalog/catalog-model-slug";
import {
  UNAGENCY_ASYNC_VIDEO_CONTRACT_V1,
  type UnagencyAsyncVideoContract,
} from "../contracts/unagency-async-video-contract";
import type { VideoProviderConfig, VideoWireModelMapping } from "../contracts/video-provider-config";

function videoDeptModels(
  catalogProviderId: string,
  modelLabel: string,
  displayName?: string
): VideoWireModelMapping {
  const slug = slugCatalogModelLabel(modelLabel);
  return {
    inventoryModelId: slug,
    wireModelId: slug,
    displayName: displayName ?? modelLabel,
    supportsTextToVideo: true,
    supportsImageToVideo: true,
  };
}

function fromCatalog(
  catalogProviderId: string,
  modelLabels: readonly { label: string; displayName?: string }[],
  overrides: Partial<Pick<VideoProviderConfig, "supportsCancellation" | "vendorApiVerified">> = {}
): VideoProviderConfig {
  const entry = getCatalogEntry(catalogProviderId);
  if (!entry) {
    throw new Error(`Missing catalog entry for ${catalogProviderId}`);
  }
  const envPrefix = catalogProviderId.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  return {
    canonicalProviderId: `provider.${catalogProviderId}`,
    vendor: catalogProviderId,
    catalogProviderId,
    displayName: entry.displayName,
    baseUrl: entry.baseUrl,
    credentialEnvVar: entry.envVarHint,
    enableEnvVar: `${envPrefix}_ENABLED`,
    contractVerifiedEnvVar: `${envPrefix}_VIDEO_CONTRACT_VERIFIED`,
    liveSmokeEnvVar: `RUN_LIVE_${envPrefix}_VIDEO_SMOKE`,
    wireModels: modelLabels.map((m) => videoDeptModels(catalogProviderId, m.label, m.displayName)),
    supportsCancellation: overrides.supportsCancellation ?? false,
    contract: UNAGENCY_ASYNC_VIDEO_CONTRACT_V1,
    vendorApiVerified: overrides.vendorApiVerified ?? false,
  };
}

export const RUNWAY_VIDEO_CONFIG: VideoProviderConfig = fromCatalog("runway", [
  { label: "Runway Gen-4" },
]);

export const KLING_VIDEO_CONFIG: VideoProviderConfig = fromCatalog("kling", [
  { label: "Kling 2.1" },
]);

export const LUMA_VIDEO_CONFIG: VideoProviderConfig = fromCatalog("luma", [
  { label: "Luma Ray 2" },
]);

export const PIKA_VIDEO_CONFIG: VideoProviderConfig = fromCatalog("pika", [
  { label: "Pika 2.2" },
]);

export const MINIMAX_VIDEO_CONFIG: VideoProviderConfig = fromCatalog("minimax", [
  { label: "Hailuo AI" },
]);

export const PIXVERSE_VIDEO_CONFIG: VideoProviderConfig = fromCatalog("pixverse", [
  { label: "PixVerse V4" },
]);

export const GOOGLE_VEO_VIDEO_CONFIG: VideoProviderConfig = fromCatalog("google", [
  { label: "Veo 3", displayName: "Google Veo 3" },
]);

export const HIGGSFIELD_VIDEO_CONFIG: VideoProviderConfig = fromCatalog("higgsfield", [
  { label: "Higgsfield Video" },
]);

export const ALL_VIDEO_PROVIDER_CONFIGS: readonly VideoProviderConfig[] = [
  RUNWAY_VIDEO_CONFIG,
  KLING_VIDEO_CONFIG,
  LUMA_VIDEO_CONFIG,
  PIKA_VIDEO_CONFIG,
  MINIMAX_VIDEO_CONFIG,
  PIXVERSE_VIDEO_CONFIG,
  GOOGLE_VEO_VIDEO_CONFIG,
  HIGGSFIELD_VIDEO_CONFIG,
];

export function videoConfigByProviderId(providerId: string): VideoProviderConfig | undefined {
  return ALL_VIDEO_PROVIDER_CONFIGS.find((c) => c.canonicalProviderId === providerId);
}

export function unagencyVideoContract(): UnagencyAsyncVideoContract {
  return UNAGENCY_ASYNC_VIDEO_CONTRACT_V1;
}
