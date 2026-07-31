/**
 * Future LIVE certification activation — credential-free manifest helpers.
 * Adding env credentials later should not require source changes.
 */

import {
  ALL_VIDEO_PROVIDER_SPECS,
  VERIFIED_VIDEO_PROVIDER_SPECS,
  type VerifiedVideoProviderSpec,
} from "../../intelligence/providers/video/configs/verified-video-provider-specs";
import { isVideoProviderConfigured } from "./video-provider-env";

export interface VideoLiveSmokeGate {
  readonly providerId: string;
  readonly smokeEnvVar: string;
  readonly credentialEnvVars: readonly string[];
  readonly enableEnvVar: string;
  readonly inventoryModelId: string;
  readonly wireModelId: string;
  readonly supportsTextToVideo: boolean;
  readonly supportsImageToVideo: boolean;
  readonly safeDurationSeconds: number;
  readonly safeAspectRatio: string;
  readonly safeResolution?: string;
}

export function listVerifiedVideoLiveSmokeGates(): readonly VideoLiveSmokeGate[] {
  return VERIFIED_VIDEO_PROVIDER_SPECS.map((spec) => ({
    providerId: spec.canonicalProviderId,
    smokeEnvVar: spec.liveSmokeEnvVar,
    credentialEnvVars: spec.secretEnvVar
      ? [spec.accessKeyEnvVar ?? spec.credentialEnvVar, spec.secretEnvVar]
      : [spec.credentialEnvVar],
    enableEnvVar: spec.enableEnvVar,
    inventoryModelId: spec.inventoryModelId,
    wireModelId: spec.wireModelId,
    supportsTextToVideo: spec.supportsTextToVideo,
    supportsImageToVideo: spec.supportsImageToVideo,
    safeDurationSeconds: 5,
    safeAspectRatio: "16:9",
    safeResolution: spec.vendor === "pixverse" || spec.vendor === "minimax" ? "540p" : undefined,
  }));
}

/**
 * Strict opt-in LIVE smoke — requires smoke flag + LIVE mode + durable async + credentials.
 * Never inferred from API key alone.
 */
export function isVerifiedVideoLiveSmokeEnabled(
  spec: VerifiedVideoProviderSpec,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (!spec.vendorApiVerified) return false;
  if (env[spec.liveSmokeEnvVar]?.trim() !== "true") return false;
  if (env.ENTERPRISE_API_EXECUTION_MODE?.trim() !== "live") return false;
  if (env.ENTERPRISE_ASYNC_MEDIA_ENABLED?.trim() !== "true") return false;
  if (env.ENTERPRISE_API_DURABLE_MODE?.trim() !== "true") return false;
  return isVideoProviderConfigured(env, spec);
}

export function blockedVideoProviders(): readonly VerifiedVideoProviderSpec[] {
  return ALL_VIDEO_PROVIDER_SPECS.filter((s) => !s.vendorApiVerified);
}
