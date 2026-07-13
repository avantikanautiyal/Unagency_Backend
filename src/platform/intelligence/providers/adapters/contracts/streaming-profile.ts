/**
 * Streaming + compatibility profile contracts.
 *
 * Purpose: Describe how a provider streams and what it is compatible with.
 * Responsibilities: Provider-independent streaming/compat descriptors.
 * Usage: Embedded in manifests; consumed by negotiation/runtime.
 * Future Extension: Backpressure and partial-frame descriptors.
 */

import type { ProviderId } from "../../../shared/identifiers";
import type { ProviderModality } from "./enums";

export type StreamingChunkMode = "delta" | "full";

export interface ProviderStreamingProfile {
  readonly supported: boolean;
  readonly chunkModes: readonly StreamingChunkMode[];
  readonly heartbeat: boolean;
  readonly endMarker: boolean;
}

export const NO_STREAMING_PROFILE: ProviderStreamingProfile = {
  supported: false,
  chunkModes: [],
  heartbeat: false,
  endMarker: false,
};

/**
 * A compact, normalized compatibility surface derived from a manifest so the
 * negotiation and runtime platforms can consume manifests instead of hardcoded
 * provider metadata.
 */
export interface ProviderCompatibilityProfile {
  readonly providerId: ProviderId;
  readonly modalities: readonly ProviderModality[];
  readonly features: readonly string[];
  readonly models: readonly string[];
  readonly defaultModelId?: string;
  readonly streaming: boolean;
  readonly maxContextTokens?: number;
}
