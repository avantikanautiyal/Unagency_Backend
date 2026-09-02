/**
 * Adapter platform enumerations.
 *
 * Purpose: Closed unions shared across the adapter framework.
 * Responsibilities: Lifecycle, maturity, modality, canonical finish/error kinds.
 * Usage: Referenced by contracts and subsystems.
 * Future Extension: Additive values without breaking callers.
 */

export type ProviderLifecycleState =
  | "registered"
  | "initializing"
  | "ready"
  | "degraded"
  | "maintenance"
  | "disabled"
  | "retired";

export type ProviderMaturity =
  | "experimental"
  | "beta"
  | "stable"
  | "deprecated"
  | "retired";

export type ProviderModality =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "embedding"
  | "structured"
  | "multimodal";

/**
 * The specialization category an adapter base class targets.
 */
export type AdapterCategory =
  | "text"
  | "reasoning"
  | "vision"
  | "image"
  | "audio"
  | "embedding"
  | "streaming"
  | "multimodal";

export type ProviderAuthenticationType =
  | "api_key"
  | "oauth2"
  | "bearer_token"
  | "jwt"
  | "service_account"
  | "client_credentials"
  | "anonymous";

/**
 * Canonical (provider-independent) finish reason.
 */
export type CanonicalFinishReason =
  | "stop"
  | "length"
  | "content_filter"
  | "tool_call"
  | "cancelled"
  | "error"
  | "unknown";

/**
 * Canonical (provider-independent) error kind.
 */
export type CanonicalErrorKind =
  | "authentication"
  | "authorization"
  | "rate_limit"
  | "timeout"
  | "quota"
  | "content_policy"
  | "provider_internal"
  | "unavailable"
  | "unknown";

export type DiagnosticSeverity = "info" | "warning" | "error";

export type StreamEventKind = "start" | "chunk" | "heartbeat" | "end" | "error";

const LIFECYCLE_TRANSITIONS: Readonly<
  Record<ProviderLifecycleState, readonly ProviderLifecycleState[]>
> = {
  registered: ["initializing", "disabled", "retired"],
  initializing: ["ready", "degraded", "disabled", "retired"],
  ready: ["degraded", "maintenance", "disabled", "retired"],
  degraded: ["ready", "maintenance", "disabled", "retired"],
  maintenance: ["ready", "degraded", "disabled", "retired"],
  disabled: ["initializing", "retired"],
  retired: [],
};

export function canTransitionLifecycle(
  from: ProviderLifecycleState,
  to: ProviderLifecycleState
): boolean {
  if (from === to) {
    return true;
  }
  return LIFECYCLE_TRANSITIONS[from].includes(to);
}

export function isTerminalLifecycleState(
  state: ProviderLifecycleState
): boolean {
  return LIFECYCLE_TRANSITIONS[state].length === 0;
}
