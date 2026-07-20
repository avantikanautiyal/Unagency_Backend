/**
 * Scoring, recommendations, maturity, compatibility reports.
 */

import type { CapabilityMaturity } from "./enums";

export interface CapabilityScoreBreakdown {
  readonly quality: number;
  readonly cost: number;
  readonly latency: number;
  readonly reliability: number;
  readonly coverage: number;
  readonly reusability: number;
  readonly maturity: number;
  readonly overall: number;
}

export interface CapabilityScorecard {
  readonly capabilityId: string;
  readonly scores: CapabilityScoreBreakdown;
  readonly rationale: string;
}

export interface CapabilityRecommendationEvidence {
  readonly whySelected: string;
  readonly dependencies: readonly string[];
  readonly alternatives: readonly string[];
  readonly tradeOffs: readonly string[];
  readonly historicalSuccess: string;
  readonly confidence: number;
}

export interface CapabilityRecommendation {
  readonly recommendationId: string;
  readonly capabilityId: string;
  readonly rank: number;
  readonly score: number;
  readonly evidence: CapabilityRecommendationEvidence;
}

export interface CapabilityRecommendations {
  readonly primary: readonly CapabilityRecommendation[];
  readonly alternatives: readonly CapabilityRecommendation[];
}

export interface CapabilityMaturityReport {
  readonly capabilityId: string;
  readonly maturity: CapabilityMaturity;
  readonly lifecycle: string;
  readonly version: string;
  readonly notes: string;
}

export interface CapabilityCompatibilityEntry {
  readonly capabilityId: string;
  readonly compatible: boolean;
  readonly missingDependencies: readonly string[];
  readonly unsupportedRequirements: readonly string[];
  readonly notes: string;
}

export interface CapabilityCompatibilityReport {
  readonly entries: readonly CapabilityCompatibilityEntry[];
  readonly overallCompatible: boolean;
}
