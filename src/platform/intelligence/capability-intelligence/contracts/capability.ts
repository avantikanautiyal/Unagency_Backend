/**
 * Canonical capability model — what the platform thinks in, not providers.
 */

import type {
  CapabilityCategory,
  CapabilityDepartment,
  CapabilityLifecycleState,
  CapabilityMaturity,
  ComplexityTier,
  CostTier,
  LatencyTier,
} from "./enums";

export interface CapabilityIOSpec {
  readonly name: string;
  readonly description?: string;
  readonly contentTypes: readonly string[];
  readonly required: boolean;
}

export interface CapabilityQualityExpectations {
  readonly minQuality: number;
  readonly minReliability: number;
  readonly requireHumanReview: boolean;
}

export interface CapabilityDefinitionRecord {
  readonly capabilityId: string;
  readonly name: string;
  readonly category: CapabilityCategory;
  readonly department: CapabilityDepartment;
  readonly description: string;
  readonly industryTags: readonly string[];
  readonly inputs: readonly CapabilityIOSpec[];
  readonly outputs: readonly CapabilityIOSpec[];
  readonly dependencies: readonly string[];
  readonly requiredArtifacts: readonly string[];
  /** Advisory — interchangeable implementations, not requests. */
  readonly supportedProviders: readonly string[];
  readonly supportedModels: readonly string[];
  readonly requiredEvaluators: readonly string[];
  readonly requiredGovernance: readonly string[];
  readonly requiredKnowledge: readonly string[];
  readonly requiredContext: readonly string[];
  readonly requiredExperience: readonly string[];
  readonly qualityExpectations: CapabilityQualityExpectations;
  readonly costTier: CostTier;
  readonly latencyTier: LatencyTier;
  readonly complexity: ComplexityTier;
  readonly version: string;
  readonly lifecycle: CapabilityLifecycleState;
  readonly maturity: CapabilityMaturity;
  readonly keywords: readonly string[];
}

export interface CapabilityEvolutionMetrics {
  readonly capabilityId: string;
  readonly version: string;
  readonly usageCount: number;
  readonly successRate: number;
  readonly failureRate: number;
  readonly averageQuality: number;
  readonly averageLatencyMs: number;
  readonly experienceContribution: number;
  readonly lastUsedAt?: string;
}
