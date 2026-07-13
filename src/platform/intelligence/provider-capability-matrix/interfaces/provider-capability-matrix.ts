/**
 * Provider Capability Matrix ports.
 * Stores what each provider is capable of.
 * Does NOT store providers themselves (see kernel Provider Registry).
 * Does NOT import provider SDKs or provider modules.
 */

import type { ProviderId } from "../../shared/identifiers";
import type { Result } from "../../shared/result";
import type {
  ProviderCapabilityProfile,
  ProviderFeatureName,
  ProviderFeatureSupport,
} from "../contracts/provider-capabilities";

export interface IProviderCapabilityMatrix {
  /**
   * Profile for a single provider.
   */
  get(providerId: ProviderId): Promise<Result<ProviderCapabilityProfile>>;

  /**
   * All known provider profiles.
   */
  list(): Promise<Result<readonly ProviderCapabilityProfile[]>>;

  /**
   * Providers that support a given feature flag.
   */
  findByFeature(
    feature: ProviderFeatureName
  ): Promise<Result<readonly ProviderId[]>>;

  /**
   * Providers matching a partial feature requirement set.
   */
  findMatching(
    required: Partial<ProviderFeatureSupport>
  ): Promise<Result<readonly ProviderId[]>>;
}
