/**
 * Server-side video LIVE certification profile — NOT client-controlled.
 * When VIDEO_CERTIFICATION_PROVIDER is set, only that provider is eligible
 * for Model Intelligence + Routing candidate filtering.
 */

import { asProviderId, type ProviderId } from "../../core/identifiers";
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

export function isRunwayLiveCertificationReady(env: NodeJS.ProcessEnv = process.env): boolean {
  const cert = resolveVideoCertificationProviderId(env);
  if (cert && String(cert) !== RUNWAY_VIDEO_SPEC.canonicalProviderId) {
    return false;
  }
  return isVideoProviderConfigured(env, RUNWAY_VIDEO_SPEC);
}

