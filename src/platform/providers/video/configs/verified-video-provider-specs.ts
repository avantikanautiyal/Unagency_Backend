/**
 * Verified video provider configs — LIVE only when vendorApiVerified=true.
 * Pika / Higgsfield remain inventory-backed but LIVE blocked.
 */

import type { IVendorVideoProtocol } from "../common/vendor-video-protocol";
import { RunwayVideoProtocol } from "../runway/runway-video-protocol";
import { LumaVideoProtocol } from "../luma/luma-video-protocol";
import { MinimaxVideoProtocol } from "../minimax/minimax-video-protocol";
import { PixverseVideoProtocol } from "../pixverse/pixverse-video-protocol";
import { KlingVideoProtocol } from "../kling/kling-video-protocol";
import { GoogleVeoVideoProtocol } from "../google-veo/google-veo-video-protocol";
import { SeedanceVideoProtocol } from "../seedance/seedance-video-protocol";

export interface VerifiedVideoProviderSpec {
  readonly canonicalProviderId: string;
  readonly vendor: string;
  readonly displayName: string;
  readonly baseUrl: string;
  readonly credentialEnvVar: string;
  /** Optional second credential for JWT vendors (Kling). */
  readonly secretEnvVar?: string;
  readonly accessKeyEnvVar?: string;
  readonly enableEnvVar: string;
  readonly liveSmokeEnvVar: string;
  readonly vendorApiVerified: boolean;
  readonly blockedReason?: string;
  readonly inventoryModelId: string;
  readonly wireModelId: string;
  readonly supportsTextToVideo: boolean;
  readonly supportsImageToVideo: boolean;
  readonly createProtocol: () => IVendorVideoProtocol;
}

export const RUNWAY_VIDEO_SPEC: VerifiedVideoProviderSpec = {
  canonicalProviderId: "provider.runway",
  vendor: "runway",
  displayName: "Runway",
  baseUrl: "https://api.dev.runwayml.com",
  credentialEnvVar: "RUNWAY_API_KEY",
  enableEnvVar: "RUNWAY_ENABLED",
  liveSmokeEnvVar: "RUN_LIVE_RUNWAY_VIDEO_SMOKE",
  vendorApiVerified: true,
  inventoryModelId: "runway-gen-4",
  wireModelId: "gen4.5",
  supportsTextToVideo: true,
  supportsImageToVideo: true,
  createProtocol: () => new RunwayVideoProtocol(),
};

export const LUMA_VIDEO_SPEC: VerifiedVideoProviderSpec = {
  canonicalProviderId: "provider.luma",
  vendor: "luma",
  displayName: "Luma AI",
  baseUrl: "https://agents.lumalabs.ai",
  credentialEnvVar: "LUMA_API_KEY",
  enableEnvVar: "LUMA_ENABLED",
  liveSmokeEnvVar: "RUN_LIVE_LUMA_VIDEO_SMOKE",
  vendorApiVerified: true,
  inventoryModelId: "luma-ray-2",
  wireModelId: "ray-3.2",
  supportsTextToVideo: true,
  supportsImageToVideo: true,
  createProtocol: () => new LumaVideoProtocol(),
};

export const MINIMAX_VIDEO_SPEC: VerifiedVideoProviderSpec = {
  canonicalProviderId: "provider.minimax",
  vendor: "minimax",
  displayName: "MiniMax",
  baseUrl: "https://api.minimax.io",
  credentialEnvVar: "MINIMAX_API_KEY",
  enableEnvVar: "MINIMAX_ENABLED",
  liveSmokeEnvVar: "RUN_LIVE_MINIMAX_VIDEO_SMOKE",
  vendorApiVerified: true,
  inventoryModelId: "hailuo-ai",
  wireModelId: "MiniMax-Hailuo-2.3",
  supportsTextToVideo: true,
  supportsImageToVideo: true,
  createProtocol: () => new MinimaxVideoProtocol(),
};

export const PIXVERSE_VIDEO_SPEC: VerifiedVideoProviderSpec = {
  canonicalProviderId: "provider.pixverse",
  vendor: "pixverse",
  displayName: "PixVerse",
  baseUrl: "https://app-api.pixverse.ai",
  credentialEnvVar: "PIXVERSE_API_KEY",
  enableEnvVar: "PIXVERSE_ENABLED",
  liveSmokeEnvVar: "RUN_LIVE_PIXVERSE_VIDEO_SMOKE",
  vendorApiVerified: true,
  inventoryModelId: "pixverse-v4",
  wireModelId: "v4",
  supportsTextToVideo: true,
  supportsImageToVideo: true, // upload → img_id → /video/img/generate (PixverseI2vDispatcher)
  createProtocol: () => new PixverseVideoProtocol(),
};

export const KLING_VIDEO_SPEC: VerifiedVideoProviderSpec = {
  canonicalProviderId: "provider.kling",
  vendor: "kling",
  displayName: "Kling AI",
  baseUrl: "https://api.klingai.com",
  credentialEnvVar: "KLING_API_KEY",
  enableEnvVar: "KLING_ENABLED",
  liveSmokeEnvVar: "RUN_LIVE_KLING_VIDEO_SMOKE",
  vendorApiVerified: true,
  inventoryModelId: "kling-2-1",
  wireModelId: "kling-v2-1",
  supportsTextToVideo: true,
  supportsImageToVideo: true,
  createProtocol: () => new KlingVideoProtocol(),
};

export const GOOGLE_VEO_VIDEO_SPEC: VerifiedVideoProviderSpec = {
  canonicalProviderId: "provider.google",
  vendor: "google",
  displayName: "Google Veo",
  baseUrl: "https://generativelanguage.googleapis.com",
  credentialEnvVar: "GOOGLE_API_KEY",
  enableEnvVar: "GOOGLE_ENABLED",
  liveSmokeEnvVar: "RUN_LIVE_GOOGLE_VIDEO_SMOKE",
  vendorApiVerified: true,
  inventoryModelId: "veo-3",
  wireModelId: "veo-3.1-generate-preview",
  supportsTextToVideo: true,
  supportsImageToVideo: true,
  createProtocol: () => new GoogleVeoVideoProtocol(),
};

/** Catalogue/inventory only — no verified first-party programmatic API for production leaf. */
export const PIKA_VIDEO_SPEC: VerifiedVideoProviderSpec = {
  canonicalProviderId: "provider.pika",
  vendor: "pika",
  displayName: "Pika",
  baseUrl: "https://api.pika.art",
  credentialEnvVar: "PIKA_API_KEY",
  enableEnvVar: "PIKA_ENABLED",
  liveSmokeEnvVar: "RUN_LIVE_PIKA_VIDEO_SMOKE",
  vendorApiVerified: false,
  blockedReason: "API_CONTRACT_UNVERIFIED — no first-party official public API established",
  inventoryModelId: "pika-2-2",
  wireModelId: "unverified",
  supportsTextToVideo: false,
  supportsImageToVideo: false,
  createProtocol: () => {
    throw new Error("Pika has no verified vendor protocol");
  },
};

/** Platform API exists but catalog "Higgsfield Video" wire model_id not verified on official docs. */
export const HIGGSFIELD_VIDEO_SPEC: VerifiedVideoProviderSpec = {
  canonicalProviderId: "provider.higgsfield",
  vendor: "higgsfield",
  displayName: "Higgsfield",
  baseUrl: "https://platform.higgsfield.ai",
  credentialEnvVar: "HIGGSFIELD_API_KEY",
  secretEnvVar: "HIGGSFIELD_API_KEY_SECRET",
  enableEnvVar: "HIGGSFIELD_ENABLED",
  liveSmokeEnvVar: "RUN_LIVE_HIGGSFIELD_VIDEO_SMOKE",
  vendorApiVerified: false,
  blockedReason:
    "API_CONTRACT_UNVERIFIED — platform queue API documented but video model_id for catalog label unverified",
  inventoryModelId: "higgsfield-video",
  wireModelId: "unverified",
  supportsTextToVideo: false,
  supportsImageToVideo: false,
  createProtocol: () => {
    throw new Error("Higgsfield video model wire ID unverified");
  },
};

export const HEYGEN_VIDEO_SPEC: VerifiedVideoProviderSpec = {
  canonicalProviderId: "provider.heygen",
  vendor: "heygen",
  displayName: "Heygen",
  baseUrl: "https://api.heygen.com",
  credentialEnvVar: "HEYGEN_API_KEY",
  enableEnvVar: "HEYGEN_ENABLED",
  liveSmokeEnvVar: "RUN_LIVE_HEYGEN_VIDEO_SMOKE",
  vendorApiVerified: false,
  blockedReason: "API_CONTRACT_UNVERIFIED — avatar/video wire contract not certified in-repo",
  inventoryModelId: "heygen",
  wireModelId: "unverified",
  supportsTextToVideo: false,
  supportsImageToVideo: false,
  createProtocol: () => {
    throw new Error("Heygen has no verified vendor protocol");
  },
};

export const SEEDANCE_VIDEO_SPEC: VerifiedVideoProviderSpec = {
  canonicalProviderId: "provider.seedance",
  vendor: "seedance",
  displayName: "Seedance",
  // WaveSpeed hosts Seedance 2.0; keys are wsk_live_…
  baseUrl: "https://api.wavespeed.ai",
  credentialEnvVar: "SEEDANCE_API_KEY",
  enableEnvVar: "SEEDANCE_ENABLED",
  liveSmokeEnvVar: "RUN_LIVE_SEEDANCE_VIDEO_SMOKE",
  vendorApiVerified: true,
  inventoryModelId: "seedance-2",
  wireModelId: "bytedance/seedance-2.0/text-to-video",
  supportsTextToVideo: true,
  supportsImageToVideo: true,
  createProtocol: () => new SeedanceVideoProtocol(),
};

export const WAN_VIDEO_SPEC: VerifiedVideoProviderSpec = {
  canonicalProviderId: "provider.wan",
  vendor: "wan",
  displayName: "Wan",
  baseUrl: "https://api.wan.ai",
  credentialEnvVar: "WAN_API_KEY",
  enableEnvVar: "WAN_ENABLED",
  liveSmokeEnvVar: "RUN_LIVE_WAN_VIDEO_SMOKE",
  vendorApiVerified: false,
  blockedReason: "API_CONTRACT_UNVERIFIED",
  inventoryModelId: "wan-2-5",
  wireModelId: "unverified",
  supportsTextToVideo: false,
  supportsImageToVideo: false,
  createProtocol: () => {
    throw new Error("Wan has no verified vendor protocol");
  },
};

export const ALL_VIDEO_PROVIDER_SPECS: readonly VerifiedVideoProviderSpec[] = [
  RUNWAY_VIDEO_SPEC,
  KLING_VIDEO_SPEC,
  LUMA_VIDEO_SPEC,
  PIKA_VIDEO_SPEC,
  MINIMAX_VIDEO_SPEC,
  PIXVERSE_VIDEO_SPEC,
  GOOGLE_VEO_VIDEO_SPEC,
  HIGGSFIELD_VIDEO_SPEC,
  HEYGEN_VIDEO_SPEC,
  SEEDANCE_VIDEO_SPEC,
  WAN_VIDEO_SPEC,
];

export const VERIFIED_VIDEO_PROVIDER_SPECS: readonly VerifiedVideoProviderSpec[] =
  ALL_VIDEO_PROVIDER_SPECS.filter((s) => s.vendorApiVerified);

export function videoSpecByProviderId(
  providerId: string
): VerifiedVideoProviderSpec | undefined {
  return ALL_VIDEO_PROVIDER_SPECS.find((s) => s.canonicalProviderId === providerId);
}
