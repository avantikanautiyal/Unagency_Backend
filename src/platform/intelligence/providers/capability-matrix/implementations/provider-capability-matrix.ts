/**
 * In-memory provider capability matrix.
 *
 * Purpose: Store provider feature profiles without invoking providers.
 * Responsibilities: upsert, query by feature, match requirements.
 * Usage: Updated when providers register; queried by future planner.
 * Future Extension: Persistent matrix store.
 */

import type { ProviderId } from "../../../shared/identifiers";
import { failure, success } from "../../../shared/result";
import type { Result } from "../../../shared/result";
import { ProviderNotFoundError } from "../../errors";
import type {
  ProviderCapabilityProfile,
  ProviderFeatureName,
  ProviderFeatureSupport,
} from "../contracts/provider-capabilities";
import type { IProviderCapabilityMatrix } from "../interfaces/provider-capability-matrix";

export class ProviderCapabilityMatrix implements IProviderCapabilityMatrix {
  private readonly profiles = new Map<string, ProviderCapabilityProfile>();

  get(providerId: ProviderId): Result<ProviderCapabilityProfile> {
    const profile = this.profiles.get(String(providerId));
    if (!profile) {
      return failure(
        new ProviderNotFoundError("Provider profile not found in matrix", {
          providerId,
        })
      );
    }
    return success(profile);
  }

  list(): readonly ProviderCapabilityProfile[] {
    return Array.from(this.profiles.values());
  }

  findByFeature(feature: ProviderFeatureName): readonly ProviderId[] {
    return this.list()
      .filter((profile) => profile.features[feature])
      .map((profile) => profile.providerId);
  }

  findMatching(
    required: Partial<ProviderFeatureSupport>
  ): readonly ProviderId[] {
    const entries = Object.entries(required) as Array<
      [ProviderFeatureName, boolean | undefined]
    >;

    return this.list()
      .filter((profile) =>
        entries.every(([feature, value]) => {
          if (value === undefined) return true;
          return profile.features[feature] === value;
        })
      )
      .map((profile) => profile.providerId);
  }

  upsert(
    profile: ProviderCapabilityProfile
  ): Result<ProviderCapabilityProfile> {
    this.profiles.set(String(profile.providerId), profile);
    return success(profile);
  }

  remove(providerId: ProviderId): Result<void> {
    if (!this.profiles.has(String(providerId))) {
      return failure(
        new ProviderNotFoundError("Provider profile not found in matrix", {
          providerId,
        })
      );
    }
    this.profiles.delete(String(providerId));
    return success(undefined);
  }

  clear(): void {
    this.profiles.clear();
  }
}
