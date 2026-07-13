/**
 * Optimization recommendation contracts.
 */

import type {
  OptimizationDomain,
  RecommendationDisposition,
  RecommendationPriority,
} from "./enums";

export interface OptimizationRecommendation {
  readonly id: string;
  readonly domain: OptimizationDomain;
  readonly priority: RecommendationPriority;
  readonly disposition: RecommendationDisposition;
  readonly title: string;
  readonly description: string;
  readonly rationale: string;
  readonly expectedImpact: number;
  readonly confidence: number;
  readonly advisoryOnly: true;
  readonly evidenceIds: readonly string[];
  readonly createdAt: string;
}

export interface OptimizationHeuristic {
  readonly id: string;
  readonly domain: OptimizationDomain;
  readonly name: string;
  readonly currentValue: number;
  readonly proposedValue: number;
  readonly delta: number;
  readonly rationale: string;
  readonly advisoryOnly: true;
}
