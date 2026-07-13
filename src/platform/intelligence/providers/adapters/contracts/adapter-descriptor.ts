/**
 * Adapter descriptor + metadata contracts.
 *
 * Purpose: Immutable description of a registered adapter.
 * Responsibilities: Bind adapter metadata to a manifest + lifecycle state.
 * Usage: Returned by IProviderAdapter.describe() and the registry.
 * Future Extension: Adapter capability negotiation hints.
 */

import type { ProviderId } from "../../../shared/identifiers";
import type {
  AdapterCategory,
  ProviderLifecycleState,
  ProviderModality,
} from "./enums";
import type { ProviderAdapterId } from "./identifiers";
import type { ProviderManifest } from "./provider-manifest";

export interface ProviderAdapterMetadata {
  readonly adapterId: ProviderAdapterId;
  readonly providerId: ProviderId;
  readonly vendor: string;
  readonly category: AdapterCategory;
  readonly version: string;
  readonly description?: string;
  readonly tags: readonly string[];
}

export interface ProviderAdapterDescriptor {
  readonly metadata: ProviderAdapterMetadata;
  readonly manifest: ProviderManifest;
  readonly lifecycleState: ProviderLifecycleState;
  readonly supportedModalities: readonly ProviderModality[];
  readonly supportedFeatures: readonly string[];
}
