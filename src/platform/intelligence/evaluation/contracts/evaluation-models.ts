/**
 * Intelligence Evaluation Platform immutable contracts.
 * Provider-independent — no AI execution, learning, or human review.
 */

import type { ExecutionResult } from "../../execution-runtime/contracts/execution-result";
import type { MemorySnapshot } from "../../memory/contracts/memory-models";
import type { CompiledPrompt } from "../../prompt-compiler/contracts/prompt-models";
import type {
  CapabilityId,
  ExecutionId,
  OrganizationId,
  UserId,
  WorkspaceId,
} from "../../shared/identifiers";

export type JudgeKind =
  | "instruction"
  | "brand"
  | "policy"
  | "schema"
  | "grammar"
  | "safety"
  | "factual"
  | "hallucination"
  | "human"
  /** Additive dynamic-evaluation judge kinds (plugins). */
  | "seo"
  | "accessibility"
  | "code_quality"
  | "architecture"
  | "performance"
  | "security"
  | "legal"
  | "finance"
  | "medical"
  | "research"
  | "reasoning"
  | "image_quality"
  | "video_quality"
  | "audio_quality"
  | "marketing"
  | "social_media"
  | "creative"
  | "ux"
  | "testing"
  | "maintainability"
  | "compliance";

export type ReviewDisposition = "mandatory" | "recommended" | "optional" | "skip";

export type ConfidenceLevel = "low" | "medium" | "high" | "very_high";

export interface EvaluationIdentity {
  readonly organizationId: OrganizationId;
  readonly workspaceId: WorkspaceId;
  readonly userId?: UserId;
  readonly capabilityId?: CapabilityId;
  readonly executionId: ExecutionId;
  readonly correlationId?: string;
}

export interface EvaluationFinding {
  readonly id: string;
  readonly criterionId: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly path?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface EvaluationCriterion {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly kind: JudgeKind;
  readonly weight: number;
  readonly threshold: number;
  readonly required: boolean;
}

export interface EvaluationRubric {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly criteria: readonly EvaluationCriterion[];
  readonly passingScore: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface EvaluationRequest {
  readonly requestId: string;
  readonly identity: EvaluationIdentity;
  readonly executionResult: ExecutionResult;
  readonly compiledPrompt?: CompiledPrompt;
  readonly memorySnapshot?: MemorySnapshot;
  readonly rubricId?: string;
  readonly rubric?: EvaluationRubric;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface JudgeScore {
  readonly criterionId: string;
  readonly criterionName: string;
  readonly rawScore: number;
  readonly normalizedScore: number;
  readonly weight: number;
  readonly weightedScore: number;
  readonly threshold: number;
  readonly passed: boolean;
  readonly notes?: string;
}

export interface JudgeResult {
  readonly judgeId: string;
  readonly kind: JudgeKind;
  readonly scores: readonly JudgeScore[];
  readonly aggregateScore: number;
  readonly passed: boolean;
  readonly findings: readonly EvaluationFinding[];
  readonly evaluatedAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface EvaluationSummary {
  readonly overallScore: number;
  readonly passingScore: number;
  readonly passed: boolean;
  readonly judgeCount: number;
  readonly passedJudgeCount: number;
  readonly failedCriteria: readonly string[];
  readonly highlights: readonly string[];
}

export interface EvaluationReport {
  readonly reportId: string;
  readonly requestId: string;
  readonly identity: EvaluationIdentity;
  readonly rubric: EvaluationRubric;
  readonly judgeResults: readonly JudgeResult[];
  readonly summary: EvaluationSummary;
  readonly generatedAt: string;
  readonly checksum?: string;
}

export interface ConfidenceFactor {
  readonly id: string;
  readonly name: string;
  readonly weight: number;
  readonly score: number;
  readonly contribution: number;
  readonly rationale?: string;
}

export interface ConfidenceReport {
  readonly reportId: string;
  readonly evaluationReportId: string;
  readonly confidenceScore: number;
  readonly confidenceLevel: ConfidenceLevel;
  readonly factors: readonly ConfidenceFactor[];
  readonly generatedAt: string;
}

export interface ReviewDecision {
  readonly decisionId: string;
  readonly evaluationReportId: string;
  readonly confidenceReportId: string;
  readonly disposition: ReviewDisposition;
  readonly rationale: string;
  readonly triggers: readonly string[];
  readonly decidedAt: string;
}

export interface EvaluationResult {
  readonly report: EvaluationReport;
  readonly confidence: ConfidenceReport;
  readonly review: ReviewDecision;
}
