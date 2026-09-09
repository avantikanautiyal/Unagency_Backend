/**
 * Shared helpers for Format & Production Spec platform rule tables.
 */

import { FORMAT_PRODUCTION_SPEC_EDITION } from "../edition";
import type {
  HygieneEvaluationMethod,
  HygieneWeight,
  ProductionHygieneCheck,
  ProductionRule,
} from "../types";

export function rule(
  partial: Omit<ProductionRule, "edition" | "service" | "blocksReleaseIfUnconfirmed"> & {
    readonly blocksReleaseIfUnconfirmed?: boolean;
    readonly service?: string;
  },
): ProductionRule {
  const status = partial.status;
  return Object.freeze({
    ...partial,
    edition: FORMAT_PRODUCTION_SPEC_EDITION,
    service: partial.service ?? "social",
    blocksReleaseIfUnconfirmed:
      partial.blocksReleaseIfUnconfirmed ??
      (status === "R" || status === "H"),
    ...(partial.hygieneChecks
      ? { hygieneChecks: Object.freeze([...partial.hygieneChecks]) }
      : {}),
    ...(partial.universalGateIds
      ? { universalGateIds: Object.freeze([...partial.universalGateIds]) }
      : {}),
  });
}

/** Author a structured hygiene check for Phase 2+ catalog entries. */
export function hygieneCheck(input: {
  readonly id: string;
  readonly weight: HygieneWeight;
  readonly passDefinition: string;
  readonly promptLine: string;
  readonly evaluationMethod?: HygieneEvaluationMethod;
}): ProductionHygieneCheck {
  return Object.freeze({
    id: input.id,
    weight: input.weight,
    evaluationMethod: input.evaluationMethod ?? "NOT_AUTOMATED",
    passDefinition: input.passDefinition,
    promptLine: input.promptLine,
  });
}

export const srgbStill = Object.freeze({
  formats: Object.freeze(["png", "jpg"]),
  notes: "sRGB digital still",
} as const);

export const videoWeb = Object.freeze({
  formats: Object.freeze(["mp4"]),
  notes: "Rec.709; MP4/H.264 house web delivery",
} as const);
