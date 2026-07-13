/**
 * Provider feature and model inventory contracts.
 *
 * Purpose: Normalized inventories derived from manifests.
 * Responsibilities: Feature/model views for discovery and sync.
 * Usage: Produced by discovery and synchronization engines.
 * Future Extension: Per-region model availability.
 */

import type { ProviderId } from "../../../shared/identifiers";

export interface ProviderFeatureInventory {
  readonly providerId: ProviderId;
  readonly features: readonly string[];
  readonly capabilities: readonly string[];
  readonly modalities: readonly string[];
  readonly capturedAt: string;
}

export interface ProviderModelInventory {
  readonly providerId: ProviderId;
  readonly models: readonly ProviderModelEntry[];
  readonly defaultModels: Readonly<Record<string, string>>;
  readonly capturedAt: string;
}

export interface ProviderModelEntry {
  readonly modelId: string;
  readonly displayName?: string;
  readonly modalities: readonly string[];
  readonly features: readonly string[];
  readonly contextWindow?: number;
}
