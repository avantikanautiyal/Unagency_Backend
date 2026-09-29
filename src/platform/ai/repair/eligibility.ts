/**
 * Phase 17 — Deterministic repair eligibility (no subjective scoring).
 */

import type { OutputQAErrorCode, CanonicalOutputQAResult } from "../output-qa";
import {
  DEFAULT_ELIGIBLE_REPAIR_CODES,
  DEFAULT_REPAIR_POLICY,
  NEVER_ELIGIBLE_REPAIR_CODES,
  type CanonicalRepairPlan,
  type CanonicalRepairPolicy,
  type RepairStrategy,
} from "./types";
import { isCanonicalAutomaticRepairEnvEnabled } from "./types";
import type { ActionDefinition } from "../action-registry";

export function mergeRepairPolicy(
  partial?: Partial<CanonicalRepairPolicy>,
): CanonicalRepairPolicy {
  return {
    ...DEFAULT_REPAIR_POLICY,
    ...partial,
    // Authority flags are always true — cannot be weakened.
    preserveUserInstruction: true,
    preserveRequirements: true,
    preserveReferences: true,
    preserveUpstreamArtifacts: true,
    preserveOutputContract: true,
    maxAttempts: Math.max(
      0,
      Math.min(3, partial?.maxAttempts ?? DEFAULT_REPAIR_POLICY.maxAttempts),
    ),
  };
}

export function collectQaErrorCodes(
  qa: CanonicalOutputQAResult,
): OutputQAErrorCode[] {
  return qa.diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => d.code);
}

export function isRepairEligibleCode(
  code: OutputQAErrorCode,
  eligible: readonly OutputQAErrorCode[],
): boolean {
  if (NEVER_ELIGIBLE_REPAIR_CODES.includes(code)) return false;
  return eligible.includes(code);
}

export function selectRepairStrategy(
  codes: readonly OutputQAErrorCode[],
  action: ActionDefinition,
  policy: CanonicalRepairPolicy,
  hasCandidateData: boolean,
): RepairStrategy | undefined {
  const eligibleCodes = codes.filter((c) =>
    isRepairEligibleCode(
      c,
      policy.eligibleErrorCodes ?? DEFAULT_ELIGIBLE_REPAIR_CODES,
    ),
  );
  if (eligibleCodes.length === 0) return undefined;

  if (
    policy.allowDeterministicNormalization &&
    hasCandidateData &&
    eligibleCodes.some(
      (c) =>
        c === "OUTPUT_SCHEMA_INVALID" ||
        c === "REQUIRED_FIELD_MISSING" ||
        c === "STRUCTURED_OUTPUT_LOSS",
    )
  ) {
    return "DETERMINISTIC_NORMALIZATION";
  }

  if (
    action.executionMode === "MODEL_GENERATION" &&
    policy.allowStructuredOutputRepair &&
    eligibleCodes.some(
      (c) =>
        c === "OUTPUT_SCHEMA_INVALID" ||
        c === "REQUIRED_FIELD_MISSING" ||
        c === "STRUCTURED_OUTPUT_LOSS" ||
        c === "FREE_TEXT_FALLBACK" ||
        c === "OUTPUT_KIND_MISMATCH" ||
        c === "OUTPUT_MISSING",
    )
  ) {
    return "STRUCTURED_OUTPUT_REPAIR";
  }

  if (
    action.executionMode === "MODEL_GENERATION" &&
    policy.allowContractRegeneration
  ) {
    return "CONTRACT_REGENERATION";
  }

  return undefined;
}

export function planCanonicalRepair(input: {
  readonly action: ActionDefinition;
  readonly qa: CanonicalOutputQAResult;
  readonly policy: CanonicalRepairPolicy;
  readonly attempt: number;
  readonly hasCandidateData: boolean;
}): CanonicalRepairPlan {
  const { action, qa, policy, attempt, hasCandidateData } = input;
  const codes = collectQaErrorCodes(qa);

  if (!policy.enabled || !isCanonicalAutomaticRepairEnvEnabled()) {
    return {
      eligible: false,
      reason: "Repair disabled (policy or CDF_CANONICAL_AUTOMATIC_REPAIR OFF)",
      attempt,
      maxAttempts: policy.maxAttempts,
      originalQaCodes: codes,
      code: "REPAIR_DISABLED",
    };
  }

  if (qa.status === "VALID") {
    return {
      eligible: false,
      reason: "QA VALID — repair not needed",
      attempt,
      maxAttempts: policy.maxAttempts,
      originalQaCodes: codes,
      code: "REPAIR_NOT_ELIGIBLE",
    };
  }

  if (qa.status === "UNSUPPORTED") {
    return {
      eligible: false,
      reason: "UNSUPPORTED QA must not be repaired into VALID",
      attempt,
      maxAttempts: policy.maxAttempts,
      originalQaCodes: codes,
      code: "REPAIR_NOT_ELIGIBLE",
    };
  }

  if (attempt > policy.maxAttempts) {
    return {
      eligible: false,
      reason: "Repair attempts exhausted",
      attempt,
      maxAttempts: policy.maxAttempts,
      originalQaCodes: codes,
      code: "REPAIR_ATTEMPTS_EXHAUSTED",
    };
  }

  if (action.metadata.artifactContinuityComplete === false) {
    const onlyClassD =
      codes.length > 0 &&
      codes.every((c) => c === "UNSUPPORTED_VALIDATION");
    if (onlyClassD || codes.includes("UNSUPPORTED_VALIDATION")) {
      return {
        eligible: false,
        reason: "Class-D / UNSUPPORTED_VALIDATION cannot be repaired to VALID",
        attempt,
        maxAttempts: policy.maxAttempts,
        originalQaCodes: codes,
        code: "REPAIR_NOT_ELIGIBLE",
      };
    }
  }

  const eligibleList = policy.eligibleErrorCodes ?? DEFAULT_ELIGIBLE_REPAIR_CODES;
  const hasEligible = codes.some((c) => isRepairEligibleCode(c, eligibleList));
  const hasBlocking = codes.some((c) => NEVER_ELIGIBLE_REPAIR_CODES.includes(c));

  if (hasBlocking && !hasEligible) {
    return {
      eligible: false,
      reason: "QA failure codes are not repair-eligible",
      attempt,
      maxAttempts: policy.maxAttempts,
      originalQaCodes: codes,
      code: "REPAIR_NOT_ELIGIBLE",
    };
  }

  // Mixed: if any never-eligible security/identity codes present, refuse
  if (hasBlocking) {
    return {
      eligible: false,
      reason: "Contains non-repairable identity/authority failure",
      attempt,
      maxAttempts: policy.maxAttempts,
      originalQaCodes: codes,
      code: "REPAIR_UNSAFE",
    };
  }

  if (!hasEligible) {
    return {
      eligible: false,
      reason: "No eligible QA error codes",
      attempt,
      maxAttempts: policy.maxAttempts,
      originalQaCodes: codes,
      code: "REPAIR_NOT_ELIGIBLE",
    };
  }

  const strategy = selectRepairStrategy(
    codes,
    action,
    policy,
    hasCandidateData,
  );
  if (!strategy) {
    return {
      eligible: false,
      reason: "No supported repair strategy for this action/mode",
      attempt,
      maxAttempts: policy.maxAttempts,
      originalQaCodes: codes,
      code: "REPAIR_NOT_SUPPORTED",
    };
  }

  const repairInstruction = buildRepairInstruction(codes, action);

  return {
    eligible: true,
    strategy,
    reason: `Eligible for ${strategy}`,
    attempt,
    maxAttempts: policy.maxAttempts,
    originalQaCodes: codes,
    repairInstruction,
  };
}

function buildRepairInstruction(
  codes: readonly OutputQAErrorCode[],
  action: ActionDefinition,
): string {
  const codeList = codes.join(", ");
  const contract = action.outputContract.kind;
  const key = action.outputContract.artifactKey
    ? ` artifactKey=${action.outputContract.artifactKey}`
    : "";
  return (
    `Previous output failed Output QA (${codeList}). ` +
    `Regenerate to satisfy the existing output contract (${contract}${key}) ` +
    `without changing the current user instruction, approved requirements, ` +
    `resolved references, or exact upstream ArtifactVersions.`
  );
}
