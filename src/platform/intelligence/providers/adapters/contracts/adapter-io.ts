/**
 * Canonical adapter request/response contracts.
 *
 * Purpose: Provider-independent request/response the framework operates on.
 * Responsibilities: Carry canonical input/output; NEVER a vendor object.
 * Usage: RequestTranslator produces the request; adapters normalize responses.
 * Future Extension: Tool-call payloads, multimodal parts.
 *
 * A ProviderWirePayload is an opaque, provider-shaped map. It is the ONLY place
 * provider-shaped data lives, and it is a plain record — never a vendor SDK type.
 */

import type { CapabilityId, ProviderId } from "../../../shared/identifiers";
import type {
  CanonicalFinishReason,
  ProviderModality,
} from "./enums";
import type { ProviderDiagnostic } from "./diagnostics";
import type { ProviderAdapterId } from "./identifiers";

/**
 * Opaque provider-shaped payload. Produced by translateRequest and consumed by
 * normalizeResponse. The platform performs NO networking on it.
 */
export type ProviderWirePayload = Readonly<Record<string, unknown>>;

/**
 * Canonical request handed to an adapter (provider-independent).
 */
export interface ProviderAdapterRequest {
  readonly requestId: string;
  readonly providerId: ProviderId;
  readonly adapterId: ProviderAdapterId;
  readonly modelId: string;
  readonly capabilityId?: CapabilityId;
  readonly modality: ProviderModality;
  /** Canonical input (e.g. normalized messages / prompt / media refs). */
  readonly input: Readonly<Record<string, unknown>>;
  /** Canonical parameters (temperature, maxTokens, topP, ...). */
  readonly parameters: Readonly<Record<string, unknown>>;
  /** Negotiated features (streaming, tools, vision, ...). */
  readonly features: readonly string[];
  readonly streaming: boolean;
  readonly timeoutMs: number;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface ProviderTokenUsage {
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly totalTokens?: number;
  readonly reasoningTokens?: number;
}

export interface ProviderSafetyMarker {
  readonly category: string;
  readonly flagged: boolean;
  readonly score?: number;
  readonly action?: string;
}

export interface ProviderStreamingMetadata {
  readonly chunkCount: number;
  readonly firstChunkAtMs?: number;
  readonly completed: boolean;
  readonly heartbeats: number;
}

/**
 * Canonical, normalized adapter response (provider-independent).
 */
export interface ProviderAdapterResponse {
  readonly requestId: string;
  readonly providerId: ProviderId;
  readonly adapterId: ProviderAdapterId;
  readonly modelId: string;
  /** Canonical output (e.g. normalized message content / embeddings). */
  readonly output: Readonly<Record<string, unknown>>;
  readonly finishReason: CanonicalFinishReason;
  readonly usage?: ProviderTokenUsage;
  readonly latencyMs?: number;
  readonly warnings: readonly ProviderDiagnostic[];
  readonly safety: readonly ProviderSafetyMarker[];
  readonly reasoning?: Readonly<Record<string, unknown>>;
  readonly streamed: boolean;
  readonly streaming?: ProviderStreamingMetadata;
  readonly createdAt: string;
}
