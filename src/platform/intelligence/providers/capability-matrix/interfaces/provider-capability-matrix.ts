/**
 * Provider capability matrix port.
 *
 * Purpose: Query what each provider can do.
 * Responsibilities: get/list/findByFeature/findMatching/upsert/clear.
 * Usage: Synced from ProviderDefinition on registration (optional).
 * Future Extension: Config-driven matrix files.
 */

import type { ProviderId } from "../../../shared/identifiers";
import type { Result } from "../../../shared/result";
import type {
  ProviderCapabilityProfile,
  ProviderFeatureName,
  ProviderFeatureSupport,
} from "../contracts/provider-capabilities";

export interface IProviderCapabilityMatrix {
  get(providerId: ProviderId): Result<ProviderCapabilityProfile>;
  list(): readonly ProviderCapabilityProfile[];
  findByFeature(feature: ProviderFeatureName): readonly ProviderId[];
  findMatching(required: Partial<ProviderFeatureSupport>): readonly ProviderId[];
  upsert(profile: ProviderCapabilityProfile): Result<ProviderCapabilityProfile>;
  remove(providerId: ProviderId): Result<void>;
  clear(): void;
}
