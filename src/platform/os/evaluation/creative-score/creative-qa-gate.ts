/**
 * Track B3 — Creative QA release gate + targeted refine signals.
 */

import type { EvaluationResult } from "../contracts/evaluation-result";
import {
  CREATIVE_SCORE_RELEASE_GATE,
  CREATIVE_SCORE_DIMENSION_LABELS,
  type CreativeScoreDimension,
  type CreativeScoreResult,
} from "./creative-score-dimensions";
import {
  creativeQaBlocksRelease,
  creativeQaObservesOnly,
  resolveCreativeQaRollout,
} from "./creative-qa-rollout";
import { CREATIVE_SCORE_EVALUATOR_ID } from "../evaluators/creative-score-evaluator";

export interface CreativeQaGateResult {
  readonly rollout: ReturnType<typeof resolveCreativeQaRollout>;
  readonly totalScore: number;
  readonly releaseAllowed: boolean;
  readonly blockedRelease: boolean;
  readonly suggestRefine: boolean;
  readonly weakDimensions: readonly CreativeScoreDimension[];
  readonly dimensionScores: Readonly<Record<string, number>>;
  readonly notes: readonly string[];
  readonly blockReason?: string;
}

export function creativeQaFromEvaluationResult(
  result: EvaluationResult | undefined,
  rollout = resolveCreativeQaRollout()
): CreativeQaGateResult | null {
  if (!result || result.evaluatorId !== CREATIVE_SCORE_EVALUATOR_ID) {
    return null;
  }
  const total = result.scores.creativeScoreTotal ?? 0;
  const dimScores = result.scores.creativeDimensionScores ?? {};
  const weak = Object.entries(dimScores)
    .filter(([, v]) => typeof v === "number" && v < 7)
    .map(([k]) => k as CreativeScoreDimension);
  const releaseAllowed = total >= CREATIVE_SCORE_RELEASE_GATE;
  const blocks = creativeQaBlocksRelease(rollout) && !releaseAllowed;
  const shadow = creativeQaObservesOnly(rollout);
  const suggestRefine = weak.length > 0;

  return {
    rollout,
    totalScore: total,
    releaseAllowed,
    blockedRelease: blocks && !shadow,
    suggestRefine,
    weakDimensions: weak,
    dimensionScores: dimScores,
    notes: result.findings.map((f) => f.message),
    blockReason: blocks
      ? shadow
        ? undefined
        : `Creative score ${total}/100 below release gate (${CREATIVE_SCORE_RELEASE_GATE})`
      : undefined,
  };
}

export function creativeQaFromScoreResult(
  score: CreativeScoreResult,
  rollout = resolveCreativeQaRollout()
): CreativeQaGateResult {
  const blocks = creativeQaBlocksRelease(rollout) && !score.releaseAllowed;
  const shadow = creativeQaObservesOnly(rollout);
  return {
    rollout,
    totalScore: score.totalScore,
    releaseAllowed: score.releaseAllowed,
    blockedRelease: blocks && !shadow,
    suggestRefine: score.weakDimensions.length > 0,
    weakDimensions: score.weakDimensions,
    dimensionScores: score.dimensions,
    notes: score.notes,
    blockReason: blocks
      ? shadow
        ? undefined
        : `Creative score ${score.totalScore}/100 below release gate (${CREATIVE_SCORE_RELEASE_GATE})`
      : undefined,
  };
}

export function creativeQaExtras(
  gate: CreativeQaGateResult | null
): Record<string, unknown> | undefined {
  if (!gate) return undefined;
  return {
    creativeQa: {
      rollout: gate.rollout,
      totalScore: gate.totalScore,
      releaseGate: CREATIVE_SCORE_RELEASE_GATE,
      releaseAllowed: gate.releaseAllowed,
      blockedRelease: gate.blockedRelease,
      suggestRefine: gate.suggestRefine,
      weakDimensions: gate.weakDimensions.map(
        (d) => `${d}:${CREATIVE_SCORE_DIMENSION_LABELS[d]}`
      ),
      dimensionScores: gate.dimensionScores,
      notes: gate.notes,
      blockReason: gate.blockReason,
    },
  };
}

export function applyCreativeQaToRouteObject(input: {
  readonly qaScore?: number;
  readonly qaNotes?: readonly string[];
  readonly gate: CreativeQaGateResult | null;
}): { qaScore?: number; qaNotes?: readonly string[] } {
  if (!input.gate) return {};
  return {
    qaScore: input.gate.totalScore,
    qaNotes: input.gate.notes.length ? input.gate.notes : input.qaNotes,
  };
}
