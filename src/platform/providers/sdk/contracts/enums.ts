/**
 * SDK platform enumerations.
 *
 * Purpose: Closed unions for vendors, auth, errors, streaming.
 * Responsibilities: Shared vocabulary across the SDK framework.
 * Usage: Referenced by contracts and subsystems.
 * Future Extension: Additive vendor values only.
 */

export type SdkVendor =
  | "openai"
  | "anthropic"
  | "gemini"
  | "groq"
  | "deepseek"
  | "mistral"
  | "openrouter"
  | "together"
  | "fireworks"
  | "cohere"
  | "xai";

export type SdkAuthenticationKind =
  | "api_key"
  | "bearer"
  | "oauth"
  | "service_account"
  | "token_refresh";

export type SdkHealthState =
  | "healthy"
  | "degraded"
  | "unhealthy"
  | "unconfigured"
  | "unknown";

export type SdkErrorKind =
  | "authentication"
  | "authorization"
  | "configuration"
  | "rate_limit"
  | "timeout"
  | "quota"
  | "content_policy"
  | "provider_internal"
  | "unavailable"
  | "not_implemented"
  | "unknown";

export type SdkStreamEventKind =
  | "start"
  | "chunk"
  | "partial"
  | "complete"
  | "error"
  | "heartbeat";

export type SdkRetryStrategy = "none" | "fixed" | "exponential";

export type SdkClientState =
  | "registered"
  | "authenticated"
  | "ready"
  | "degraded"
  | "shutdown";
