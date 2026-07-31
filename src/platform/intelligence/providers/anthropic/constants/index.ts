/**
 * Anthropic provider constants.
 */

export const ANTHROPIC_PROVIDER_ID = "provider.anthropic";
export const ANTHROPIC_WIRE_PROVIDER_ID = "anthropic";
export const ANTHROPIC_ADAPTER_ID = "adapter.anthropic.text";
export const ANTHROPIC_SDK_CLIENT_ID = "sdk.anthropic.text";
export const ANTHROPIC_PROVIDER_VERSION = "1.0.0";
export const ANTHROPIC_BASE_URL = "https://api.anthropic.com";
export const ANTHROPIC_CREDENTIAL_ENV = "ANTHROPIC_API_KEY";
export const ANTHROPIC_ENABLE_ENV = "ANTHROPIC_ENABLED";
export const ANTHROPIC_VENDOR = "anthropic" as const;

export const ANTHROPIC_SEED_MODELS = [
  "claude-3-5-sonnet",
  "claude-3-opus",
  "claude-3-haiku",
] as const;

export const ANTHROPIC_VISION_MODELS = ["claude-3-5-sonnet"] as const;
