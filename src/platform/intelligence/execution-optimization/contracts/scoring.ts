/**
 * Scoring and confidence contracts.
 */

import type { ConfidenceLevel, OptimizationDomain } from "./enums";

export interface OptimizationScore {
  readonly domain: OptimizationDomain;
  readonly score: number;
  readonly baseline: number;
  readonly improvement: number;
  readonly weight: number;
}

export interface OptimizationConfidence {
  readonly level: ConfidenceLevel;
  readonly score: number;
  readonly factors: readonly string[];
  readonly sampleSize: number;
  readonly rationale: string;
}
