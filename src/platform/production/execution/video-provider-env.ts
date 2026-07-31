/**
 * Video provider environment — LIVE only for verified adapters + credentials.
 * Manual *_VIDEO_CONTRACT_VERIFIED cannot enable unverified/fake adapters.
 */

import {
  ALL_VIDEO_PROVIDER_SPECS,
  type VerifiedVideoProviderSpec,
} from "../../intelligence/providers/video/configs/verified-video-provider-specs";

function isEnabled(env: NodeJS.ProcessEnv, enableVar: string, hasCredential: boolean): boolean {
  const flag = env[enableVar]?.trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "no") return false;
  if (flag === "true" || flag === "1" || flag === "yes") return hasCredential;
  return hasCredential;
}

export function resolveVideoApiKey(
  env: NodeJS.ProcessEnv,
  credentialEnvVar: string
): string | undefined {
  // Google Veo may use GOOGLE_API_KEY or GEMINI_API_KEY
  const primary = env[credentialEnvVar]?.trim();
  if (primary) return primary;
  if (credentialEnvVar === "GOOGLE_API_KEY") {
    return env.GEMINI_API_KEY?.trim() || undefined;
  }
  return undefined;
}

export function isVideoProviderConfigured(
  env: NodeJS.ProcessEnv,
  spec: VerifiedVideoProviderSpec
): boolean {
  if (spec.secretEnvVar) {
    const ak = env[spec.accessKeyEnvVar ?? spec.credentialEnvVar]?.trim();
    const sk = env[spec.secretEnvVar]?.trim();
    return Boolean(ak && sk) && isEnabled(env, spec.enableEnvVar, true);
  }
  const credential = resolveVideoApiKey(env, spec.credentialEnvVar);
  return isEnabled(env, spec.enableEnvVar, Boolean(credential));
}

/** LIVE executable — requires verified adapter code + credentials + enable. */
export function isVideoProviderExecutable(
  env: NodeJS.ProcessEnv,
  spec: VerifiedVideoProviderSpec
): boolean {
  if (!spec.vendorApiVerified) return false;
  return isVideoProviderConfigured(env, spec);
}

export interface VideoProviderEnvStatus {
  readonly providerId: string;
  readonly displayName: string;
  readonly inventoryBacked: true;
  readonly verified: boolean;
  readonly configured: boolean;
  readonly enabled: boolean;
  readonly executable: boolean;
  readonly credentialEnvVar: string;
  readonly enableEnvVar: string;
  readonly blockedReason?: string;
}

export function evaluateVideoProviderEnv(
  env: NodeJS.ProcessEnv = process.env
): VideoProviderEnvStatus[] {
  return ALL_VIDEO_PROVIDER_SPECS.map((spec) => {
    const configured = (() => {
      if (spec.secretEnvVar) {
        return Boolean(
          env[spec.accessKeyEnvVar ?? spec.credentialEnvVar]?.trim() &&
            env[spec.secretEnvVar]?.trim()
        );
      }
      return Boolean(resolveVideoApiKey(env, spec.credentialEnvVar));
    })();
    const enabled = isEnabled(env, spec.enableEnvVar, configured);
    const verified = spec.vendorApiVerified;
    const executable = verified && enabled && configured;
    return {
      providerId: spec.canonicalProviderId,
      displayName: spec.displayName,
      inventoryBacked: true as const,
      verified,
      configured,
      enabled,
      executable,
      credentialEnvVar: spec.credentialEnvVar,
      enableEnvVar: spec.enableEnvVar,
      blockedReason: !verified
        ? spec.blockedReason ?? "API_CONTRACT_UNVERIFIED"
        : !configured
          ? "missing_credentials"
          : !enabled
            ? "disabled"
            : undefined,
    };
  });
}

export { ALL_VIDEO_PROVIDER_SPECS };
