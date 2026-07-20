/**
 * Provider Manifest — sole input for Universal Provider Generator.
 */

import type { AuthenticationType, ProviderCategory } from "./enums";

export interface ProviderAuthSchema {
  readonly type: AuthenticationType;
  readonly headerName?: string;
  readonly envVarHint?: string;
  readonly supportsOrganization?: boolean;
  readonly supportsProject?: boolean;
}

export interface ProviderRateLimits {
  readonly requestsPerMinute?: number;
  readonly tokensPerMinute?: number;
  readonly requestsPerDay?: number;
}

export interface ProviderFeatureFlags {
  readonly streaming: boolean;
  readonly toolCalling: boolean;
  readonly structuredOutput: boolean;
  readonly embeddings: boolean;
  readonly vision: boolean;
  readonly audio: boolean;
  readonly image: boolean;
  readonly video: boolean;
  readonly reasoning: boolean;
  readonly search?: boolean;
}

export interface ProviderCapabilityMappingEntry {
  readonly capabilityId: string;
  readonly modalities: readonly string[];
  readonly requiredFeatures: readonly (keyof ProviderFeatureFlags)[];
  readonly notes?: string;
}

export interface ProviderPricingMetadata {
  readonly currency?: string;
  readonly inputPer1k?: number;
  readonly outputPer1k?: number;
  readonly notes?: string;
}

/**
 * Complete generator input. Never includes hardcoded model name lists —
 * discovery endpoint supplies models at runtime.
 */
export interface ProviderManifestSpec {
  readonly providerId: string;
  readonly displayName: string;
  readonly category: ProviderCategory;
  readonly version: string;
  readonly authentication: ProviderAuthSchema;
  readonly discoveryEndpoint: string;
  readonly baseUrl: string;
  readonly apiSpecification?: string;
  readonly supportedModalities: readonly string[];
  readonly features: ProviderFeatureFlags;
  readonly capabilityMatrix: readonly ProviderCapabilityMappingEntry[];
  readonly regions: readonly string[];
  readonly rateLimits?: ProviderRateLimits;
  readonly pricing?: ProviderPricingMetadata;
  readonly packagePathHint?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ProviderGenerationRequest {
  readonly requestId: string;
  readonly manifest: ProviderManifestSpec;
  readonly mode?: import("./enums").GenerationMode;
  /** Relative path under providers/ if materializing — generator never writes frozen leaves. */
  readonly outputRelativePath?: string;
  readonly skipTests?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
