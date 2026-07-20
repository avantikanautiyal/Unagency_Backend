/**
 * Experience scoring dimensions.
 */

export interface ExperienceScores {
  readonly confidence: number;
  readonly evidenceScore: number;
  readonly impactScore: number;
  readonly reuseScore: number;
  readonly improvementScore: number;
  readonly applicabilityScore: number;
}
