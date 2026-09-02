/**
 * Evaluation methods for output contract requirements.
 * Prefer deterministic checks over LLM/semantic evaluators.
 */

export type EvaluationMethod =
  | "deterministic_validation"
  | "artifact_inspection"
  | "schema_validation"
  | "build_test_execution"
  | "static_analysis"
  | "runtime_validation"
  | "accessibility_tooling"
  | "performance_tooling"
  | "semantic_evaluator"
  | "visual_evaluator"
  | "human_approval"
  | "not_yet_automated";

export type RequirementSeverity = "critical" | "high" | "medium" | "low";

export type RequirementClass = "hard" | "quality";

export type RequirementEvaluationSpec = {
  readonly method: EvaluationMethod;
  readonly expectedResult: string;
  readonly threshold?: number;
  readonly severity: RequirementSeverity;
  /** When true, failure blocks completion regardless of aggregate quality score. */
  readonly blocksCompletion: boolean;
};

export type ContractRequirement = {
  readonly id: string;
  readonly class: RequirementClass;
  readonly category: RequirementCategory;
  readonly description: string;
  readonly evaluation: RequirementEvaluationSpec;
  /** Optional = advisory; required = must pass for hard requirements. */
  readonly optional?: boolean;
};

export type RequirementCategory =
  | "deliverable"
  | "structure"
  | "content"
  | "functionality"
  | "technical"
  | "visual"
  | "ux"
  | "accessibility"
  | "seo"
  | "performance"
  | "security"
  | "brand"
  | "industry"
  | "user_task"
  | "delivery"
  | "format";

export type QualityDimension = {
  readonly id: string;
  readonly label: string;
  readonly definition: string;
  readonly scoringRange: { readonly min: number; readonly max: number };
  readonly evaluationMethod: EvaluationMethod;
  readonly threshold: number;
  readonly weight?: number;
};
