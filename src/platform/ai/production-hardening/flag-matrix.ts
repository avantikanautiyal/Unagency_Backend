/**
 * Phase 19 — Feature flag matrix (exact expected behavior).
 * Does not mutate process.env; callers pass explicit states.
 */

import type { FlagMatrixCell, FeatureFlagState } from "./types";

export function readFeatureFlagState(
  env: NodeJS.ProcessEnv = process.env,
): FeatureFlagState {
  const gen = env.CDF_CANONICAL_GENERATION_CONTEXT;
  const repair = env.CDF_CANONICAL_AUTOMATIC_REPAIR;
  return {
    cdfCanonicalGenerationContext: gen === "1" || gen === "true",
    cdfCanonicalAutomaticRepair: repair === "1" || repair === "true",
  };
}

export function describeFlagMatrixCell(
  generation: boolean,
  repair: boolean,
): FlagMatrixCell {
  if (!generation && !repair) {
    return {
      generation: false,
      repair: false,
      expectedBehavior:
        "Legacy Direct create path unchanged; Action MODEL_GENERATION unsupported; repair disabled",
      modelGenerationViaActionExecution: "unsupported",
      structuredRepair: "disabled",
      legacyCreatePath: "unchanged",
      createsUnexpectedCanonicalPath: false,
    };
  }
  if (generation && !repair) {
    return {
      generation: true,
      repair: false,
      expectedBehavior:
        "Canonical Context Orchestrator → CMR → Model Runtime on CDF sessions; no automatic repair",
      modelGenerationViaActionExecution: "supported",
      structuredRepair: "disabled",
      legacyCreatePath: "strangler_alongside",
      createsUnexpectedCanonicalPath: false,
    };
  }
  if (!generation && repair) {
    return {
      generation: false,
      repair: true,
      expectedBehavior:
        "Repair env ON but MODEL_GENERATION structured repair returns REPAIR_CONTEXT_CONFLICT; must not invent canonical generation path; deterministic normalization may still run offline",
      modelGenerationViaActionExecution: "unsupported",
      structuredRepair: "context_conflict",
      legacyCreatePath: "unchanged",
      createsUnexpectedCanonicalPath: false,
    };
  }
  return {
    generation: true,
    repair: true,
    expectedBehavior:
      "Canonical generation + deterministic Output QA + bounded repair where eligible; UNSUPPORTED never → VALID",
    modelGenerationViaActionExecution: "supported",
    structuredRepair: "eligible_if_qa",
    legacyCreatePath: "strangler_alongside",
    createsUnexpectedCanonicalPath: false,
  };
}

export function allFlagMatrixCells(): readonly FlagMatrixCell[] {
  return [
    describeFlagMatrixCell(false, false),
    describeFlagMatrixCell(true, false),
    describeFlagMatrixCell(false, true),
    describeFlagMatrixCell(true, true),
  ];
}

/** Safe defaults for production configuration docs. */
export const PRODUCTION_FLAG_DEFAULTS = {
  CDF_CANONICAL_GENERATION_CONTEXT: "OFF",
  CDF_CANONICAL_AUTOMATIC_REPAIR: "OFF",
  CDF_CANONICAL_ROLLOUT_STAGE: "STAGE_0_OFF",
  CDF_CANONICAL_ROLLOUT_COMPAT: "OFF",
  CDF_CANONICAL_HTTP_OUTPUT_QA: "OFF",
  CDF_CANONICAL_HTTP_REPAIR: "OFF",
  enableValues: ["1", "true"] as const,
  globalEnableInPhase19: false as const,
  globalEnableInPhase20: false as const,
  globalEnableInPhase21: false as const,
  benchmarkAltersFlags: false as const,
  hiddenPercentageRollout: false as const,
  phase20MaxStage: "STAGE_2_CLASS_A_ALLOWLIST" as const,
  unsetWithoutCompat: "legacy_fail_closed" as const,
  rollback:
    "Unset GEN+REPAIR; set CDF_CANONICAL_ROLLOUT_STAGE=STAGE_0_OFF; leave CDF_CANONICAL_ROLLOUT_COMPAT unset/OFF → legacy Direct path",
} as const;
