/**
 * Execution Intelligence public interfaces.
 */

import type { Result } from "../../shared/result";
import type { ExecutionIntelligenceRequest } from "../contracts/request";
import type { ExecutionIntelligenceResult } from "../contracts/result";
import type { ExecutionStrategy, ExecutionMode, ExecutionHeuristic } from "../contracts/strategy";
import type { ContextOptimizationPlan } from "../contracts/context-optimization";
import type { KnowledgeOptimizationPlan } from "../contracts/knowledge-optimization";
import type { PromptOptimizationPlan } from "../contracts/prompt-optimization";
import type { ExecutionBudget, ExecutionCompressionPlan } from "../contracts/budget";
import type { ExecutionReasoningPlan } from "../contracts/reasoning";
import type { ExecutionDecompositionPlan } from "../contracts/reasoning";
import type { ExecutionPrediction, ExecutionQualityEstimate } from "../contracts/prediction";
import type { ExecutionRisk } from "../contracts/risk";
import type { ExecutionVerificationPlan } from "../contracts/verification";
import type { ProviderAdaptationHints } from "../contracts/provider-adaptation";
import type { ExecutionOptimizationReport } from "../contracts/optimization";

export interface IExecutionIntelligenceEngine {
  optimize(
    request: ExecutionIntelligenceRequest
  ): Promise<Result<ExecutionIntelligenceResult>>;
  explain(
    request: ExecutionIntelligenceRequest
  ): Promise<Result<readonly ExecutionHeuristic[]>>;
}

export interface IExecutionStrategyEngine {
  selectStrategy(
    request: ExecutionIntelligenceRequest,
    heuristics: readonly ExecutionHeuristic[]
  ): Result<ExecutionStrategy>;
  selectMode(
    request: ExecutionIntelligenceRequest,
    strategy: ExecutionStrategy
  ): Result<ExecutionMode>;
}

export interface IContextOptimizer {
  optimize(
    request: ExecutionIntelligenceRequest
  ): Result<ContextOptimizationPlan>;
}

export interface IKnowledgeOptimizer {
  optimize(
    request: ExecutionIntelligenceRequest
  ): Result<KnowledgeOptimizationPlan>;
}

export interface IPromptOptimizer {
  optimize(
    request: ExecutionIntelligenceRequest
  ): Result<PromptOptimizationPlan>;
}

export interface ITokenBudgetEngine {
  estimate(
    request: ExecutionIntelligenceRequest,
    contextPlan: ContextOptimizationPlan,
    knowledgePlan: KnowledgeOptimizationPlan,
    promptPlan: PromptOptimizationPlan
  ): Result<ExecutionBudget>;
}

export interface ICompressionEngine {
  plan(
    request: ExecutionIntelligenceRequest,
    budget: ExecutionBudget
  ): Result<ExecutionCompressionPlan>;
}

export interface IReasoningPlanner {
  plan(
    request: ExecutionIntelligenceRequest,
    strategy: ExecutionStrategy
  ): Result<ExecutionReasoningPlan>;
}

export interface IExecutionDecomposer {
  decompose(
    request: ExecutionIntelligenceRequest,
    strategy: ExecutionStrategy
  ): Result<ExecutionDecompositionPlan>;
}

export interface IQualityPredictionEngine {
  predict(
    request: ExecutionIntelligenceRequest,
    strategy: ExecutionStrategy,
    budget: ExecutionBudget
  ): Result<ExecutionPrediction>;
  estimateQuality(
    request: ExecutionIntelligenceRequest,
    strategy: ExecutionStrategy
  ): Result<ExecutionQualityEstimate>;
}

export interface IRiskAnalyzer {
  analyze(request: ExecutionIntelligenceRequest): Result<readonly ExecutionRisk[]>;
}

export interface IVerificationPlanner {
  plan(
    request: ExecutionIntelligenceRequest,
    strategy: ExecutionStrategy,
    quality: ExecutionQualityEstimate
  ): Result<ExecutionVerificationPlan>;
}

export interface IProviderAdaptationEngine {
  adapt(
    request: ExecutionIntelligenceRequest,
    strategy: ExecutionStrategy
  ): Result<ProviderAdaptationHints>;
}

export interface ICostOptimizer {
  optimize(
    request: ExecutionIntelligenceRequest,
    budget: ExecutionBudget
  ): Result<ExecutionBudget>;
}

export interface IBenchmarkEngine {
  benchmark(
    request: ExecutionIntelligenceRequest,
    result: ExecutionIntelligenceResult
  ): Result<Readonly<Record<string, number>>>;
}

export interface IHeuristicEngine {
  evaluate(request: ExecutionIntelligenceRequest): Result<readonly ExecutionHeuristic[]>;
}
