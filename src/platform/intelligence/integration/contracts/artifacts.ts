/**
 * Accumulated pipeline artifacts — ownership remains with producer modules.
 * Integration only holds references; it does not reinterpret module logic.
 */

import type { TaskIntelligenceReport } from "../../task-intelligence/contracts/result";
import type { CapabilityIntelligenceReport } from "../../capability-intelligence/contracts/result";
import type { AgentPlanningReport } from "../../agent-planning/contracts/result";
import type { WorkflowIntelligenceReport } from "../../workflow-intelligence/contracts/result";
import type { GovernanceReport } from "../../execution-governance/contracts/result";
import type { ExperienceInjectionReport } from "../../experience-injection/contracts/result";
import type { ExecutionIntelligenceResult } from "../../execution-intelligence/contracts/result";
import type { ModelIntelligenceResult } from "../../model-intelligence/contracts/result";
import type { NegotiationResult } from "../../providers/negotiation/contracts/negotiation-result";
import type { RoutingDecision } from "../../providers/routing/contracts/plan";
import type { ProviderExecutionResult } from "../../providers/runtime/contracts/provider-execution-response";
import type { ConsensusReport } from "../../provider-consensus/contracts/result";
import type { EvaluationResult } from "../../evaluation/contracts/evaluation-models";
import type { LearningResult } from "../../learning/contracts/learning-models";
import type { ExecutionOptimizationResult } from "../../execution-optimization/contracts/result";
import type { ExperienceIntelligenceReport } from "../../experience-intelligence/contracts/result";

/** Evaluation Intelligence is fulfilled by the Evaluation module outputs (no separate module). */
export interface EvaluationIntelligencePackage {
  readonly evaluationResult: EvaluationResult;
  readonly readyForLearning: boolean;
  readonly notes: string;
}

export interface RepositoryUpdateSummary {
  readonly experiencesSaved: number;
  readonly repositoryCount: number;
  readonly snapshotId?: string;
  readonly memoryRecordsStored?: number;
  readonly knowledgeChunksIndexed?: number;
}

export interface IntegrationContextTrace {
  readonly contextSnapshotId?: string;
  readonly brandEnrichmentId?: string;
  readonly brandBrainVersion?: number;
  readonly knowledgeSnapshotId?: string;
  readonly promptCompilationId?: string;
  readonly promptVersion?: string;
}

export interface IntegrationArtifactBag {
  readonly task?: TaskIntelligenceReport;
  readonly capability?: CapabilityIntelligenceReport;
  readonly agentPlanning?: AgentPlanningReport;
  readonly workflow?: WorkflowIntelligenceReport;
  readonly governance?: GovernanceReport;
  readonly experienceInjection?: ExperienceInjectionReport;
  readonly executionIntelligence?: ExecutionIntelligenceResult;
  /** Safe context/prompt trace IDs — no raw prompts or private knowledge. */
  contextTrace?: IntegrationContextTrace;
  readonly modelIntelligence?: ModelIntelligenceResult;
  readonly negotiation?: NegotiationResult;
  readonly routing?: RoutingDecision;
  readonly runtime?: ProviderExecutionResult;
  readonly consensus?: ConsensusReport;
  readonly evaluation?: EvaluationResult;
  readonly evaluationIntelligence?: EvaluationIntelligencePackage;
  readonly learning?: LearningResult;
  readonly optimization?: ExecutionOptimizationResult;
  readonly experienceIntelligence?: ExperienceIntelligenceReport;
  readonly repositoryUpdates?: RepositoryUpdateSummary;
}
