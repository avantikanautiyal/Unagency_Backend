/**
 * Track B3 — Creative Score judge (multi-dimension output analysis).
 * Independent of A3 continuity guards — evaluates creative quality, not hard spec misses.
 */

import type { CreativeTerritoryV0 } from "../../creative/job-object";
import {
  CREATIVE_SCORE_DIMENSION_LABELS,
  CREATIVE_SCORE_DIMENSION_MAX,
  CREATIVE_SCORE_RELEASE_GATE,
  CREATIVE_SCORE_DIMENSIONS,
  type CreativeDimensionScores,
  type CreativeScoreDimension,
  type CreativeScoreResult,
  sumCreativeDimensionScores,
  weakCreativeDimensions,
} from "./creative-score-dimensions";

export type CreativeScoreJudgeInput = {
  readonly preview: string;
  readonly objective?: string;
  readonly briefObjective?: string;
  readonly brandTone?: string;
  readonly brandVoice?: string;
  readonly brandAvoidTerms?: readonly string[];
  readonly brandPreferredTerms?: readonly string[];
  readonly service?: string;
  readonly territory?: CreativeTerritoryV0;
  readonly capabilityId?: string;
  readonly isImageCapability?: boolean;
};

const GENERIC_PHRASES = [
  "innovative solution",
  "cutting edge",
  "best in class",
  "world class",
  "game changer",
  "synergy",
  "leverage",
  "paradigm",
  "lorem ipsum",
  "placeholder",
  "todo:",
  "fixme",
];

const CHANNEL_HINTS: Readonly<Record<string, readonly string[]>> = {
  social: ["post", "feed", "story", "caption", "hashtag", "scroll", "thumb"],
  ads: ["cta", "headline", "conversion", "click", "offer", "banner"],
  copy: ["email", "subject", "body", "paragraph", "tone", "reader"],
  branding: ["logo", "mark", "identity", "wordmark", "lockup"],
  photography: ["light", "lens", "scene", "hero", "product", "lifestyle"],
  website: ["header", "nav", "section", "layout", "page", "hero"],
};

function clampScore(n: number): number {
  return Math.max(0, Math.min(CREATIVE_SCORE_DIMENSION_MAX, Math.round(n * 10) / 10));
}

function briefTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 3)
    .slice(0, 12);
}

function tokenOverlapScore(preview: string, reference: string): number {
  const tokens = briefTokens(reference);
  if (!tokens.length) return CREATIVE_SCORE_DIMENSION_MAX * 0.7;
  const lower = preview.toLowerCase();
  const hits = tokens.filter((t) => lower.includes(t)).length;
  const ratio = hits / tokens.length;
  if (ratio >= 0.5) return CREATIVE_SCORE_DIMENSION_MAX;
  if (ratio >= 0.25) return 8;
  if (ratio >= 0.1) return 6;
  if (hits > 0) return 5;
  return 3;
}

function scoreStrategicRelevance(input: CreativeScoreJudgeInput): number {
  const ref = (input.objective ?? input.briefObjective ?? "").trim();
  if (!ref) return 7;
  return tokenOverlapScore(input.preview, ref);
}

function scoreOriginality(preview: string): number {
  const lower = preview.toLowerCase();
  let penalty = 0;
  for (const phrase of GENERIC_PHRASES) {
    if (lower.includes(phrase)) penalty += 2;
  }
  const words = lower.split(/\W+/).filter(Boolean);
  const unique = new Set(words);
  const diversity = words.length ? unique.size / words.length : 0;
  let score = 6 + diversity * 4 - penalty;
  if (words.length >= 40 && diversity > 0.55) score += 1;
  return clampScore(score);
}

function scoreBrandOwnership(input: CreativeScoreJudgeInput): number {
  const preview = input.preview.toLowerCase();
  const preferred = [
    ...(input.brandPreferredTerms ?? []),
    input.brandTone,
    input.brandVoice,
  ].filter(Boolean) as string[];
  if (!preferred.length) return 7;
  const hits = preferred.filter((t) =>
    preview.includes(String(t).toLowerCase())
  ).length;
  if (hits >= 2) return CREATIVE_SCORE_DIMENSION_MAX;
  if (hits === 1) return 8;
  return 5;
}

function scoreBriefFit(input: CreativeScoreJudgeInput): number {
  const base = scoreStrategicRelevance(input);
  const service = (input.service ?? "").toLowerCase();
  if (!service) return base;
  const hints = Object.entries(CHANNEL_HINTS).find(([k]) =>
    service.includes(k)
  )?.[1];
  if (!hints?.length) return base;
  const lower = input.preview.toLowerCase();
  const channelHits = hints.filter((h) => lower.includes(h)).length;
  return clampScore(base * 0.6 + Math.min(channelHits, 3) * 1.2);
}

function scoreCraft(preview: string): number {
  const len = preview.trim().length;
  if (len < 8) return 2;
  if (/lorem ipsum|placeholder text|todo:|fixme|\[insert/i.test(preview)) return 3;
  if (len < 24) return 5;
  if (len < 80) return 7;
  const hasStructure =
    /\n/.test(preview) ||
    /^[\s]*[-*•]/.test(preview) ||
    /[.!?]/.test(preview);
  return clampScore(hasStructure ? 9 : 8);
}

function scoreChannelFit(input: CreativeScoreJudgeInput): number {
  const service = (input.service ?? input.capabilityId ?? "").toLowerCase();
  if (input.isImageCapability) {
    const visualCues = ["color", "light", "composition", "typography", "layout"];
    const hits = visualCues.filter((c) =>
      input.preview.toLowerCase().includes(c)
    ).length;
    return clampScore(6 + hits);
  }
  const key = Object.keys(CHANNEL_HINTS).find((k) => service.includes(k));
  if (!key) return 7;
  const hints = CHANNEL_HINTS[key]!;
  const hits = hints.filter((h) =>
    input.preview.toLowerCase().includes(h)
  ).length;
  return clampScore(5 + Math.min(hits, 3) * 1.5);
}

function scoreHierarchy(preview: string): number {
  const lines = preview.split("\n").filter((l) => l.trim());
  if (lines.length >= 3) return 9;
  if (lines.length === 2) return 8;
  if (/^#+\s|^\d+\.|^[-*•]\s/m.test(preview)) return 8;
  if (preview.includes(":") && preview.length > 60) return 7;
  return preview.length > 120 ? 6 : 5;
}

function scoreVoiceTone(input: CreativeScoreJudgeInput): number {
  const voice = [input.brandVoice, input.brandTone].filter(Boolean).join(" ");
  if (!voice.trim()) return 7;
  return tokenOverlapScore(input.preview, voice);
}

function scoreFactualIntegrity(input: CreativeScoreJudgeInput): number {
  const preview = input.preview;
  let score = CREATIVE_SCORE_DIMENSION_MAX;
  if (/lorem ipsum|placeholder|example\.com|xxx|000-000/i.test(preview)) {
    score -= 4;
  }
  const avoid = input.brandAvoidTerms ?? [];
  const lower = preview.toLowerCase();
  for (const term of avoid) {
    if (term && lower.includes(term.toLowerCase())) score -= 3;
  }
  if (/\b(guaranteed|cure|100%|no risk)\b/i.test(preview)) score -= 2;
  return clampScore(score);
}

function scoreDeliverability(preview: string, isImage: boolean): number {
  const trimmed = preview.trim();
  if (!trimmed) return 0;
  if (/todo:|fixme|tbd|\?\?\?/i.test(trimmed)) return 4;
  const minLen = isImage ? 20 : 40;
  if (trimmed.length < minLen) return 5;
  if (trimmed.length >= minLen * 2) return 9;
  return 8;
}

function territoryBonus(
  territory: CreativeTerritoryV0 | undefined,
  dimension: CreativeScoreDimension,
  score: number
): number {
  if (!territory) return score;
  if (territory === "iconic" && dimension === "brand_ownership") return clampScore(score + 0.5);
  if (territory === "distinctive" && dimension === "originality") return clampScore(score + 0.5);
  if (territory === "elevated" && dimension === "craft") return clampScore(score + 0.5);
  return score;
}

export function judgeCreativeScore(
  input: CreativeScoreJudgeInput
): CreativeScoreResult {
  const preview = (input.preview ?? "").trim();
  const isImage = input.isImageCapability === true;

  const raw: CreativeDimensionScores = {
    strategic_relevance: scoreStrategicRelevance(input),
    originality: scoreOriginality(preview),
    brand_ownership: scoreBrandOwnership(input),
    brief_fit: scoreBriefFit(input),
    craft: scoreCraft(preview),
    channel_fit: scoreChannelFit(input),
    hierarchy: scoreHierarchy(preview),
    voice_tone: scoreVoiceTone(input),
    factual_integrity: scoreFactualIntegrity(input),
    deliverability: scoreDeliverability(preview, isImage),
  };

  const dimensions = Object.fromEntries(
    CREATIVE_SCORE_DIMENSIONS.map((key) => [
      key,
      territoryBonus(input.territory, key, raw[key]),
    ])
  ) as CreativeDimensionScores;

  const totalScore = sumCreativeDimensionScores(dimensions);
  const weak = weakCreativeDimensions(dimensions);
  const notes: string[] = [];
  for (const key of weak) {
    notes.push(
      `Rework ${CREATIVE_SCORE_DIMENSION_LABELS[key]} (${dimensions[key]}/10)`
    );
  }
  if (totalScore < CREATIVE_SCORE_RELEASE_GATE) {
    notes.unshift(
      `Creative score ${totalScore}/100 is below release gate (${CREATIVE_SCORE_RELEASE_GATE})`
    );
  }

  return {
    dimensions,
    totalScore,
    weakDimensions: weak,
    notes,
    releaseAllowed: totalScore >= CREATIVE_SCORE_RELEASE_GATE,
  };
}
