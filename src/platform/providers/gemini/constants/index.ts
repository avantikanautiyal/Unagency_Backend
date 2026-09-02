/**
 * Gemini provider constants — canonical id is provider.gemini (not google).
 */

export const GEMINI_PROVIDER_ID = "provider.gemini";
export const GEMINI_WIRE_PROVIDER_ID = "gemini";
export const GEMINI_ADAPTER_ID = "adapter.gemini.text";
export const GEMINI_SDK_CLIENT_ID = "sdk.gemini.text";
export const GEMINI_PROVIDER_VERSION = "1.0.0";
export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
export const GEMINI_CREDENTIAL_ENV = "GEMINI_API_KEY";
export const GEMINI_ENABLE_ENV = "GEMINI_ENABLED";
export const GEMINI_VENDOR = "gemini" as const;

export const GEMINI_SEED_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
  "gemini-pro-latest",
  "gemini-3.1-pro-preview",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash-001",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
] as const;

export const GEMINI_VISION_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-flash-latest",
  "gemini-pro-latest",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash-001",
  "gemini-2.0-flash",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
] as const;
