/** Provider Consensus constants. */

export const CONSENSUS_VERSION = "1.0.0";

export const DEFAULT_QUALITY_THRESHOLD = 0.5;

export const DIMENSION_WEIGHTS: Readonly<Record<string, number>> = {
  quality: 0.25,
  confidence: 0.2,
  evidence: 0.15,
  latency: 0.1,
  cost: 0.1,
  safety: 0.1,
  structure: 0.05,
  reasoning: 0.05,
};
