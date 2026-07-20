/** Capability Intelligence constants. */

export const CAPABILITY_INTELLIGENCE_VERSION = "1.0.0";

export const SCORE_WEIGHTS = {
  quality: 0.2,
  cost: 0.1,
  latency: 0.1,
  reliability: 0.2,
  coverage: 0.15,
  reusability: 0.1,
  maturity: 0.15,
} as const;
