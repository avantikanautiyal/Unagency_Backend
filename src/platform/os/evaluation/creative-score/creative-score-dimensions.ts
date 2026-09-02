/**
 * Track B3 — Creative Score dimensions (UNAGENCY AI QA).
 * Each dimension scored /10; total /100; release gate at 80.
 */

export const CREATIVE_SCORE_RELEASE_GATE = 80 as const;
export const CREATIVE_SCORE_WEAK_DIMENSION_THRESHOLD = 7 as const;
export const CREATIVE_SCORE_DIMENSION_MAX = 10 as const;

/** Ten creative QA dimensions — aligned to handbook QA-001+ intent. */
export const CREATIVE_SCORE_DIMENSIONS = [
  "strategic_relevance",
  "originality",
  "brand_ownership",
  "brief_fit",
  "craft",
  "channel_fit",
  "hierarchy",
  "voice_tone",
  "factual_integrity",
  "deliverability",
] as const;

export type CreativeScoreDimension = (typeof CREATIVE_SCORE_DIMENSIONS)[number];

export const CREATIVE_SCORE_DIMENSION_LABELS: Readonly<
  Record<CreativeScoreDimension, string>
> = Object.freeze({
  strategic_relevance: "Strategic relevance to brief",
  originality: "Originality / distinctiveness",
  brand_ownership: "Brand ownership / ownability",
  brief_fit: "Brief & job fit",
  craft: "Production craft & polish",
  channel_fit: "Channel / format fit",
  hierarchy: "Visual / copy hierarchy",
  voice_tone: "Voice & tone alignment",
  factual_integrity: "Factual & claim integrity",
  deliverability: "Client-ready deliverability",
});

export type CreativeDimensionScores = Readonly<
  Record<CreativeScoreDimension, number>
>;

export interface CreativeScoreResult {
  readonly dimensions: CreativeDimensionScores;
  /** Sum of dimension scores — 0–100. */
  readonly totalScore: number;
  /** Dimensions below CREATIVE_SCORE_WEAK_DIMENSION_THRESHOLD — rework first. */
  readonly weakDimensions: readonly CreativeScoreDimension[];
  readonly notes: readonly string[];
  readonly releaseAllowed: boolean;
}

export function sumCreativeDimensionScores(
  dimensions: CreativeDimensionScores
): number {
  return CREATIVE_SCORE_DIMENSIONS.reduce(
    (sum, key) => sum + Math.max(0, Math.min(CREATIVE_SCORE_DIMENSION_MAX, dimensions[key] ?? 0)),
    0
  );
}

export function weakCreativeDimensions(
  dimensions: CreativeDimensionScores,
  threshold: number = CREATIVE_SCORE_WEAK_DIMENSION_THRESHOLD
): CreativeScoreDimension[] {
  return CREATIVE_SCORE_DIMENSIONS.filter(
    (key) => (dimensions[key] ?? 0) < threshold
  );
}
