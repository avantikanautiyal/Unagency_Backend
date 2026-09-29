/**
 * Phase 11 — Provider-neutral Model Runtime contract.
 * Separates CanonicalModelRequest (semantic) from provider-native requests.
 */

import type { CanonicalModelRequest } from "../canonical-model-request";
import type { CanonicalProviderPayloadProjection } from "../canonical-model-request/map-to-provider-payload";

/** How CMR was represented for a provider transport. */
export type ModelRuntimeRepresentationStrategy =
  | "cmr_compatibility_flatten"
  | "cmr_structured_passthrough"
  | "legacy_raw_prompt";

export type ModelRuntimeCapabilityState =
  | "SUPPORTED"
  | "SUPPORTED_VIA_COMPATIBILITY"
  | "UNSUPPORTED"
  | "OMITTED_WITH_REASON"
  | "REQUIRED_BUT_UNREPRESENTABLE";

export type ModelRuntimeCapabilityNote = {
  readonly feature: string;
  readonly state: ModelRuntimeCapabilityState;
  readonly reason?: string;
};

export const MODEL_RUNTIME_SOURCE = "model_runtime" as const;

export type ModelRuntimeProjection = {
  readonly applied: true;
  readonly source: typeof MODEL_RUNTIME_SOURCE;
  readonly representationStrategy: ModelRuntimeRepresentationStrategy;
  /** Compatibility serialization of CMR — not a second semantic assembly. */
  readonly projection: CanonicalProviderPayloadProjection;
  /** Unchanged semantic CMR (identity reference). */
  readonly modelRequest: CanonicalModelRequest;
  readonly capabilities: readonly ModelRuntimeCapabilityNote[];
  readonly mappedCount: number;
  readonly omittedCount: number;
};

export type ModelRuntimePrepareInput = {
  readonly modelRequest: CanonicalModelRequest;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly executionId?: string;
  readonly correlationId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
};

export type ModelRuntimePrepareResult =
  | {
      readonly ok: true;
      readonly runtime: ModelRuntimeProjection;
      /** Prompt string for transports that require flattened text. */
      readonly prompt: string;
      readonly metadataStamps: Record<string, unknown>;
      readonly plan: import("./representation-plan").ProviderRepresentationPlan;
    }
  | {
      readonly ok: false;
      readonly code: "REQUIRED_BUT_UNREPRESENTABLE";
      readonly message: string;
      readonly plan: import("./representation-plan").ProviderRepresentationPlan;
      readonly metadataStamps: Record<string, unknown>;
    };

/** Normalized runtime-level error categories (provider details stay in diagnostics). */
export type ModelRuntimeErrorCategory =
  | "provider_unavailable"
  | "capability_unsupported"
  | "invalid_provider_request"
  | "provider_timeout"
  | "provider_rate_limit"
  | "provider_auth_config"
  | "provider_response_invalid"
  | "provider_unknown";
