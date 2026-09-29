/**
 * Phase 20/21 — Progressive enablement eligibility (server-side, fail-closed).
 *
 * Production contract:
 *   GEN OFF → legacy (unless caller already forced contract-canonical)
 *   GEN ON + STAGE_0 → legacy
 *   GEN ON + STAGE_1 + org allowlist → canonical
 *   GEN ON + STAGE_2 → canonical for any CDF-registered service / canonical phase
 *   GEN ON + malformed → fail closed / legacy
 *   GEN ON + stage UNSET → legacy UNLESS CDF_CANONICAL_ROLLOUT_COMPAT=1|true
 *
 * Class-A (CDF_DEEP_INGEST_RUNTIME_SERVICES) is NOT an execution eligibility gate.
 * It only labels deep-ingest / specialized completion adapters elsewhere.
 * STAGE_2_* env names are historical — they must never restore a Class-A prerequisite.
 *
 * Compat flag is for historical Phase 2–20 tests only — never a production bypass.
 */

import { isCdfCanonicalGenerationContextEnabled } from "../../cdf/generation-context/flag";
import {
  resolveCdfCanonicalService,
  resolveCdfPhaseExecutionContract,
} from "../../cdf/canonical";
import { isCanonicalAutomaticRepairEnvEnabled } from "../repair";
import { CDF_DEEP_INGEST_RUNTIME_SERVICES } from "../conversational-runtime/acceptance-matrix";
import type { RolloutStage } from "./types";

export const CDF_CANONICAL_ROLLOUT_STAGE_ENV =
  "CDF_CANONICAL_ROLLOUT_STAGE" as const;
export const CDF_CANONICAL_INTERNAL_ORG_ALLOWLIST_ENV =
  "CDF_CANONICAL_INTERNAL_ORG_ALLOWLIST" as const;
export const CDF_CANONICAL_INTERNAL_PROJECT_ALLOWLIST_ENV =
  "CDF_CANONICAL_INTERNAL_PROJECT_ALLOWLIST" as const;
export const CDF_CANONICAL_HTTP_OUTPUT_QA_ENV =
  "CDF_CANONICAL_HTTP_OUTPUT_QA" as const;
export const CDF_CANONICAL_HTTP_REPAIR_ENV =
  "CDF_CANONICAL_HTTP_REPAIR" as const;
/** Explicit test/legacy-compat only. Production MUST leave unset/OFF. */
export const CDF_CANONICAL_ROLLOUT_COMPAT_ENV =
  "CDF_CANONICAL_ROLLOUT_COMPAT" as const;

export type CanonicalPathDecision = "legacy" | "canonical";

export type EligibilityDenyReason =
  | "generation_flag_off"
  | "stage_0_off"
  | "stage_malformed"
  | "unset_stage_without_compat"
  | "org_allowlist_empty"
  | "org_not_allowlisted"
  | "project_not_allowlisted"
  /** @deprecated Never emitted — Class-A is not an eligibility gate. */
  | "service_not_class_a"
  | "missing_service_id"
  | "unknown_cdf_service"
  | "phase_not_canonical"
  | "phase_strategy_none"
  | "phase_strategy_unsupported";

export type CanonicalEligibilityInput = {
  readonly organizationId?: string;
  readonly projectId?: string;
  readonly serviceId?: string;
  readonly cdfSessionId?: string;
  readonly cdfPhaseId?: string;
  readonly executionId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

export type CanonicalEligibilityDecision = {
  readonly eligible: boolean;
  readonly path: CanonicalPathDecision;
  readonly generationFlag: boolean;
  readonly repairFlag: boolean;
  readonly stage: RolloutStage | "UNSET" | "MALFORMED";
  readonly reason: string;
  readonly denyReason?: EligibilityDenyReason;
  readonly serviceId?: string;
  readonly organizationId?: string;
  readonly projectId?: string;
  readonly failClosed: boolean;
  readonly compatMode: boolean;
};

const CLASS_A = new Set<string>(CDF_DEEP_INGEST_RUNTIME_SERVICES);

const STAGE_ALIASES: Record<string, RolloutStage> = {
  "0": "STAGE_0_OFF",
  stage_0: "STAGE_0_OFF",
  stage_0_off: "STAGE_0_OFF",
  stage0: "STAGE_0_OFF",
  "1": "STAGE_1_INTERNAL_TEST",
  stage_1: "STAGE_1_INTERNAL_TEST",
  stage_1_internal_test: "STAGE_1_INTERNAL_TEST",
  stage_1_internal: "STAGE_1_INTERNAL_TEST",
  stage1: "STAGE_1_INTERNAL_TEST",
  "2": "STAGE_2_CLASS_A_ALLOWLIST",
  stage_2: "STAGE_2_CLASS_A_ALLOWLIST",
  stage_2_class_a_allowlist: "STAGE_2_CLASS_A_ALLOWLIST",
  stage_2_class_a: "STAGE_2_CLASS_A_ALLOWLIST",
  stage2: "STAGE_2_CLASS_A_ALLOWLIST",
};

export function parseRolloutStageEnv(
  env: NodeJS.ProcessEnv = process.env,
): {
  readonly kind: "unset" | "stage" | "malformed";
  readonly stage?: RolloutStage;
  readonly raw?: string;
} {
  const raw = env[CDF_CANONICAL_ROLLOUT_STAGE_ENV];
  if (raw == null || String(raw).trim() === "") {
    return { kind: "unset" };
  }
  const key = String(raw).trim().toLowerCase().replace(/-/g, "_");
  const upper = String(raw).trim().toUpperCase().replace(/-/g, "_");
  if (
    upper === "STAGE_0_OFF" ||
    upper === "STAGE_1_INTERNAL_TEST" ||
    upper === "STAGE_2_CLASS_A_ALLOWLIST"
  ) {
    return { kind: "stage", stage: upper as RolloutStage, raw };
  }
  if (
    upper === "STAGE_3_BROADER_SERVICES" ||
    upper === "STAGE_4_REPAIR_OPT_IN" ||
    upper === "STAGE_5_GLOBAL_DECISION" ||
    key === "3" ||
    key === "4" ||
    key === "5"
  ) {
    return { kind: "malformed", raw };
  }
  const aliased = STAGE_ALIASES[key];
  if (aliased) return { kind: "stage", stage: aliased, raw };
  return { kind: "malformed", raw };
}

function parseAllowlist(raw: string | undefined): readonly string[] {
  if (raw == null || raw.trim() === "") return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function envFlagOn(name: string, env: NodeJS.ProcessEnv): boolean {
  const v = env[name];
  return v === "1" || v === "true";
}

export function isRolloutCompatEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return envFlagOn(CDF_CANONICAL_ROLLOUT_COMPAT_ENV, env);
}

export function isHttpOutputQaEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return envFlagOn(CDF_CANONICAL_HTTP_OUTPUT_QA_ENV, env);
}

export function isHttpRepairEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return envFlagOn(CDF_CANONICAL_HTTP_REPAIR_ENV, env);
}

function resolveServiceId(input: CanonicalEligibilityInput): string | undefined {
  if (input.serviceId?.trim()) return input.serviceId.trim();
  const meta = input.metadata;
  if (!meta) return undefined;
  const fromMeta =
    (typeof meta.cdfServiceId === "string" && meta.cdfServiceId.trim()) ||
    (typeof meta.serviceId === "string" && meta.serviceId.trim()) ||
    "";
  return fromMeta || undefined;
}

/**
 * Resolve whether this execution may use the canonical generation path.
 * Fail-closed: malformed / stage 0 / unset without compat / missing allowlist → legacy.
 */
export function resolveCanonicalGenerationEligibility(
  input: CanonicalEligibilityInput,
  env: NodeJS.ProcessEnv = process.env,
): CanonicalEligibilityDecision {
  const generationFlag = isCdfCanonicalGenerationContextEnabled(env);
  const repairFlag = isCanonicalAutomaticRepairEnvEnabled(env);
  const compatMode = isRolloutCompatEnabled(env);
  const org =
    input.organizationId?.trim() ||
    (typeof input.metadata?.organizationId === "string"
      ? input.metadata.organizationId.trim()
      : "") ||
    undefined;
  const project =
    input.projectId?.trim() ||
    (typeof input.metadata?.projectId === "string"
      ? input.metadata.projectId.trim()
      : "") ||
    undefined;
  const serviceId = resolveServiceId(input);
  const parsed = parseRolloutStageEnv(env);

  const base = {
    generationFlag,
    repairFlag,
    serviceId,
    organizationId: org,
    projectId: project,
    compatMode,
  };

  if (!generationFlag) {
    return {
      ...base,
      eligible: false,
      path: "legacy",
      stage:
        parsed.kind === "stage"
          ? parsed.stage!
          : parsed.kind === "malformed"
            ? "MALFORMED"
            : "UNSET",
      reason: "CDF_CANONICAL_GENERATION_CONTEXT OFF",
      denyReason: "generation_flag_off",
      failClosed: false,
    };
  }

  if (parsed.kind === "malformed") {
    return {
      ...base,
      eligible: false,
      path: "legacy",
      stage: "MALFORMED",
      reason: `Malformed CDF_CANONICAL_ROLLOUT_STAGE=${parsed.raw ?? ""} — fail closed`,
      denyReason: "stage_malformed",
      failClosed: true,
    };
  }

  // Phase 21: unset stage is production STAGE_0 equivalent unless explicit compat.
  if (parsed.kind === "unset") {
    if (compatMode) {
      return {
        ...base,
        eligible: true,
        path: "canonical",
        stage: "UNSET",
        reason:
          "GEN ON; stage unset + CDF_CANONICAL_ROLLOUT_COMPAT (test/legacy only)",
        failClosed: false,
      };
    }
    return {
      ...base,
      eligible: false,
      path: "legacy",
      stage: "UNSET",
      reason:
        "GEN ON but CDF_CANONICAL_ROLLOUT_STAGE unset — production requires explicit stage (fail closed)",
      denyReason: "unset_stage_without_compat",
      failClosed: true,
    };
  }

  const stage = parsed.stage!;

  if (stage === "STAGE_0_OFF") {
    return {
      ...base,
      eligible: false,
      path: "legacy",
      stage,
      reason: "STAGE_0_OFF — canonical gated off even if GEN ON",
      denyReason: "stage_0_off",
      failClosed: true,
    };
  }

  if (stage === "STAGE_1_INTERNAL_TEST") {
    const orgList = parseAllowlist(env[CDF_CANONICAL_INTERNAL_ORG_ALLOWLIST_ENV]);
    if (orgList.length === 0) {
      return {
        ...base,
        eligible: false,
        path: "legacy",
        stage,
        reason:
          "STAGE_1 requires non-empty CDF_CANONICAL_INTERNAL_ORG_ALLOWLIST — fail closed",
        denyReason: "org_allowlist_empty",
        failClosed: true,
      };
    }
    if (!org || !orgList.includes(org)) {
      return {
        ...base,
        eligible: false,
        path: "legacy",
        stage,
        reason: "organization not in Stage 1 internal allowlist",
        denyReason: "org_not_allowlisted",
        failClosed: false,
      };
    }
    const projectList = parseAllowlist(
      env[CDF_CANONICAL_INTERNAL_PROJECT_ALLOWLIST_ENV],
    );
    if (projectList.length > 0 && (!project || !projectList.includes(project))) {
      return {
        ...base,
        eligible: false,
        path: "legacy",
        stage,
        reason: "project not in Stage 1 project allowlist",
        denyReason: "project_not_allowlisted",
        failClosed: false,
      };
    }
    return {
      ...base,
      eligible: true,
      path: "canonical",
      stage,
      reason: "STAGE_1 internal session eligible",
      failClosed: false,
    };
  }

  if (stage === "STAGE_2_CLASS_A_ALLOWLIST") {
    if (!serviceId) {
      return {
        ...base,
        eligible: false,
        path: "legacy",
        stage,
        reason: "STAGE_2 requires cdfServiceId — fail closed",
        denyReason: "missing_service_id",
        failClosed: true,
      };
    }
    const orgList = parseAllowlist(env[CDF_CANONICAL_INTERNAL_ORG_ALLOWLIST_ENV]);
    if (orgList.length > 0 && (!org || !orgList.includes(org))) {
      return {
        ...base,
        eligible: false,
        path: "legacy",
        stage,
        reason: "organization not in optional Stage 2 org allowlist",
        denyReason: "org_not_allowlisted",
        failClosed: false,
      };
    }

    const phaseId = input.cdfPhaseId?.trim() || undefined;
    if (phaseId) {
      const contract = resolveCdfPhaseExecutionContract({
        serviceId,
        phaseId,
      });
      if (!contract) {
        return {
          ...base,
          eligible: false,
          path: "legacy",
          stage,
          reason: `Unknown CDF phase ${serviceId}.${phaseId}`,
          denyReason: "unknown_cdf_service",
          failClosed: true,
        };
      }
      if (contract.executionStrategy === "canonical") {
        return {
          ...base,
          eligible: true,
          path: "canonical",
          stage,
          reason: `STAGE_2 contract-canonical phase ${serviceId}.${phaseId} (Class-A membership not required)`,
          failClosed: false,
        };
      }
      if (contract.executionStrategy === "none") {
        return {
          ...base,
          eligible: false,
          path: "legacy",
          stage,
          reason: `Phase ${serviceId}.${phaseId} executionStrategy=none — not canonical generation`,
          denyReason: "phase_strategy_none",
          failClosed: false,
        };
      }
      return {
        ...base,
        eligible: false,
        path: "legacy",
        stage,
        reason: `Phase ${serviceId}.${phaseId} executionStrategy=${String(contract.executionStrategy)} — not canonical`,
        denyReason: "phase_strategy_unsupported",
        failClosed: false,
      };
    }

    // No phase: any CDF-registered service may use the canonical path.
    // Class-A membership is observational (deep adapters) — never eligibility.
    const registered = resolveCdfCanonicalService(serviceId);
    if (!registered) {
      return {
        ...base,
        eligible: false,
        path: "legacy",
        stage,
        reason: `service ${serviceId} is not a CDF-registered service`,
        denyReason: "unknown_cdf_service",
        failClosed: false,
      };
    }
    return {
      ...base,
      eligible: true,
      path: "canonical",
      stage,
      reason: `STAGE_2 CDF service ${serviceId} eligible (Class-A membership not required)`,
      failClosed: false,
    };
  }

  return {
    ...base,
    eligible: false,
    path: "legacy",
    stage: "MALFORMED",
    reason: "Unsupported rollout stage — fail closed",
    denyReason: "stage_malformed",
    failClosed: true,
  };
}

export function isClassARolloutService(serviceId: string): boolean {
  return CLASS_A.has(serviceId);
}

/**
 * Deep-ingest / specialized-completion overlay services (historical "Class-A").
 * Observational + adapter selection only — NEVER an execution eligibility allowlist.
 */
export const STAGE_2_CLASS_A_SERVICES = [
  "presentation",
  "packaging",
  "social-media",
] as const;

/** Preferred production defaults (Phase 21 contract). */
export const PRODUCTION_ROLLOUT_CONTRACT = {
  CDF_CANONICAL_GENERATION_CONTEXT: "OFF",
  CDF_CANONICAL_AUTOMATIC_REPAIR: "OFF",
  CDF_CANONICAL_ROLLOUT_STAGE: "STAGE_0_OFF",
  CDF_CANONICAL_ROLLOUT_COMPAT: "OFF",
  CDF_CANONICAL_HTTP_OUTPUT_QA: "OFF",
  CDF_CANONICAL_HTTP_REPAIR: "OFF",
  unsetWithoutCompat: "legacy_fail_closed",
  stage2CertifiedTarget: "STAGE_2_CLASS_A_ALLOWLIST",
  autoEnable: false,
} as const;
