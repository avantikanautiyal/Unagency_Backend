/**
 * Input contracts — consume immutable outputs from frozen platforms only.
 */

import type { ArtifactSnapshot } from "../../artifacts/contracts/artifact-models";
import type { EvaluationReport } from "../../evaluation/contracts/evaluation-models";
import type { ExecutionIntelligenceResult } from "../../execution-intelligence/contracts/result";
import type { LearningResult } from "../../learning/contracts/learning-models";
import type { MemorySnapshot } from "../../memory/contracts/memory-models";
import type { KnowledgeSnapshot } from "../../knowledge/contracts/knowledge-models";
import type { CapabilityId } from "../../shared/identifiers";

/** Local observability input contract (advisory consumption shape). */
export interface ProviderObservabilityReport {
  readonly reportId: string;
  readonly providerId: string;
  readonly capabilityId?: CapabilityId;
  readonly latencyMs: number;
  readonly cost: number;
  readonly successRate: number;
  readonly errorRate: number;
  readonly qualityScore: number;
  readonly observedAt: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface PromptMetadata {
  readonly templateId: string;
  readonly templateVersion: string;
  readonly sectionCount: number;
  readonly constraintCount: number;
  readonly variableCount: number;
  readonly checksum?: string;
}

export interface ExecutionOptimizationInputs {
  readonly executionArtifacts?: readonly ArtifactSnapshot[];
  readonly evaluationReports?: readonly EvaluationReport[];
  readonly learningResults?: readonly LearningResult[];
  readonly observabilityReports?: readonly ProviderObservabilityReport[];
  readonly intelligenceResults?: readonly ExecutionIntelligenceResult[];
  readonly memorySnapshots?: readonly MemorySnapshot[];
  readonly knowledgeSnapshots?: readonly KnowledgeSnapshot[];
  readonly promptMetadata?: readonly PromptMetadata[];
}
