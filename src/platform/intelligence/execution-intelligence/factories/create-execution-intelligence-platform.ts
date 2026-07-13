/**
 * Execution Intelligence platform factory.
 */

import { DefaultBenchmarkEngine } from "../benchmarking/default-benchmark-engine";
import { DefaultCompressionEngine } from "../compression/default-compression-engine";
import { DefaultContextOptimizer } from "../context/default-context-optimizer";
import { DefaultCostOptimizer } from "../cost/default-cost-optimizer";
import { DefaultExecutionDecomposer } from "../decomposition/default-decomposer";
import { ExecutionIntelligenceEngine } from "../engine/execution-intelligence-engine";
import { DefaultHeuristicEngine } from "../heuristics/default-heuristic-engine";
import { DefaultKnowledgeOptimizer } from "../knowledge/default-knowledge-optimizer";
import { DefaultPromptOptimizer } from "../prompt/default-prompt-optimizer";
import { DefaultProviderAdaptationEngine } from "../provider-adaptation/default-provider-adaptation-engine";
import { DefaultQualityPredictionEngine } from "../quality-prediction/default-quality-prediction-engine";
import { DefaultReasoningPlanner } from "../reasoning/default-reasoning-planner";
import { DefaultRiskAnalyzer } from "../risk/default-risk-analyzer";
import { DefaultExecutionStrategyEngine } from "../strategy/default-strategy-engine";
import { DefaultTokenBudgetEngine } from "../token-budget/default-token-budget-engine";
import { DefaultVerificationPlanner } from "../verification/default-verification-planner";
import type {
  IBenchmarkEngine,
  IExecutionIntelligenceEngine,
} from "../interfaces/execution-intelligence";

export interface ExecutionIntelligencePlatform {
  readonly engine: IExecutionIntelligenceEngine;
  readonly benchmark: IBenchmarkEngine;
}

export interface CreateExecutionIntelligencePlatformOptions {
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export function createExecutionIntelligencePlatform(
  options: CreateExecutionIntelligencePlatformOptions = {}
): ExecutionIntelligencePlatform {
  const benchmark = new DefaultBenchmarkEngine();

  const engine = new ExecutionIntelligenceEngine({
    heuristics: new DefaultHeuristicEngine(),
    strategy: new DefaultExecutionStrategyEngine(),
    contextOptimizer: new DefaultContextOptimizer(),
    knowledgeOptimizer: new DefaultKnowledgeOptimizer(),
    promptOptimizer: new DefaultPromptOptimizer(),
    tokenBudget: new DefaultTokenBudgetEngine(),
    compression: new DefaultCompressionEngine(),
    reasoning: new DefaultReasoningPlanner(),
    decomposer: new DefaultExecutionDecomposer(),
    qualityPrediction: new DefaultQualityPredictionEngine(),
    riskAnalyzer: new DefaultRiskAnalyzer(),
    verification: new DefaultVerificationPlanner(),
    providerAdaptation: new DefaultProviderAdaptationEngine(),
    costOptimizer: new DefaultCostOptimizer(),
    benchmark,
    nowIso: options.nowIso,
    clockMs: options.clockMs,
    createId: options.createId,
  });

  return { engine, benchmark };
}
