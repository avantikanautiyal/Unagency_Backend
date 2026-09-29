/**
 * Phase 20 — Explicit Stage 1 → Stage 2 rollout gates (evaluation helpers).
 */

export type RolloutGateId =
  | "correctness_canonical"
  | "correctness_legacy"
  | "correctness_artifact_pin"
  | "correctness_cmr_upstream"
  | "correctness_no_approval_note_sot"
  | "safety_invalid_no_advance"
  | "safety_unsupported_not_valid"
  | "safety_auth_fail_closed"
  | "observability_path_distinct"
  | "observability_no_secrets"
  | "performance_no_unsafe_cache"
  | "regression_phase_2_19";

export type RolloutGate = {
  readonly id: RolloutGateId;
  readonly category: "correctness" | "safety" | "observability" | "performance" | "regression";
  readonly description: string;
  readonly requiredForStage2: true;
};

export const STAGE_1_TO_2_GATES: readonly RolloutGate[] = [
  {
    id: "correctness_canonical",
    category: "correctness",
    description: "Canonical path succeeds for eligible Stage 1/2 sessions",
    requiredForStage2: true,
  },
  {
    id: "correctness_legacy",
    category: "correctness",
    description: "Legacy path remains functional when GEN OFF or ineligible",
    requiredForStage2: true,
  },
  {
    id: "correctness_artifact_pin",
    category: "correctness",
    description: "Exact ArtifactVersion pinning intact",
    requiredForStage2: true,
  },
  {
    id: "correctness_cmr_upstream",
    category: "correctness",
    description: "CMR resolves expected upstream exact version",
    requiredForStage2: true,
  },
  {
    id: "correctness_no_approval_note_sot",
    category: "correctness",
    description: "Approval notes are not ArtifactVersion source of truth",
    requiredForStage2: true,
  },
  {
    id: "safety_invalid_no_advance",
    category: "safety",
    description: "INVALID Output QA cannot advance",
    requiredForStage2: true,
  },
  {
    id: "safety_unsupported_not_valid",
    category: "safety",
    description: "UNSUPPORTED cannot become VALID through repair",
    requiredForStage2: true,
  },
  {
    id: "safety_auth_fail_closed",
    category: "safety",
    description: "Authorization remains fail-closed",
    requiredForStage2: true,
  },
  {
    id: "observability_path_distinct",
    category: "observability",
    description: "canonical vs legacy path identifiable in traces",
    requiredForStage2: true,
  },
  {
    id: "observability_no_secrets",
    category: "observability",
    description: "No raw prompts/secrets in rollout traces",
    requiredForStage2: true,
  },
  {
    id: "performance_no_unsafe_cache",
    category: "performance",
    description: "No caching that violates exact-version authority",
    requiredForStage2: true,
  },
  {
    id: "regression_phase_2_19",
    category: "regression",
    description: "Phase 2–19 regression suites pass",
    requiredForStage2: true,
  },
];

export function listStage1To2Gates(): readonly RolloutGate[] {
  return STAGE_1_TO_2_GATES;
}
