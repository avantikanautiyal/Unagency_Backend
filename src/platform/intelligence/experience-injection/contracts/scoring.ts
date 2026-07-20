/**
 * Relevance and ranking score contracts.
 */

import type { ExperienceId } from "../../experience-intelligence/contracts/identifiers";
import type { SimilarityMatchKind } from "./enums";

export interface RelevanceScore {
  readonly experienceId: ExperienceId;
  readonly exactMatchScore: number;
  readonly applicabilityScore: number;
  readonly confidenceScore: number;
  readonly successScore: number;
  readonly recencyScore: number;
  readonly frequencyScore: number;
  readonly improvementScore: number;
  readonly evidenceScore: number;
  readonly semanticScore: number;
  readonly overallScore: number;
  readonly matchKind: SimilarityMatchKind;
}

export interface PrioritizationScore {
  readonly experienceId: ExperienceId;
  readonly priority: number;
  readonly rank: number;
  readonly factors: Readonly<Record<string, number>>;
}
