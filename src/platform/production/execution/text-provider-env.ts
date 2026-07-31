/**
 * Text provider environment configuration — credential and enable flags.
 */

import type { TextProviderConfig } from "../../intelligence/providers/compat/contracts/text-provider-config";
import { COMPAT_TEXT_PROVIDER_CONFIGS } from "../../intelligence/providers/compat/configs/text-provider-configs";
import {
  ANTHROPIC_CREDENTIAL_ENV,
  ANTHROPIC_ENABLE_ENV,
  ANTHROPIC_PROVIDER_ID,
} from "../../intelligence/providers/anthropic/constants";
import {
  GEMINI_CREDENTIAL_ENV,
  GEMINI_ENABLE_ENV,
  GEMINI_PROVIDER_ID,
} from "../../intelligence/providers/gemini/constants";
import {
  COHERE_CREDENTIAL_ENV,
  COHERE_ENABLE_ENV,
  COHERE_PROVIDER_ID,
} from "../../intelligence/providers/cohere/constants";
import { OPENAI_PROVIDER_ID } from "../../intelligence/providers/openai/constants";

export interface NativeTextProviderEnvSpec {
  readonly canonicalProviderId: string;
  readonly credentialEnvVar: string;
  readonly enableEnvVar: string;
}

export const OPENAI_TEXT_ENV: NativeTextProviderEnvSpec = {
  canonicalProviderId: "provider.openai",
  credentialEnvVar: "OPENAI_API_KEY",
  enableEnvVar: "OPENAI_ENABLED",
};

export const ANTHROPIC_TEXT_ENV: NativeTextProviderEnvSpec = {
  canonicalProviderId: ANTHROPIC_PROVIDER_ID,
  credentialEnvVar: ANTHROPIC_CREDENTIAL_ENV,
  enableEnvVar: ANTHROPIC_ENABLE_ENV,
};

export const GEMINI_TEXT_ENV: NativeTextProviderEnvSpec = {
  canonicalProviderId: GEMINI_PROVIDER_ID,
  credentialEnvVar: GEMINI_CREDENTIAL_ENV,
  enableEnvVar: GEMINI_ENABLE_ENV,
};

export const COHERE_TEXT_ENV: NativeTextProviderEnvSpec = {
  canonicalProviderId: COHERE_PROVIDER_ID,
  credentialEnvVar: COHERE_CREDENTIAL_ENV,
  enableEnvVar: COHERE_ENABLE_ENV,
};

export const ALL_TEXT_PROVIDER_ENV_SPECS: readonly (
  | NativeTextProviderEnvSpec
  | TextProviderConfig
)[] = [
  OPENAI_TEXT_ENV,
  ANTHROPIC_TEXT_ENV,
  GEMINI_TEXT_ENV,
  COHERE_TEXT_ENV,
  ...COMPAT_TEXT_PROVIDER_CONFIGS,
];

function isEnabled(env: NodeJS.ProcessEnv, enableVar: string, hasCredential: boolean): boolean {
  const flag = env[enableVar]?.trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "no") return false;
  if (flag === "true" || flag === "1" || flag === "yes") return hasCredential;
  return hasCredential;
}

export function resolveTextProviderCredential(
  env: NodeJS.ProcessEnv,
  credentialEnvVar: string
): string | undefined {
  const value = env[credentialEnvVar]?.trim();
  return value || undefined;
}

export function isTextProviderConfigured(
  env: NodeJS.ProcessEnv,
  spec: { credentialEnvVar: string; enableEnvVar: string }
): boolean {
  const credential = resolveTextProviderCredential(env, spec.credentialEnvVar);
  return isEnabled(env, spec.enableEnvVar, Boolean(credential));
}

export interface TextProviderEnvStatus {
  readonly providerId: string;
  readonly configured: boolean;
  readonly enabled: boolean;
  readonly credentialEnvVar: string;
}

export function evaluateTextProviderEnv(env: NodeJS.ProcessEnv = process.env): TextProviderEnvStatus[] {
  return ALL_TEXT_PROVIDER_ENV_SPECS.map((spec) => {
    const providerId =
      "canonicalProviderId" in spec ? spec.canonicalProviderId : spec.canonicalProviderId;
    const credentialEnvVar = spec.credentialEnvVar;
    const enableEnvVar = spec.enableEnvVar;
    const credential = resolveTextProviderCredential(env, credentialEnvVar);
    const enabled = isEnabled(env, enableEnvVar, Boolean(credential));
    return {
      providerId,
      configured: Boolean(credential),
      enabled,
      credentialEnvVar,
    };
  });
}

/** OpenAI wire id used by OpenAIDispatcher streaming checks. */
export { OPENAI_PROVIDER_ID };
