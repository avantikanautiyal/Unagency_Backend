/**
 * Step 2 — Canonical validation result model.
 * Extends evaluation contracts; does not duplicate EvaluationResult.
 */

import type { RequirementSeverity } from "../../contracts/output-contracts/evaluation-methods";
import type { FailureCategory } from "../../contracts/output-contracts/failure-model";

export const OUTPUT_VALIDATION_VERSION = "1.0.0" as const;
export const OUTPUT_VALIDATOR_RUNTIME_VERSION = "step2.1" as const;

/** Explicit requirement validation status — never silently pass. */
export type RequirementValidationStatus =
  | "PASS"
  | "FAIL"
  | "UNVERIFIED"
  | "NOT_AUTOMATED";

/** Quality gate status for completion decisions. */
export type ValidationGateStatus =
  | "PASS"
  | "NEEDS_REVISION"
  | "FAIL"
  | "BLOCKED";

export type RequirementValidationResult = {
  readonly requirementId: string;
  readonly category: string;
  readonly description: string;
  readonly evaluationMethod: string;
  readonly status: RequirementValidationStatus;
  readonly actualValue?: string;
  readonly expectedValue: string;
  readonly score?: number;
  readonly threshold?: number;
  readonly severity: RequirementSeverity;
  readonly blocksCompletion: boolean;
  /** Propagated from ContractRequirement.optional — advisory requirements do not block the gate. */
  readonly optional?: boolean;
  readonly evidence: readonly string[];
  readonly validatorVersion: string;
  readonly durationMs?: number;
  readonly repairGuidance?: string;
  readonly failureCategory?: FailureCategory;
};

export type QualityDimensionValidationResult = {
  readonly dimensionId: string;
  readonly label: string;
  readonly score: number;
  readonly threshold: number;
  readonly weight: number;
  readonly weightedContribution: number;
  readonly status: RequirementValidationStatus;
  readonly evidence: readonly string[];
  readonly evaluatorVersion: string;
  readonly evaluationMethod: string;
};

export type HardRequirementSummary = {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly unverified: number;
  readonly notAutomated: number;
  readonly criticalFailed: number;
  readonly blocksCompletion: boolean;
};

export type QualitySummary = {
  readonly totalDimensions: number;
  readonly evaluated: number;
  readonly unverified: number;
  readonly overallScore: number;
  readonly thresholdMet: boolean;
  readonly belowThresholdIds: readonly string[];
};

export type FailureSummary = {
  readonly failures: readonly {
    readonly requirementId: string;
    readonly failureCategory: FailureCategory;
    readonly severity: RequirementSeverity;
    readonly expected: string;
    readonly actual?: string;
    readonly evidence: readonly string[];
    readonly repairGuidance?: string;
  }[];
};

export type ValidationProvenanceEntry = {
  readonly field: string;
  readonly value: string;
  readonly source: "CONTRACT" | "ARTIFACT" | "VALIDATOR" | "SYSTEM";
};

export type OutputValidationResult = {
  readonly validationId: string;
  readonly version: typeof OUTPUT_VALIDATION_VERSION;
  readonly executionId: string;
  readonly organizationId: string;
  readonly contractId: string;
  readonly contractVersion: string;
  readonly effectiveContractId?: string;
  readonly status: ValidationGateStatus;
  readonly requirements: readonly RequirementValidationResult[];
  readonly qualityDimensions: readonly QualityDimensionValidationResult[];
  readonly hardRequirementSummary: HardRequirementSummary;
  readonly qualitySummary: QualitySummary;
  readonly failureSummary: FailureSummary;
  readonly definitionOfDone: readonly {
    readonly checkId: string;
    readonly status: RequirementValidationStatus;
    readonly evidence: readonly string[];
  }[];
  readonly overallScore: number;
  readonly completionAllowed: boolean;
  readonly validatedAt: string;
  readonly validatorVersion: typeof OUTPUT_VALIDATOR_RUNTIME_VERSION;
  readonly provenance: readonly ValidationProvenanceEntry[];
  readonly durationMs: number;
};

export type RepairInfo = {
  readonly requirementId: string;
  readonly failureCategory: FailureCategory;
  readonly severity: RequirementSeverity;
  readonly expected: string;
  readonly actual?: string;
  readonly evidence: readonly string[];
  readonly repairGuidance: string;
};
