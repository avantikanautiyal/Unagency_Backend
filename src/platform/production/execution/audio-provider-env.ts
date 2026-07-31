/**
 * Audio provider environment — LIVE only for verified adapters + credentials.
 */

import {
  ALL_AUDIO_PROVIDER_SPECS,
  type VerifiedAudioProviderSpec,
} from "../../intelligence/providers/audio/configs/verified-audio-provider-specs";

function isEnabled(env: NodeJS.ProcessEnv, enableVar: string, hasCredential: boolean): boolean {
  const flag = env[enableVar]?.trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "no") return false;
  if (flag === "true" || flag === "1" || flag === "yes") return hasCredential;
  return hasCredential;
}

export function resolveAudioApiKey(
  env: NodeJS.ProcessEnv,
  credentialEnvVar: string
): string | undefined {
  return env[credentialEnvVar]?.trim() || undefined;
}

export function isAudioProviderConfigured(
  env: NodeJS.ProcessEnv,
  spec: VerifiedAudioProviderSpec
): boolean {
  const credential = resolveAudioApiKey(env, spec.credentialEnvVar);
  return isEnabled(env, spec.enableEnvVar, Boolean(credential));
}

export function isAudioProviderExecutable(
  env: NodeJS.ProcessEnv,
  spec: VerifiedAudioProviderSpec
): boolean {
  if (!spec.vendorApiVerified) return false;
  return isAudioProviderConfigured(env, spec);
}

export interface AudioProviderEnvStatus {
  readonly providerId: string;
  readonly displayName: string;
  readonly inventoryBacked: boolean;
  readonly verified: boolean;
  readonly configured: boolean;
  readonly enabled: boolean;
  readonly executable: boolean;
  readonly credentialEnvVar: string;
  readonly enableEnvVar: string;
  readonly blockedReason?: string;
  readonly supportsTts: boolean;
  readonly supportsStt: boolean;
}

export function evaluateAudioProviderEnv(
  env: NodeJS.ProcessEnv = process.env
): AudioProviderEnvStatus[] {
  return ALL_AUDIO_PROVIDER_SPECS.map((spec) => {
    const configured = Boolean(resolveAudioApiKey(env, spec.credentialEnvVar));
    const enabled = isEnabled(env, spec.enableEnvVar, configured);
    const verified = spec.vendorApiVerified;
    const executable = verified && enabled && configured;
    return {
      providerId: spec.canonicalProviderId,
      displayName: spec.displayName,
      inventoryBacked: spec.vendorApiVerified || Boolean(spec.blockedReason),
      verified,
      configured,
      enabled,
      executable,
      credentialEnvVar: spec.credentialEnvVar,
      enableEnvVar: spec.enableEnvVar,
      blockedReason: spec.blockedReason,
      supportsTts: spec.supportsTts,
      supportsStt: spec.supportsStt,
    };
  });
}
