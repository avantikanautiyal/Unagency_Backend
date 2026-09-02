/**
 * Capability constraint contracts.
 *
 * Purpose: Describe execution limits without implementing enforcement.
 * Responsibilities: Typed constraint shapes referenced by CapabilityDefinition.
 * Usage: Attached to capabilities; enforced later by planner/policies.
 * Future Extension: Region-specific constraint packs.
 */

import type { ProviderId } from "../../core/identifiers";

export interface MaxTokensConstraint {
  readonly maxTokens: number;
}

export interface MaxDurationConstraint {
  readonly maxDurationMs: number;
}

export interface MaxCostConstraint {
  readonly maxCost: number;
  readonly currency?: string;
}

export interface AllowedProvidersConstraint {
  readonly providerIds: readonly ProviderId[];
}

export interface RequiredProviderFeaturesConstraint {
  readonly features: readonly string[];
}

export interface HumanReviewRequiredConstraint {
  readonly required: boolean;
  readonly reason?: string;
}

export interface SecurityLevelConstraint {
  readonly level: "public" | "internal" | "confidential" | "restricted" | "pii";
}

export interface RegionRestrictionsConstraint {
  readonly allowedRegions?: readonly string[];
  readonly deniedRegions?: readonly string[];
}

/**
 * Aggregate capability constraints.
 */
export interface CapabilityConstraints {
  readonly maxTokens?: MaxTokensConstraint;
  readonly maxDuration?: MaxDurationConstraint;
  readonly maxCost?: MaxCostConstraint;
  readonly allowedProviders?: AllowedProvidersConstraint;
  readonly requiredProviderFeatures?: RequiredProviderFeaturesConstraint;
  readonly humanReviewRequired?: HumanReviewRequiredConstraint;
  readonly securityLevel?: SecurityLevelConstraint;
  readonly regionRestrictions?: RegionRestrictionsConstraint;
  readonly attributes?: Readonly<Record<string, unknown>>;
}
