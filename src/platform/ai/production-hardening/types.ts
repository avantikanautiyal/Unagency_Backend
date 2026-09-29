/**
 * Phase 19 — Production Hardening / Rollout Readiness contracts.
 * Policy + inventory only — no second execution/QA/benchmark/registry systems.
 */

export const PRODUCTION_HARDENING_CONTRACT_VERSION = "21.0.0" as const;

export type PathClassification =
  | "CANONICAL"
  | "LEGACY"
  | "INTENTIONALLY_LEGACY"
  | "UNSUPPORTED"
  | "BUG";

export type RolloutReadiness =
  | "READY"
  | "READY_WITH_LIMITATIONS"
  | "BLOCKED"
  | "LEGACY_ONLY";

export type RolloutStage =
  | "STAGE_0_OFF"
  | "STAGE_1_INTERNAL_TEST"
  | "STAGE_2_CLASS_A_ALLOWLIST"
  | "STAGE_3_BROADER_SERVICES"
  | "STAGE_4_REPAIR_OPT_IN"
  | "STAGE_5_GLOBAL_DECISION";

export type FeatureFlagState = {
  readonly cdfCanonicalGenerationContext: boolean;
  readonly cdfCanonicalAutomaticRepair: boolean;
};

export type FlagMatrixCell = {
  readonly generation: boolean;
  readonly repair: boolean;
  readonly expectedBehavior: string;
  readonly modelGenerationViaActionExecution: "supported" | "unsupported";
  readonly structuredRepair: "eligible_if_qa" | "disabled" | "context_conflict";
  readonly legacyCreatePath: "unchanged" | "strangler_alongside";
  readonly createsUnexpectedCanonicalPath: false;
};

export type ProductionPathEntry = {
  readonly pathId: string;
  readonly surface: string;
  readonly entry: string;
  readonly actionResolution: string;
  readonly actionExecution: string;
  readonly contextOrchestration: string;
  readonly cmr: string;
  readonly modelRuntime: string;
  readonly provider: string;
  readonly outputQa: string;
  readonly repair: string;
  readonly persistence: string;
  readonly stateAdvancement: string;
  readonly classification: PathClassification;
  readonly notes?: string;
};

export type BypassCatalogEntry = {
  readonly id: string;
  readonly description: string;
  readonly location: string;
  readonly classification: PathClassification;
  readonly rolloutBlocker: boolean;
};

export type ServiceRolloutRow = {
  readonly serviceId: string;
  readonly classLabel: "A" | "D" | "other";
  readonly readiness: RolloutReadiness;
  readonly generationReady: boolean;
  readonly artifactContinuityComplete: boolean;
  readonly limitations: readonly string[];
  readonly recommendedStage: RolloutStage;
};

export type FailureContainmentExpectation = {
  readonly failurePoint: string;
  readonly typedErrorRequired: true;
  readonly noPartialUnsafeMutation: true;
  readonly noSilentFallback: true;
  readonly noCdfAdvancementOnRequiredFailure: true;
  readonly noApprovalMutation: true;
  readonly noArtifactCorruption: true;
  readonly safeTrace: true;
};

export type ProductionConfigDoc = {
  readonly defaults: {
    readonly CDF_CANONICAL_GENERATION_CONTEXT: "OFF";
    readonly CDF_CANONICAL_AUTOMATIC_REPAIR: "OFF";
  };
  readonly enableValues: readonly ["1", "true"];
  readonly rollback: string;
  readonly benchmarkAltersFlags: false;
  readonly globalEnableInPhase19: false;
};
