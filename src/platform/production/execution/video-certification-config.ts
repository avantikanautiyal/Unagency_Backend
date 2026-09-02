/**
 * Server-side video LIVE certification profile — NOT client-controlled.
 * When VIDEO_CERTIFICATION_PROVIDER is set, only that provider is eligible
 * for Model Intelligence + Routing candidate filtering.
 */

import { asProviderId, type ProviderId } from "../../core/identifiers";
import type { IProviderRuntimeRegistry } from "../../providers/runtime/registry/in-memory-provider-runtime-registry";
import { RUNWAY_VIDEO_SPEC } from "../../providers/video/configs/verified-video-provider-specs";
import { isVideoProviderConfigured } from "./video-provider-env";

export const VIDEO_CERTIFICATION_PROVIDER_ENV = "VIDEO_CERTIFICATION_PROVIDER";

export function resolveVideoCertificationProviderId(
  env: NodeJS.ProcessEnv = process.env
): ProviderId | undefined {
  const raw = env[VIDEO_CERTIFICATION_PROVIDER_ENV]?.trim();
  if (!raw) return undefined;
  return asProviderId(raw);
}

/**
 * Restrict routing/MI to certification provider when env is set.
 * Returns undefined when unset (all executable providers remain eligible).
 */
export function resolveVideoCertificationAllowedProviderIds(
  env: NodeJS.ProcessEnv,
  registry: IProviderRuntimeRegistry
): readonly ProviderId[] | undefined {
  const certId = resolveVideoCertificationProviderId(env);
  if (!certId) return undefined;

  const executable = registry.listAvailableProviderIds().filter((id) => {
    const entry = registry.resolveAvailable(id);
    return Boolean(entry?.capabilities.includes("video.generate"));
  });

  if (executable.some((id) => String(id) === String(certId))) {
    return [certId];
  }

  // Certification boot may register only the cert provider — still restrict MI/Routing.
  return [certId];
}

export function isRunwayLiveCertificationReady(env: NodeJS.ProcessEnv = process.env): boolean {
  const cert = resolveVideoCertificationProviderId(env);
  if (cert && String(cert) !== RUNWAY_VIDEO_SPEC.canonicalProviderId) {
    return false;
  }
  return isVideoProviderConfigured(env, RUNWAY_VIDEO_SPEC);
}

/**
 * Strict opt-in for M9.5G Runway LIVE smoke — never inferred from API key alone.
 */
export function isRunwayLiveSmokeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.RUN_LIVE_RUNWAY_VIDEO_SMOKE?.trim() !== "true") return false;
  if (env.ENTERPRISE_API_EXECUTION_MODE?.trim() !== "live") return false;
  if (env.ENTERPRISE_ASYNC_MEDIA_ENABLED?.trim() !== "true") return false;
  if (env.ENTERPRISE_API_DURABLE_MODE?.trim() !== "true") return false;
  return isVideoProviderConfigured(env, RUNWAY_VIDEO_SPEC);
}
