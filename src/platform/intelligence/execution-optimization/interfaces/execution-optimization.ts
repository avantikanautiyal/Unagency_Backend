/**
 * Execution Optimization public interfaces.
 */

import type { Result } from "../../shared/result";
import type { ExecutionOptimizationRequest } from "../contracts/request";
import type { ExecutionOptimizationResult } from "../contracts/result";
import type {
  OptimizationHeuristic,
  OptimizationRecommendation,
} from "../contracts/recommendation";
import type { OptimizationBenchmark, OptimizationExperiment } from "../contracts/benchmark";
import type { OptimizationSimulation } from "../contracts/simulation";
import type { OptimizationConfidence, OptimizationScore } from "../contracts/scoring";
import type { ExecutionPattern, ExecutionTrend } from "../contracts/patterns";
import type { ExecutionOptimizationInputs } from "../contracts/inputs";

export interface IExecutionOptimizationEngine {
  optimize(
    request: ExecutionOptimizationRequest
  ): Promise<Result<ExecutionOptimizationResult>>;
  explain(
    request: ExecutionOptimizationRequest
  ): Promise<Result<readonly OptimizationRecommendation[]>>;
}

export interface IFeedbackAnalyzer {
  analyze(inputs: ExecutionOptimizationInputs): Result<readonly ExecutionPattern[]>;
}

export interface IHeuristicLearner {
  learn(
    request: ExecutionOptimizationRequest,
    patterns: readonly ExecutionPattern[]
  ): Result<readonly OptimizationHeuristic[]>;
}

export interface IStrategyLearner {
  learn(
    request: ExecutionOptimizationRequest,
    patterns: readonly ExecutionPattern[]
  ): Result<readonly OptimizationRecommendation[]>;
}

export interface IProviderLearner {
  learn(
    request: ExecutionOptimizationRequest,
    patterns: readonly ExecutionPattern[]
  ): Result<readonly OptimizationRecommendation[]>;
}

export interface IPromptLearner {
  learn(
    request: ExecutionOptimizationRequest,
    patterns: readonly ExecutionPattern[]
  ): Result<readonly OptimizationRecommendation[]>;
}

export interface IContextLearner {
  learn(
    request: ExecutionOptimizationRequest,
    patterns: readonly ExecutionPattern[]
  ): Result<readonly OptimizationRecommendation[]>;
}

export interface IKnowledgeLearner {
  learn(
    request: ExecutionOptimizationRequest,
    patterns: readonly ExecutionPattern[]
  ): Result<readonly OptimizationRecommendation[]>;
}

export interface ITokenLearner {
  learn(
    request: ExecutionOptimizationRequest,
    patterns: readonly ExecutionPattern[]
  ): Result<readonly OptimizationRecommendation[]>;
}

export interface IQualityLearner {
  learn(
    request: ExecutionOptimizationRequest,
    patterns: readonly ExecutionPattern[]
  ): Result<readonly OptimizationRecommendation[]>;
}

export interface IRoutingLearner {
  learn(
    request: ExecutionOptimizationRequest,
    patterns: readonly ExecutionPattern[]
  ): Result<readonly OptimizationRecommendation[]>;
}

export interface IBenchmarkEngine {
  benchmark(
    request: ExecutionOptimizationRequest,
    recommendations: readonly OptimizationRecommendation[]
  ): Result<readonly OptimizationBenchmark[]>;
}

export interface IRecommendationEngine {
  prioritize(
    recommendations: readonly OptimizationRecommendation[],
    maxCount?: number
  ): Result<readonly OptimizationRecommendation[]>;
}

export interface ISimulationEngine {
  simulate(
    request: ExecutionOptimizationRequest,
    recommendations: readonly OptimizationRecommendation[]
  ): Result<readonly OptimizationSimulation[]>;
}

export interface IScoringEngine {
  score(
    request: ExecutionOptimizationRequest,
    recommendations: readonly OptimizationRecommendation[]
  ): Result<readonly OptimizationScore[]>;
}

export interface IConfidenceEngine {
  compute(
    request: ExecutionOptimizationRequest,
    scores: readonly OptimizationScore[],
    sampleSize: number
  ): Result<OptimizationConfidence>;
}

export interface ITrendAnalyzer {
  analyze(inputs: ExecutionOptimizationInputs): Result<readonly ExecutionTrend[]>;
}

export interface IExperimentProposer {
  propose(
    recommendations: readonly OptimizationRecommendation[]
  ): Result<readonly OptimizationExperiment[]>;
}
