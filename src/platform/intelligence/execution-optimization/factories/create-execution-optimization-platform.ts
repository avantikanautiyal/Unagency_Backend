/**
 * Execution Optimization platform factory.
 */

import { DefaultBenchmarkEngine } from "../benchmarking/default-benchmark-engine";
import { DefaultConfidenceEngine } from "../confidence/default-confidence-engine";
import { DefaultContextLearner } from "../context-learning/default-context-learner";
import { ExecutionOptimizationEngine } from "../engine/execution-optimization-engine";
import { DefaultExperimentProposer } from "../experiments/default-experiment-proposer";
import { DefaultFeedbackAnalyzer } from "../feedback/default-feedback-analyzer";
import { DefaultHeuristicLearner } from "../heuristics/default-heuristic-learner";
import { DefaultKnowledgeLearner } from "../knowledge-learning/default-knowledge-learner";
import { DefaultTrendAnalyzer } from "../optimizer/default-trend-analyzer";
import { DefaultPromptLearner } from "../prompt-learning/default-prompt-learner";
import { DefaultProviderLearner } from "../provider-learning/default-provider-learner";
import { DefaultQualityLearner } from "../quality-learning/default-quality-learner";
import { DefaultRecommendationEngine } from "../recommendations/default-recommendation-engine";
import { DefaultRoutingLearner } from "../routing-learning/default-routing-learner";
import { DefaultScoringEngine } from "../scoring/default-scoring-engine";
import { DefaultSimulationEngine } from "../simulation/default-simulation-engine";
import { DefaultStrategyLearner } from "../strategy-learning/default-strategy-learner";
import { DefaultTokenLearner } from "../token-learning/default-token-learner";
import type { IExecutionOptimizationEngine } from "../interfaces/execution-optimization";

export interface ExecutionOptimizationPlatform {
  readonly engine: IExecutionOptimizationEngine;
}

export interface CreateExecutionOptimizationPlatformOptions {
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export function createExecutionOptimizationPlatform(
  options: CreateExecutionOptimizationPlatformOptions = {}
): ExecutionOptimizationPlatform {
  const engine = new ExecutionOptimizationEngine({
    feedback: new DefaultFeedbackAnalyzer(),
    heuristics: new DefaultHeuristicLearner(),
    strategy: new DefaultStrategyLearner(),
    provider: new DefaultProviderLearner(),
    prompt: new DefaultPromptLearner(),
    context: new DefaultContextLearner(),
    knowledge: new DefaultKnowledgeLearner(),
    token: new DefaultTokenLearner(),
    quality: new DefaultQualityLearner(),
    routing: new DefaultRoutingLearner(),
    scoring: new DefaultScoringEngine(),
    confidence: new DefaultConfidenceEngine(),
    benchmark: new DefaultBenchmarkEngine(),
    simulation: new DefaultSimulationEngine(),
    recommendations: new DefaultRecommendationEngine(),
    trends: new DefaultTrendAnalyzer(),
    experiments: new DefaultExperimentProposer(),
    nowIso: options.nowIso,
    clockMs: options.clockMs,
    createId: options.createId,
  });

  return { engine };
}
