/**
 * Phase 6 — Evaluation contracts (findings, not governance authority).
 */

export const OS_EVALUATION_VERSION = "1.0.0" as const;
export const OS_EVALUATOR_RUNTIME_VERSION = "phase6.1" as const;

export type EvaluationOutcome =
  | "PASS"
  | "PASS_WITH_WARNINGS"
  | "RETRY_REQUIRED"
  | "HUMAN_REVIEW_REQUIRED"
  | "BLOCKED"
  | "REJECTED";

export type EvaluationSeverity = "info" | "warning" | "error" | "critical";

export type EvaluatorCategory =
  | "specification"
  | "brand"
  | "quality"
  | "safety"
  | "completeness"
  | "policy"
  | "custom";

export interface EvaluationScores {
  readonly overallScore?: number;
  readonly qualityScore?: number;
  readonly specComplianceScore?: number;
  readonly brandComplianceScore?: number;
  readonly riskScore?: number;
}

export interface EvaluationFinding {
  readonly code: string;
  readonly message: string;
  readonly severity: EvaluationSeverity;
  readonly field?: string;
}

export interface EvaluationResult {
  readonly evaluationId: string;
  readonly version: typeof OS_EVALUATION_VERSION;
  readonly organizationId: string;
  readonly executionId: string;
  readonly planId: string;
  readonly planVersion: number;
  readonly taskId?: string;
  readonly outputRefId?: string;
  readonly evaluatorId: string;
  readonly evaluatorType: EvaluatorCategory;
  readonly evaluatorVersion: string;
  readonly evaluatedAt: string;
  readonly outcome: EvaluationOutcome;
  readonly scores: EvaluationScores;
  readonly findings: readonly EvaluationFinding[];
  readonly severity: EvaluationSeverity;
  readonly confidence: number;
  readonly provenance: readonly {
    readonly field: string;
    readonly value: string;
    readonly source: "SYSTEM_RULE" | "BRAND" | "BRIEF" | "OUTPUT" | "POLICY";
  }[];
  readonly policyVersion?: string;
}

export interface EvaluateOutputInput {
  readonly organizationId: string;
  readonly executionId: string;
  readonly planId: string;
  readonly planVersion: number;
  readonly taskId?: string;
  readonly taskKey?: string;
  readonly taskType?: string;
  readonly objective?: string;
  readonly outputContractId: string;
  readonly outputRefId?: string;
  readonly preview: string;
  readonly briefObjective?: string;
  readonly brandTone?: string;
  readonly brandVoice?: string;
  readonly brandAvoidTerms?: readonly string[];
  readonly brandPreferredTerms?: readonly string[];
  readonly prohibitedPatterns?: readonly string[];
  readonly requiredSections?: readonly string[];
  readonly nowIso?: () => string;
  readonly createId?: (prefix: string) => string;
}

export interface IEvaluator {
  readonly evaluatorId: string;
  readonly category: EvaluatorCategory;
  readonly evaluatorVersion: string;
  evaluate(input: EvaluateOutputInput): EvaluationResult;
}
