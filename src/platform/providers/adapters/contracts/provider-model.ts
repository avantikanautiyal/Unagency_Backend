/**
 * Provider model contracts.
 *
 * Purpose: Immutable description of a provider's models + capabilities.
 * Responsibilities: Per-model capability flags and normalized profiles.
 * Usage: Embedded in ProviderManifest; consumed by negotiation/runtime.
 * Future Extension: Pricing tiers, per-model rate limits.
 */

import type { ProviderModality } from "./enums";

/**
 * Capability flags for a single model.
 */
export interface ProviderModelCapability {
  readonly streaming: boolean;
  readonly toolCalling: boolean;
  readonly vision: boolean;
  readonly audio: boolean;
  readonly embeddings: boolean;
  readonly reasoning: boolean;
  readonly structuredOutputs: boolean;
  readonly jsonMode: boolean;
  readonly contextWindow?: number;
  readonly maxInputTokens?: number;
  readonly maxOutputTokens?: number;
}

export interface ProviderModel {
  readonly id: string;
  readonly displayName: string;
  readonly modalities: readonly ProviderModality[];
  readonly capability: ProviderModelCapability;
  readonly isDefault: boolean;
  readonly deprecated: boolean;
  readonly aliases: readonly string[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

