/**
 * Dynamic adaptive evaluation contracts (additive).
 */

import type { ExecutionResult } from "../../execution-runtime/contracts/execution-result";
import type { CapabilityExecutionPlan } from "../../capability-intelligence/contracts/result";
import type { StructuredTaskPlan } from "../../task-intelligence/contracts/planning";
import type { WorkflowExecutionPlan } from "../../workflow-intelligence/contracts/plan";
import type { GovernanceExecutionPlan } from "../../execution-governance/contracts/plan";
import type { ExecutionExperiencePackage } from "../../experience-injection/contracts/package";
import type { KnowledgeSnapshot } from "../../knowledge/contracts/knowledge-models";
import type { ContextSnapshot } from "../../context/contracts/intelligence-context";
import type { ModelDecisionRecord } from "../../model-intelligence/contracts/decision-record";
import type { RoutingDecision } from "../../providers/routing/contracts/plan";
import type { ConsensusResult } from "../../provider-consensus/contracts/result";
import type { ProviderMeshSnapshot } from "../../provider-mesh/contracts/result";
import type { EvaluationReport, EvaluationResult, JudgeKind, ConfidenceLevel } from "./evaluation-models";
import type { EvaluationIdentity } from "./evaluation-models";

export type EvaluationRiskLevel = "low" | "medium" | "high" | "critical";
export type EvaluationObjectiveKind =
  | "quality"
  | "compliance"
  | "safety"
  | "creative"
  | "technical"
  | "mixed";

export type EvaluationPipelineFamily =
  | "marketing"
  | "software"
  | "healthcare"
  | "legal"
  | "finance"
  | "research"
  | "media"
  | "general";

export interface DynamicEvaluationContext {
  readonly capabilityHints?: readonly string[];
  readonly industryHint?: string;
  readonly departmentHint?: string;
  readonly workflowTypeHint?: string;
  readonly outputTypeHint?: string;
  readonly riskLevel?: EvaluationRiskLevel;
  readonly complexityHint?: string;
  readonly providerHint?: string;
  readonly modelHint?: string;
}

export interface DynamicEvaluationInputs {
  readonly executionResult: ExecutionResult;
  readonly capabilityPlan?: CapabilityExecutionPlan;
  readonly taskPlan?: StructuredTaskPlan;
  readonly workflowPlan?: WorkflowExecutionPlan;
  readonly governancePlan?: GovernanceExecutionPlan;
  readonly experiencePackage?: ExecutionExperiencePackage;
  readonly knowledgeSnapshot?: KnowledgeSnapshot;
  readonly contextSnapshot?: ContextSnapshot;
  readonly modelDecision?: ModelDecisionRecord;
  readonly routingDecision?: RoutingDecision;
  readonly consensusResult?: ConsensusResult;
  readonly meshSnapshot?: ProviderMeshSnapshot;
  readonly historicalReports?: readonly EvaluationReport[];
  readonly humanFeedback?: readonly string[];
  readonly context?: DynamicEvaluationContext;
}

export interface DynamicEvaluationRequest {
  readonly requestId: string;
  readonly identity: EvaluationIdentity;
  readonly inputs: DynamicEvaluationInputs;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface DynamicEvaluationStrategy {
  readonly strategyId: string;
  readonly objective: EvaluationObjectiveKind;
  readonly pipelineFamily: EvaluationPipelineFamily;
  readonly capability: string;
  readonly industry: string;
  readonly workflowType: string;
  readonly outputType: string;
  readonly riskLevel: EvaluationRiskLevel;
  readonly complianceLevel: string;
  readonly humanApprovalRequired: boolean;
  readonly historicalSuccessRate?: number;
  readonly experienceSignalCount: number;
  readonly benchmarkProfileId: string;
  readonly rationale: string;
  readonly version: string;
}

export interface JudgeSelectionEntry {
  readonly kind: JudgeKind;
  readonly pluginId: string;
  readonly reason: string;
  readonly priority: number;
}

export interface JudgeExecutionPlan {
  readonly planId: string;
  readonly selectedJudges: readonly JudgeSelectionEntry[];
  readonly humanReviewRequired: boolean;
  readonly rationale: string;
}

export interface JudgeWeightEntry {
  readonly kind: JudgeKind;
  readonly weight: number;
  readonly threshold: number;
  readonly required: boolean;
  readonly rationale: string;
}

export interface JudgeWeightProfile {
  readonly profileId: string;
  readonly entries: readonly JudgeWeightEntry[];
  readonly normalized: true;
  readonly rationale: string;
}

export interface EvidenceRequirement {
  readonly evidenceId: string;
  readonly description: string;
  readonly required: boolean;
  readonly sourceHint: string;
}

export interface EvidenceRequirements {
  readonly requirements: readonly EvidenceRequirement[];
  readonly rationale: string;
}

export interface BenchmarkProfile {
  readonly profileId: string;
  readonly capability?: string;
  readonly industry?: string;
  readonly department?: string;
  readonly complexity?: string;
  readonly risk?: EvaluationRiskLevel;
  readonly provider?: string;
  readonly model?: string;
  readonly version: string;
  readonly targetScore: number;
  readonly historicalSampleSize: number;
  readonly historicalMeanScore?: number;
}

export interface EvaluationConfidenceProfile {
  readonly expectedConfidence: ConfidenceLevel;
  readonly coverage: number;
  readonly rationale: string;
}

export interface EvaluationExplainabilityReport {
  readonly whyJudgesSelected: readonly string[];
  readonly whyWeightsChosen: readonly string[];
  readonly benchmarksUsed: readonly string[];
  readonly evidenceRequired: readonly string[];
  readonly experienceInfluence: readonly string[];
  readonly strategyRationale: string;
}

export type EvaluationLearningSignalKind =
  | "judge_performance"
  | "weight_effectiveness"
  | "benchmark_drift"
  | "human_override"
  | "risk_miss"
  | "coverage_gap";

export interface EvaluationLearningSignal {
  readonly signalId: string;
  readonly kind: EvaluationLearningSignalKind;
  readonly strength: number;
  readonly message: string;
  readonly relatedJudgeKind?: JudgeKind;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface DynamicEvaluationObservability {
  readonly judgeTimingsMs: Readonly<Record<string, number>>;
  readonly weights: Readonly<Record<string, number>>;
  readonly evidenceCount: number;
  readonly confidence: number;
  readonly coverage: number;
  readonly failures: readonly string[];
  readonly durationMs: number;
}

export interface DynamicEvaluationResult {
  readonly requestId: string;
  readonly strategy: DynamicEvaluationStrategy;
  readonly judgePlan: JudgeExecutionPlan;
  readonly weightProfile: JudgeWeightProfile;
  readonly evidence: EvidenceRequirements;
  readonly benchmark: BenchmarkProfile;
  readonly confidenceProfile: EvaluationConfidenceProfile;
  readonly evaluation: EvaluationResult;
  readonly explainability: EvaluationExplainabilityReport;
  readonly learningSignals: readonly EvaluationLearningSignal[];
  readonly experienceCandidates: readonly string[];
  readonly observability: DynamicEvaluationObservability;
  readonly createdAt: string;
}
