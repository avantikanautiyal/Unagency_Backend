/**
 * Image provider environment — LIVE only for verified adapters + credentials.
 */

import {
  ALL_IMAGE_PROVIDER_SPECS,
  type VerifiedImageProviderSpec,
} from "../../intelligence/providers/image/configs/verified-image-provider-specs";
import { isProviderEnableFlagOn } from "./provider-enable-flag";

export function resolveImageApiKey(
  env: NodeJS.ProcessEnv,
  credentialEnvVar: string
): string | undefined {
  const primary = env[credentialEnvVar]?.trim() || undefined;
  if (primary) return primary;
  // Google Imagen shares Gemini / Google API keys.
  if (credentialEnvVar === "GEMINI_API_KEY") {
    return env.GOOGLE_API_KEY?.trim() || undefined;
  }
  return undefined;
}

export function isImageProviderConfigured(
  env: NodeJS.ProcessEnv,
  spec: VerifiedImageProviderSpec
): boolean {
  const credential = resolveImageApiKey(env, spec.credentialEnvVar);
  return isProviderEnableFlagOn(env, spec.enableEnvVar, Boolean(credential));
}

export function isImageProviderExecutable(
  env: NodeJS.ProcessEnv,
  spec: VerifiedImageProviderSpec
): boolean {
  if (!spec.vendorApiVerified) return false;
  return isImageProviderConfigured(env, spec);
}

export interface ImageProviderEnvStatus {
  readonly providerId: string;
  readonly displayName: string;
  readonly verified: boolean;
  readonly configured: boolean;
  readonly enabled: boolean;
  readonly executable: boolean;
  readonly credentialEnvVar: string;
  readonly enableEnvVar: string;
  readonly blockedReason?: string;
}

export function evaluateImageProviderEnv(
  env: NodeJS.ProcessEnv = process.env
): ImageProviderEnvStatus[] {
  return ALL_IMAGE_PROVIDER_SPECS.map((spec) => {
    const configured = Boolean(resolveImageApiKey(env, spec.credentialEnvVar));
    const enabled = isProviderEnableFlagOn(env, spec.enableEnvVar, configured);
    const verified = spec.vendorApiVerified;
    return {
      providerId: spec.canonicalProviderId,
      displayName: spec.displayName,
      verified,
      configured,
      enabled,
      executable: verified && enabled && configured,
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
