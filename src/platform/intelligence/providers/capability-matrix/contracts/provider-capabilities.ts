/**
 * Provider capability matrix contracts.
 *
 * Purpose: Describe provider features without calling providers.
 * Responsibilities: Feature flags and capability profiles.
 * Usage: Queried by future Execution Planner.
 * Future Extension: Cost/latency hints per feature.
 */

import type { ProviderId } from "../../../shared/identifiers";

export interface ProviderFeatureSupport {
  readonly supportsText: boolean;
  readonly supportsImage: boolean;
  readonly supportsVideo: boolean;
  readonly supportsEmbeddings: boolean;
  readonly supportsModeration: boolean;
  readonly supportsStreaming: boolean;
  readonly supportsVision: boolean;
  readonly supportsAudio: boolean;
  readonly supportsFunctionCalling: boolean;
}

export interface ProviderCapabilityProfile {
  readonly providerId: ProviderId;
  readonly features: ProviderFeatureSupport;
  readonly modalities: readonly string[];
  readonly maxContextTokens?: number;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export type ProviderFeatureName = keyof ProviderFeatureSupport;
