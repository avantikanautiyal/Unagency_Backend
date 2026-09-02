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
  /** Track B3 — sum of 10 creative dimensions (0–100). */
  readonly creativeScoreTotal?: number;
  /** Track B3 — each dimension 0–10. */
  readonly creativeDimensionScores?: Readonly<Record<string, number>>;
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
  /** Track A Phase A3 — continuity-bound job. */
  readonly continuityBound?: boolean;
  readonly boundLogoAssetId?: string;
  readonly mediaOutputCount?: number;
  readonly capabilityId?: string;
  readonly isImageCapability?: boolean;
  /** Track B3 — product service hint for channel-fit scoring. */
  readonly service?: string;
  readonly territory?: string;
  /** Service-output contract fields for deterministic SpecGuard checks. */
  readonly outputKind?: string;
  readonly mockupRole?: string;
  readonly expectedModalities?: readonly string[];
  readonly actualModality?: string;
  readonly expectedAspectRatio?: string;
  readonly actualAspectRatio?: string;
  /** Step 2 — service output contract validation context. */
  readonly subtype?: string;
  readonly platform?: string;
  readonly format?: string;
  readonly industry?: string;
  readonly structuredData?: unknown;
  readonly mediaArtifactIds?: readonly string[];
  readonly buildSucceeded?: boolean;
  readonly buildOutput?: string;
  readonly runtimeErrors?: readonly string[];
  readonly nowIso?: () => string;
  readonly createId?: (prefix: string) => string;
}

export interface IEvaluator {
  readonly evaluatorId: string;
  readonly category: EvaluatorCategory;
  readonly evaluatorVersion: string;
  evaluate(input: EvaluateOutputInput): EvaluationResult;
}
