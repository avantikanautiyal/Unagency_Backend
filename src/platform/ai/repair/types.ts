/**
 * Phase 17 — Canonical Automatic Repair contracts.
 * Downstream of Output QA only. Does not call providers/Model Runtime/artifacts directly.
 */

import type { ActionDefinition } from "../action-registry";
import type {
  ActionExecutionDeps,
  ActionExecutionResult,
  CanonicalActionExecutionRequest,
} from "../action-execution";
import type {
  CanonicalOutputQAResult,
  OutputQAContext,
  OutputQAErrorCode,
  OutputQAPolicy,
} from "../output-qa";

export const AUTOMATIC_REPAIR_CONTRACT_VERSION = "17.0.0" as const;

/** Optional strangler — default OFF (same pattern as generation context). */
export const CDF_CANONICAL_AUTOMATIC_REPAIR_ENV =
  "CDF_CANONICAL_AUTOMATIC_REPAIR" as const;

export type RepairStrategy =
  | "STRUCTURED_OUTPUT_REPAIR"
  | "DETERMINISTIC_NORMALIZATION"
  | "CONTRACT_REGENERATION";

export type RepairErrorCode =
  | "REPAIR_NOT_ELIGIBLE"
  | "REPAIR_DISABLED"
  | "REPAIR_ATTEMPTS_EXHAUSTED"
  | "REPAIR_EXECUTION_FAILED"
  | "REPAIR_QA_FAILED"
  | "REPAIR_UNSAFE"
  | "REPAIR_CONTEXT_CONFLICT"
  | "REPAIR_NOT_SUPPORTED";

export type CanonicalRepairPolicy = {
  readonly enabled: boolean;
  readonly maxAttempts: number;
  readonly eligibleErrorCodes?: readonly OutputQAErrorCode[];
  readonly allowStructuredOutputRepair?: boolean;
  readonly allowDeterministicNormalization?: boolean;
  readonly allowContractRegeneration?: boolean;
  readonly preserveUserInstruction: true;
  readonly preserveRequirements: true;
  readonly preserveReferences: true;
  readonly preserveUpstreamArtifacts: true;
  readonly preserveOutputContract: true;
};

export const DEFAULT_REPAIR_POLICY: CanonicalRepairPolicy = {
  enabled: false,
  maxAttempts: 1,
  allowStructuredOutputRepair: true,
  allowDeterministicNormalization: true,
  allowContractRegeneration: true,
  preserveUserInstruction: true,
  preserveRequirements: true,
  preserveReferences: true,
  preserveUpstreamArtifacts: true,
  preserveOutputContract: true,
};

/** Codes that may trigger repair (deterministic contract failures). */
export const DEFAULT_ELIGIBLE_REPAIR_CODES: readonly OutputQAErrorCode[] = [
  "OUTPUT_SCHEMA_INVALID",
  "REQUIRED_FIELD_MISSING",
  "STRUCTURED_OUTPUT_LOSS",
  "FREE_TEXT_FALLBACK",
  "OUTPUT_KIND_MISMATCH",
  "OUTPUT_MISSING",
];

/** Codes that must never trigger automatic repair. */
export const NEVER_ELIGIBLE_REPAIR_CODES: readonly OutputQAErrorCode[] = [
  "ARTIFACT_NOT_FOUND",
  "ARTIFACT_VERSION_INVALID",
  "ARTIFACT_IDENTITY_MISMATCH",
  "SERVICE_MISMATCH",
  "PHASE_MISMATCH",
  "PERSISTENCE_MISMATCH",
  "REQUIRED_UPSTREAM_MISSING",
  "UNSUPPORTED_VALIDATION",
  "OUTPUT_CONTRACT_MISMATCH",
  "EXECUTION_FAILED",
];

export type CanonicalRepairRequest = {
  readonly action: ActionDefinition;
  readonly originalExecutionRequest: CanonicalActionExecutionRequest;
  readonly originalExecutionResult: ActionExecutionResult;
  readonly originalQa: CanonicalOutputQAResult;
  readonly policy?: Partial<CanonicalRepairPolicy>;
  readonly attemptNumber?: number;
  readonly qaContext?: OutputQAContext;
  readonly qaPolicy?: OutputQAPolicy;
  /** Already-loaded candidate data for DETERMINISTIC_NORMALIZATION (no lookup). */
  readonly candidateData?: Record<string, unknown>;
  readonly executionDeps?: ActionExecutionDeps;
};

export type CanonicalRepairPlan = {
  readonly eligible: boolean;
  readonly strategy?: RepairStrategy;
  readonly reason: string;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly originalQaCodes: readonly OutputQAErrorCode[];
  readonly repairInstruction?: string;
  readonly code?: RepairErrorCode;
};

export type CanonicalRepairAttemptRecord = {
  readonly attempt: number;
  readonly strategy: RepairStrategy;
  readonly repairExecutionId: string;
  readonly executionOk: boolean;
  readonly qaStatus: CanonicalOutputQAResult["status"];
  readonly qaCodes: readonly OutputQAErrorCode[];
};

export type CanonicalRepairResult = {
  readonly ok: boolean;
  readonly status:
    | "REPAIRED"
    | "UNCHANGED"
    | "FAILED"
    | "DISABLED"
    | "NOT_ELIGIBLE"
    | "EXHAUSTED";
  readonly code?: RepairErrorCode;
  readonly message: string;
  readonly actionId: string;
  readonly actionVersion: string;
  readonly originalExecutionId?: string;
  readonly originalQa: CanonicalOutputQAResult;
  readonly plan: CanonicalRepairPlan;
  readonly attempts: readonly CanonicalRepairAttemptRecord[];
  readonly finalExecutionResult?: ActionExecutionResult;
  readonly finalQa?: CanonicalOutputQAResult;
  readonly normalizedData?: Record<string, unknown>;
  readonly metadata: Readonly<Record<string, unknown>>;
};

export function isCanonicalAutomaticRepairEnvEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const v = env[CDF_CANONICAL_AUTOMATIC_REPAIR_ENV];
  return v === "1" || v === "true";
}
