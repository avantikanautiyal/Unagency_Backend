/**
 * Execution Intelligence result contracts.
 */

import type { ExecutionIntelligenceResultId, ExecutionSnapshotId } from "./identifiers";
import type { ExecutionBudget, ExecutionCompressionPlan } from "./budget";
import type { ContextOptimizationPlan } from "./context-optimization";
import type { KnowledgeOptimizationPlan } from "./knowledge-optimization";
import type { PromptOptimizationPlan } from "./prompt-optimization";
import type { ExecutionOptimizationReport } from "./optimization";
import type { ExecutionPrediction } from "./prediction";
import type { ExecutionRisk } from "./risk";
import type { ExecutionDecompositionPlan, ExecutionReasoningPlan } from "./reasoning";
import type { ExecutionMode, ExecutionStrategy } from "./strategy";
import type { ProviderAdaptationHints } from "./provider-adaptation";
import type { ExecutionVerificationPlan } from "./verification";

export interface ExecutionSnapshot {
  readonly snapshotId: ExecutionSnapshotId;
  readonly requestId: string;
  readonly capturedAt: string;
  readonly strategy: ExecutionStrategy;
  readonly mode: ExecutionMode;
  readonly budget: ExecutionBudget;
  readonly prediction: ExecutionPrediction;
}

export interface ExecutionIntelligenceResult {
  readonly resultId: ExecutionIntelligenceResultId;
  readonly requestId: string;
  readonly strategy: ExecutionStrategy;
  readonly mode: ExecutionMode;
  readonly contextPlan: ContextOptimizationPlan;
  readonly knowledgePlan: KnowledgeOptimizationPlan;
  readonly promptPlan: PromptOptimizationPlan;
  readonly providerHints: ProviderAdaptationHints;
  readonly budget: ExecutionBudget;
  readonly compressionPlan: ExecutionCompressionPlan;
  readonly reasoningPlan: ExecutionReasoningPlan;
  readonly decompositionPlan: ExecutionDecompositionPlan;
  readonly prediction: ExecutionPrediction;
  readonly risks: readonly ExecutionRisk[];
  readonly verificationPlan: ExecutionVerificationPlan;
  readonly optimizationReport: ExecutionOptimizationReport;
  readonly snapshot: ExecutionSnapshot;
  readonly createdAt: string;
  readonly durationMs: number;
}
