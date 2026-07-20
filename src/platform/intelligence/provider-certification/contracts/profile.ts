/**
 * Provider compatibility and quality profiles.
 */

import type { ProviderManifest } from "../../providers/adapters/contracts/provider-manifest";

export interface ProviderCompatibilityProfile {
  readonly profileId: string;
  readonly providerId: string;
  readonly vendor: string;
  readonly compatible: boolean;
  readonly supportedModalities: readonly string[];
  readonly supportedFeatures: readonly string[];
  readonly supportedRegions: readonly string[];
  readonly authenticationTypes: readonly string[];
  readonly manifestVersion: string;
}

export interface ProviderQualityReport {
  readonly reportId: string;
  readonly providerId: string;
  readonly benchmarkCompatibility: readonly {
    readonly scenarioId: string;
    readonly compatible: boolean;
    readonly reason?: string;
  }[];
  readonly qualityScore: number;
  readonly notes: readonly string[];
}

export function deriveCompatibilityProfile(
  manifest: ProviderManifest
): ProviderCompatibilityProfile {
  return Object.freeze({
    profileId: `profile_${manifest.providerId}`,
    providerId: String(manifest.providerId),
    vendor: manifest.vendor,
    compatible: manifest.status === "ready" || manifest.status === "registered",
    supportedModalities: [...manifest.modalities],
    supportedFeatures: Object.entries(manifest.features)
      .filter(([, v]) => v)
      .map(([k]) => k),
    supportedRegions: [...manifest.supportedRegions],
    authenticationTypes: [...manifest.authenticationTypes],
    manifestVersion: manifest.version.raw,
  });
}
