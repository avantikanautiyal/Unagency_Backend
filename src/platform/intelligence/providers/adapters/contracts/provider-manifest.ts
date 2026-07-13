/**
 * Provider manifest — the canonical description of a provider.
 *
 * Purpose: Single source of truth for provider metadata + models + features.
 * Responsibilities: Everything negotiation/runtime need, without hardcoding.
 * Usage: Built via ProviderManifestBuilder; owned by adapter descriptors.
 * Future Extension: Regional pricing, SLA metadata, per-region models.
 *
 * The runtime and negotiation platforms should consume manifests instead of
 * hardcoded provider metadata.
 */

import type { ProviderId } from "../../../shared/identifiers";
import type {
  ProviderAuthenticationType,
  ProviderLifecycleState,
  ProviderMaturity,
  ProviderModality,
} from "./enums";
import type { ProviderManifestVersion } from "./identifiers";
import type { ProviderModel } from "./provider-model";
import type { ProviderStreamingProfile } from "./streaming-profile";

/**
 * Coarse provider-level feature flags (per-model flags live on ProviderModel).
 */
export interface ProviderManifestFeatures {
  readonly streaming: boolean;
  readonly toolCalling: boolean;
  readonly vision: boolean;
  readonly audio: boolean;
  readonly embeddings: boolean;
  readonly reasoning: boolean;
  readonly structuredOutputs: boolean;
  readonly jsonMode: boolean;
}

export interface ProviderRateLimitMetadata {
  readonly requestsPerMinute?: number;
  readonly tokensPerMinute?: number;
  readonly requestsPerDay?: number;
  readonly concurrentRequests?: number;
}

export interface ProviderManifest {
  readonly providerId: ProviderId;
  readonly vendor: string;
  readonly displayName: string;
  readonly version: ProviderManifestVersion;
  readonly modalities: readonly ProviderModality[];
  readonly models: readonly ProviderModel[];
  /** Map of modality → default model id (e.g. { text: "gpt-x" }). */
  readonly defaultModels: Readonly<Record<string, string>>;
  /** Capability identifiers this provider can serve. */
  readonly capabilities: readonly string[];
  readonly authenticationTypes: readonly ProviderAuthenticationType[];
  readonly features: ProviderManifestFeatures;
  readonly streaming: ProviderStreamingProfile;
  readonly rateLimits: ProviderRateLimitMetadata;
  readonly supportedRegions: readonly string[];
  readonly status: ProviderLifecycleState;
  readonly maturity: ProviderMaturity;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly updatedAt: string;
}
