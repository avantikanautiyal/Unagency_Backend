/**
 * Complexity analysis contracts.
 */

import type { ComplexityTier } from "./enums";

export interface ComplexityProfile {
  readonly tier: ComplexityTier;
  readonly reasoningComplexity: number;
  readonly knowledgeComplexity: number;
  readonly executionComplexity: number;
  readonly outputComplexity: number;
  readonly humanInvolvement: number;
  readonly confidence: number;
  readonly estimatedDurationMinutes: number;
  readonly rationale: string;
}
