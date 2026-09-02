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

/**
 * Canonical inventory model ids accepted by the Anthropic adapter.
 * Keep in sync with matrix-use-case-routing + inventory-seed.
 * Legacy aliases (claude-3-5-sonnet, claude-sonnet-4, …) remain accepted and
 * are remapped via ANTHROPIC_WIRE_MODEL_MAP to models the API still serves.
 */
export const ANTHROPIC_SEED_MODELS = [
  "claude-3-5-sonnet",
  "claude-sonnet-4",
  "claude-sonnet-4-5",
  "claude-sonnet-4-6",
  "claude-opus-4-1",
  "claude-opus-4-5",
  "claude-opus-4-6",
  "claude-3-opus",
  "claude-3-haiku",
  "claude-haiku-4-5",
] as const;

/**
 * Wire API model ids Anthropic accepts on /v1/messages.
 * Verified against live Anthropic API (retired dated snapshots → 404).
 */
export const ANTHROPIC_WIRE_MODEL_MAP: Readonly<Record<string, string>> = {
  "claude-3-5-sonnet": "claude-sonnet-4-5",
  "claude-sonnet-4": "claude-sonnet-4-6",
  "claude-sonnet-4-5": "claude-sonnet-4-5",
  "claude-sonnet-4-6": "claude-sonnet-4-6",
  "claude-opus-4-1": "claude-opus-4-6",
  "claude-opus-4-5": "claude-opus-4-5",
  "claude-opus-4-6": "claude-opus-4-6",
  "claude-3-opus": "claude-opus-4-5",
  "claude-3-haiku": "claude-haiku-4-5",
  "claude-haiku-4-5": "claude-haiku-4-5",
  // Retired dated ids — remap if they still appear in older plans/caches.
  "claude-3-5-sonnet-20241022": "claude-sonnet-4-5",
  "claude-sonnet-4-20250514": "claude-sonnet-4-6",
  "claude-opus-4-1-20250805": "claude-opus-4-6",
  "claude-opus-4-20250514": "claude-opus-4-5",
  "claude-3-opus-20240229": "claude-opus-4-5",
  "claude-3-haiku-20240307": "claude-haiku-4-5",
  "claude-3-5-haiku-20241022": "claude-haiku-4-5",
};

export const ANTHROPIC_VISION_MODELS = [
  "claude-3-5-sonnet",
  "claude-sonnet-4",
  "claude-sonnet-4-5",
  "claude-sonnet-4-6",
  "claude-opus-4-1",
  "claude-opus-4-5",
  "claude-opus-4-6",
] as const;
