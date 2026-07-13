/**
 * Provider Capability Matrix contracts.
 * Describes WHAT each provider can do — not provider registration.
 *
 * Distinct from kernel/registry ProviderDescriptor (registration presence).
 * The Execution Planner queries this matrix for selection.
 */

import type { ProviderId } from "../../shared/identifiers";

/**
 * Feature flags for a provider's supported capabilities.
 * Provider-agnostic — no vendor SDK types.
 */
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
