/**
 * Ranking and recommendation contracts.
 */

import type { ConfidenceLevel, DepartmentKind } from "./enums";
import type { CanonicalModelId } from "../../model-registry/contracts/identifiers";
import type { CapabilityId } from "../../shared/identifiers";

export interface RankingExplanation {
  readonly summary: string;
  readonly strengths: readonly string[];
  readonly weaknesses: readonly string[];
  readonly tradeoffs: readonly string[];
  readonly whyRanked: string;
  readonly whyAlternativesLower?: string;
}

export interface RankedModelCandidate {
  readonly rank: number;
  readonly modelId: CanonicalModelId;
  readonly displayName: string;
  readonly providerId: string;
  readonly overallScore: number;
  readonly capabilityScore: number;
  readonly reasoningScore: number;
  readonly costScore: number;
  readonly latencyScore: number;
  readonly reliabilityScore: number;
  readonly confidence: ConfidenceLevel;
  readonly explanation: RankingExplanation;
  readonly expectedCost: number;
  readonly expectedLatencyMs: number;
  readonly expectedQuality: number;
  readonly expectedReliability: number;
}

export interface RankedModelCandidates {
  readonly capabilityId: CapabilityId;
  readonly department?: DepartmentKind;
  readonly candidates: readonly RankedModelCandidate[];
  readonly generatedAt: string;
}

export interface ModelRecommendation {
  readonly recommendationId: string;
  readonly capabilityId: CapabilityId;
  readonly department?: DepartmentKind;
  readonly primary: RankedModelCandidate;
  readonly fallbacks: readonly RankedModelCandidate[];
  readonly generatedAt: string;
}

export interface ModelIntelligenceRequest {
  readonly requestId: string;
  readonly capabilityId: CapabilityId;
  readonly department?: DepartmentKind;
  readonly taskDescription?: string;
  readonly budgetPerRequest?: number;
  readonly latencyTargetMs?: number;
  readonly qualityTarget?: number;
  readonly region?: string;
  readonly contextSize?: number;
  readonly expectedOutputTokens?: number;
  readonly policies?: readonly string[];
  readonly constraints?: readonly string[];
}
