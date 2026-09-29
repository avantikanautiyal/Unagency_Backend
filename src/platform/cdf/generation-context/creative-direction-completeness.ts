/**
 * Generic creative-direction semantic completeness.
 * Evaluates whether structured choice fields are actionable for downstream generation.
 * No serviceId / phaseId / provider branches — field-content heuristics only.
 *
 * When productionSemantics capabilities are declared, production grading focuses
 * on those capability fields. Otherwise all production keys are considered.
 */

import {
  CREATIVE_DIRECTION_CONCEPT_FIELD_KEYS,
  CREATIVE_DIRECTION_PRODUCTION_FIELD_KEYS,
  productionFieldKeysForSemantics,
  type CreativeDirectionProductionSemantics,
} from "../creative-direction/production-semantics";

export type CreativeDirectionFieldAssessment = {
  readonly field: string;
  readonly present: boolean;
  readonly charCount: number;
  readonly actionable: boolean;
  readonly reason?: string;
};

/** Production actionability classification (extends conceptual completeness). */
export type CreativeDirectionActionability =
  | "complete"
  | "partially_actionable"
  | "insufficient";

export type CreativeDirectionCompleteness = {
  readonly actionableFieldCount: number;
  readonly populatedFieldCount: number;
  readonly totalAssessedFields: number;
  readonly sufficientlyDescriptive: boolean;
  /** Production-oriented classification for downstream generation readiness. */
  readonly actionability: CreativeDirectionActionability;
  readonly actionableProductionFieldCount: number;
  readonly fields: readonly CreativeDirectionFieldAssessment[];
  /** Stable fingerprint of actionable semantic payload (not raw PII dump). */
  readonly semanticFingerprint: string;
};

const VAGUE_PATTERNS: readonly RegExp[] = [
  /^create a beautiful\b/i,
  /^use a modern\b/i,
  /^tell the brand story\b/i,
  /^make it (nice|pretty|good|creative)\b/i,
  /^eye[- ]catching\b/i,
  /^visually appealing\b/i,
];

function isVague(text: string): boolean {
  const t = text.trim();
  if (t.length < 40) return true;
  return VAGUE_PATTERNS.some((re) => re.test(t));
}

function assessField(field: string, value: unknown): CreativeDirectionFieldAssessment {
  if (typeof value !== "string" || !value.trim()) {
    return {
      field,
      present: false,
      charCount: 0,
      actionable: false,
      reason: "missing",
    };
  }
  const text = value.trim();
  const charCount = text.length;
  if (isVague(text)) {
    return {
      field,
      present: true,
      charCount,
      actionable: false,
      reason: "too_generic",
    };
  }
  return { field, present: true, charCount, actionable: true };
}

function simpleFingerprint(parts: string[]): string {
  // FNV-1a 32-bit — stable, no crypto dependency in hot path.
  let h = 0x811c9dc5;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function classifyActionability(input: {
  readonly sufficientlyDescriptive: boolean;
  readonly actionableProductionFieldCount: number;
  readonly actionableBeyondName: number;
}): CreativeDirectionActionability {
  if (
    input.sufficientlyDescriptive &&
    input.actionableProductionFieldCount >= 2
  ) {
    return "complete";
  }
  if (
    input.sufficientlyDescriptive ||
    input.actionableProductionFieldCount >= 1 ||
    input.actionableBeyondName >= 2
  ) {
    return "partially_actionable";
  }
  return "insufficient";
}

/**
 * Assess whether a structured creative-direction / route object is actionable.
 * `productionSemantics` (optional) scopes which production fields count.
 */
export function assessCreativeDirectionCompleteness(
  choice: Readonly<Record<string, unknown>>,
  opts?: {
    readonly productionSemantics?: CreativeDirectionProductionSemantics | null;
  },
): CreativeDirectionCompleteness {
  const productionKeys = productionFieldKeysForSemantics(
    opts?.productionSemantics,
  );
  const assessedKeys = [
    ...CREATIVE_DIRECTION_CONCEPT_FIELD_KEYS,
    ...productionKeys,
  ];
  // Dedupe while preserving order.
  const seen = new Set<string>();
  const primaryFields = assessedKeys.filter((k) => {
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const fields = primaryFields.map((f) => assessField(f, choice[f]));
  const populatedFieldCount = fields.filter((f) => f.present).length;
  const actionableFieldCount = fields.filter((f) => f.actionable).length;
  const actionableBeyondName = fields.filter(
    (f) => f.field !== "name" && f.actionable,
  ).length;
  const sufficientlyDescriptive =
    actionableBeyondName >= 2 ||
    (actionableFieldCount >= 3 && actionableBeyondName >= 1);

  const productionKeySet = new Set<string>(
    opts?.productionSemantics
      ? productionKeys
      : CREATIVE_DIRECTION_PRODUCTION_FIELD_KEYS,
  );
  const actionableProductionFieldCount = fields.filter(
    (f) => productionKeySet.has(f.field) && f.actionable,
  ).length;

  const actionability = classifyActionability({
    sufficientlyDescriptive,
    actionableProductionFieldCount,
    actionableBeyondName,
  });

  const fpParts = fields
    .filter((f) => f.actionable)
    .map((f) => `${f.field}:${f.charCount}`);

  return {
    actionableFieldCount,
    populatedFieldCount,
    totalAssessedFields: fields.length,
    sufficientlyDescriptive,
    actionability,
    actionableProductionFieldCount,
    fields,
    semanticFingerprint: simpleFingerprint(fpParts),
  };
}
