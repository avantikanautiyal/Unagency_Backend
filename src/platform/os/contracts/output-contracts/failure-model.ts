/**
 * Output contract failure classification.
 */

import type { RequirementSeverity } from "./evaluation-methods";

export type FailureCategory =
  | "missing_requirement"
  | "invalid_output_format"
  | "functional_failure"
  | "technical_failure"
  | "quality_failure"
  | "industry_mismatch"
  | "brand_mismatch"
  | "user_requirement_violation"
  | "critical_validation_failure";

export type ContractFailureCondition = {
  readonly id: string;
  readonly category: FailureCategory;
  readonly severity: RequirementSeverity;
  readonly description: string;
  readonly blocksCompletion: boolean;
  readonly relatedRequirementIds?: readonly string[];
};

export const STANDARD_FAILURE_CONDITIONS: readonly ContractFailureCondition[] =
  Object.freeze([
    {
      id: "fail.missing_deliverable",
      category: "missing_requirement",
      severity: "critical",
      description: "Required primary deliverable artifact is absent",
      blocksCompletion: true,
    },
    {
      id: "fail.invalid_format",
      category: "invalid_output_format",
      severity: "critical",
      description: "Deliverable format does not match contracted output kind",
      blocksCompletion: true,
    },
    {
      id: "fail.functional",
      category: "functional_failure",
      severity: "critical",
      description: "Required functionality does not work as contracted",
      blocksCompletion: true,
    },
    {
      id: "fail.build",
      category: "technical_failure",
      severity: "critical",
      description: "Build or compilation failed for code/project deliverables",
      blocksCompletion: true,
    },
    {
      id: "fail.quality_below_threshold",
      category: "quality_failure",
      severity: "high",
      description: "One or more quality dimensions scored below acceptance threshold",
      blocksCompletion: false,
    },
    {
      id: "fail.industry_mismatch",
      category: "industry_mismatch",
      severity: "medium",
      description: "Output does not meet industry overlay requirements",
      blocksCompletion: false,
    },
    {
      id: "fail.brand_mismatch",
      category: "brand_mismatch",
      severity: "high",
      description: "Output violates brand requirements (colors, voice, prohibited terms)",
      blocksCompletion: false,
    },
    {
      id: "fail.user_requirement",
      category: "user_requirement_violation",
      severity: "high",
      description: "Output violates explicit user brief or task constraints",
      blocksCompletion: false,
    },
    {
      id: "fail.critical_validation",
      category: "critical_validation_failure",
      severity: "critical",
      description: "Deterministic validation failed on a hard requirement",
      blocksCompletion: true,
    },
    {
      id: "fail.mockup_role_violation",
      category: "invalid_output_format",
      severity: "critical",
      description: "Mockup replaced primary production deliverable when prohibited",
      blocksCompletion: true,
      relatedRequirementIds: ["hard.mockup_role_consistency"],
    },
    {
      id: "fail.unresolved_modality",
      category: "missing_requirement",
      severity: "critical",
      description: "Dynamic service output type could not be resolved before execution",
      blocksCompletion: true,
      relatedRequirementIds: ["hard.dynamic_modality_resolved"],
    },
  ]);
