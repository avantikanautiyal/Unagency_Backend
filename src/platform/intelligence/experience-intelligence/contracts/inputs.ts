/**
 * Experience Intelligence inputs — reuses frozen platform contracts.
 */

import type { EvaluationReport, ConfidenceReport, ReviewDecision } from "../../evaluation/contracts/evaluation-models";
import type { LearningResult } from "../../learning/contracts/learning-models";
import type { ExecutionOptimizationResult } from "../../execution-optimization/contracts/result";
import type { ExecutionArtifact, WorkflowArtifact, HumanArtifact } from "../../artifacts/contracts/typed-artifacts";
import type { ArtifactSnapshot } from "../../artifacts/contracts/artifact-models";
import type { TaskArtifact } from "../../control-plane/contracts/artifacts";
import type { PromptMetadata, ProviderObservabilityReport } from "../../execution-optimization/contracts/inputs";
import type { CompiledPrompt } from "../../prompt-compiler/contracts/prompt-models";
import type { KnowledgeSnapshot } from "../../knowledge/contracts/knowledge-models";
import type { MemorySnapshot } from "../../memory/contracts/memory-models";
import type { ModelDecisionRecord } from "../../model-intelligence/contracts/decision-record";
import type { RoutingDecision } from "../../providers/routing/contracts/plan";
import type { ExecutionMetadata } from "../../execution-planning/contracts/execution-metadata";

export interface ExperienceIntelligenceInputs {
  readonly evaluationReports?: readonly EvaluationReport[];
  readonly confidenceReports?: readonly ConfidenceReport[];
  readonly reviewDecisions?: readonly ReviewDecision[];
  readonly learningResults?: readonly LearningResult[];
  readonly optimizationResults?: readonly ExecutionOptimizationResult[];
  readonly executionArtifacts?: readonly ExecutionArtifact[];
  readonly artifactSnapshots?: readonly ArtifactSnapshot[];
  readonly workflowArtifacts?: readonly WorkflowArtifact[];
  readonly taskArtifacts?: readonly TaskArtifact[];
  readonly promptMetadata?: readonly PromptMetadata[];
  readonly compiledPrompts?: readonly CompiledPrompt[];
  readonly knowledgeSnapshots?: readonly KnowledgeSnapshot[];
  readonly memorySnapshots?: readonly MemorySnapshot[];
  readonly modelDecisionRecords?: readonly ModelDecisionRecord[];
  readonly routingDecisions?: readonly RoutingDecision[];
  readonly executionMetadata?: readonly ExecutionMetadata[];
  readonly observabilityReports?: readonly ProviderObservabilityReport[];
  readonly humanArtifacts?: readonly HumanArtifact[];
}
