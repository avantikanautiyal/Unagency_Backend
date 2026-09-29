/**
 * Phase 19 — Documented rollout policy (no hidden percentage system).
 * Phase 20 — currentStage reflects CDF_CANONICAL_ROLLOUT_STAGE when set.
 */

import type { RolloutStage } from "./types";
import { PRODUCTION_FLAG_DEFAULTS } from "./flag-matrix";
import { parseRolloutStageEnv } from "./eligibility";

export type RolloutPolicyStage = {
  readonly stage: RolloutStage;
  readonly name: string;
  readonly description: string;
  readonly generationFlag: "OFF" | "controlled" | "allowlist" | "broader" | "decision";
  readonly repairFlag: "OFF" | "opt_in" | "decision";
  readonly services: string;
};

export const ROLLOUT_POLICY_STAGES: readonly RolloutPolicyStage[] = [
  {
    stage: "STAGE_0_OFF",
    name: "Off",
    description: "Both flags OFF. Legacy Direct path only. Default production.",
    generationFlag: "OFF",
    repairFlag: "OFF",
    services: "all — legacy",
  },
  {
    stage: "STAGE_1_INTERNAL_TEST",
    name: "Controlled internal/test CDF sessions",
    description:
      "Enable CDF_CANONICAL_GENERATION_CONTEXT only for orgs in CDF_CANONICAL_INTERNAL_ORG_ALLOWLIST",
    generationFlag: "controlled",
    repairFlag: "OFF",
    services: "allowlisted internal orgs/projects",
  },
  {
    stage: "STAGE_2_CLASS_A_ALLOWLIST",
    name: "Class-A service/phase allowlist",
    description:
      "presentation, packaging, social-media — READY_WITH_LIMITATIONS (not unqualified READY)",
    generationFlag: "allowlist",
    repairFlag: "OFF",
    services: "presentation, packaging, social-media",
  },
  {
    stage: "STAGE_3_BROADER_SERVICES",
    name: "Broader service rollout",
    description:
      "Expand generation strangler carefully; Class-D remains continuity-incomplete. NOT in Phase 20.",
    generationFlag: "broader",
    repairFlag: "OFF",
    services: "all generation-safe; Class-D without continuity claims",
  },
  {
    stage: "STAGE_4_REPAIR_OPT_IN",
    name: "Repair opt-in for proven actions",
    description:
      "Enable CDF_CANONICAL_AUTOMATIC_REPAIR only with generation ON for allowlisted actions. NOT in Phase 20.",
    generationFlag: "allowlist",
    repairFlag: "opt_in",
    services: "proven Class-A actions only",
  },
  {
    stage: "STAGE_5_GLOBAL_DECISION",
    name: "Future global enablement decision",
    description:
      "Requires evidence + ops sign-off. Not automatic. NOT in Phase 20.",
    generationFlag: "decision",
    repairFlag: "decision",
    services: "TBD",
  },
];

export function resolveConfiguredRolloutStage(
  env: NodeJS.ProcessEnv = process.env,
): RolloutStage | "UNSET" | "MALFORMED" {
  const parsed = parseRolloutStageEnv(env);
  if (parsed.kind === "unset") return "UNSET";
  if (parsed.kind === "malformed") return "MALFORMED";
  return parsed.stage!;
}

/**
 * Operational policy snapshot.
 * currentStage: STAGE_0_OFF when unset (safe default documentation);
 * configuredStage reflects env (UNSET | MALFORMED | stage).
 * Phase 20 max implemented target: STAGE_2_CLASS_A_ALLOWLIST.
 */
export function getRolloutPolicy(env: NodeJS.ProcessEnv = process.env): {
  readonly contractVersion: "21.0.0";
  readonly currentStage: RolloutStage;
  readonly configuredStage: RolloutStage | "UNSET" | "MALFORMED";
  readonly phase20MaxStage: "STAGE_2_CLASS_A_ALLOWLIST";
  readonly stage2Certification: "phase_21";
  readonly stages: readonly RolloutPolicyStage[];
  readonly defaults: typeof PRODUCTION_FLAG_DEFAULTS;
  readonly hiddenPercentageRollout: false;
  readonly autoEnableFromBenchmarks: false;
  readonly classAAllowlist: readonly ["presentation", "packaging", "social-media"];
} {
  const configured = resolveConfiguredRolloutStage(env);
  const currentStage: RolloutStage =
    configured === "UNSET" || configured === "MALFORMED"
      ? "STAGE_0_OFF"
      : configured;

  return {
    contractVersion: "21.0.0",
    currentStage,
    configuredStage: configured,
    phase20MaxStage: "STAGE_2_CLASS_A_ALLOWLIST",
    stage2Certification: "phase_21",
    stages: ROLLOUT_POLICY_STAGES,
    defaults: PRODUCTION_FLAG_DEFAULTS,
    hiddenPercentageRollout: false,
    autoEnableFromBenchmarks: false,
    classAAllowlist: ["presentation", "packaging", "social-media"],
  };
}
