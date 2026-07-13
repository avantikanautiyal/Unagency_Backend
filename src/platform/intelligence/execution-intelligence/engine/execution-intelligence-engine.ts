/**
 * Execution Intelligence Engine.
 *
 * Purpose: Maximize output quality BEFORE any provider executes.
 * Never calls providers, SDKs, or routing engines.
 */

import { failure, success, type Result } from "../../shared/result";
import type { ExecutionHeuristic } from "../contracts/strategy";
import type { ExecutionIntelligenceRequest } from "../contracts/request";
import type { ExecutionIntelligenceResult } from "../contracts/result";
import {
  asExecutionIntelligenceResultId,
  asExecutionSnapshotId,
} from "../contracts/identifiers";
import { buildOptimizationReport } from "../optimization/optimization-report";
import { validateExecutionIntelligenceRequest } from "../validation/request-validator";
import type {
  IBenchmarkEngine,
  ICompressionEngine,
  IContextOptimizer,
  ICostOptimizer,
  IExecutionDecomposer,
  IExecutionIntelligenceEngine,
  IExecutionStrategyEngine,
  IHeuristicEngine,
  IKnowledgeOptimizer,
  IPromptOptimizer,
  IProviderAdaptationEngine,
  IQualityPredictionEngine,
  IReasoningPlanner,
  IRiskAnalyzer,
  ITokenBudgetEngine,
  IVerificationPlanner,
} from "../interfaces/execution-intelligence";

export interface ExecutionIntelligenceEngineDeps {
  readonly heuristics: IHeuristicEngine;
  readonly strategy: IExecutionStrategyEngine;
  readonly contextOptimizer: IContextOptimizer;
  readonly knowledgeOptimizer: IKnowledgeOptimizer;
  readonly promptOptimizer: IPromptOptimizer;
  readonly tokenBudget: ITokenBudgetEngine;
  readonly compression: ICompressionEngine;
  readonly reasoning: IReasoningPlanner;
  readonly decomposer: IExecutionDecomposer;
  readonly qualityPrediction: IQualityPredictionEngine;
  readonly riskAnalyzer: IRiskAnalyzer;
  readonly verification: IVerificationPlanner;
  readonly providerAdaptation: IProviderAdaptationEngine;
  readonly costOptimizer: ICostOptimizer;
  readonly benchmark?: IBenchmarkEngine;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export class ExecutionIntelligenceEngine implements IExecutionIntelligenceEngine {
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;
  private readonly createId: (prefix: string) => string;

  constructor(private readonly deps: ExecutionIntelligenceEngineDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
    this.createId = deps.createId ?? ((p) => `${p}_${Math.random().toString(36).slice(2)}`);
  }

  async optimize(
    request: ExecutionIntelligenceRequest
  ): Promise<Result<ExecutionIntelligenceResult>> {
    const start = this.clockMs();
    const invalid = validateExecutionIntelligenceRequest(request);
    if (invalid) return failure(invalid);

    const heuristicResult = this.deps.heuristics.evaluate(request);
    if (!heuristicResult.ok) return heuristicResult;
    const heuristicValues = heuristicResult.value;

    const strategyResult = this.deps.strategy.selectStrategy(request, heuristicValues);
    if (!strategyResult.ok) return strategyResult;
    const strategy = strategyResult.value;

    const modeResult = this.deps.strategy.selectMode(request, strategy);
    if (!modeResult.ok) return modeResult;
    const mode = modeResult.value;

    const contextPlan = this.deps.contextOptimizer.optimize(request);
    if (!contextPlan.ok) return contextPlan;

    const knowledgePlan = this.deps.knowledgeOptimizer.optimize(request);
    if (!knowledgePlan.ok) return knowledgePlan;

    const promptPlan = this.deps.promptOptimizer.optimize(request);
    if (!promptPlan.ok) return promptPlan;

    const budgetResult = this.deps.tokenBudget.estimate(
      request,
      contextPlan.value,
      knowledgePlan.value,
      promptPlan.value
    );
    if (!budgetResult.ok) return budgetResult;

    const costOptimized = this.deps.costOptimizer.optimize(request, budgetResult.value);
    if (!costOptimized.ok) return costOptimized;
    const budget = costOptimized.value;

    const compressionPlan = this.deps.compression.plan(request, budget);
    if (!compressionPlan.ok) return compressionPlan;

    const reasoningPlan = this.deps.reasoning.plan(request, strategy);
    if (!reasoningPlan.ok) return reasoningPlan;

    const decompositionPlan = this.deps.decomposer.decompose(request, strategy);
    if (!decompositionPlan.ok) return decompositionPlan;

    const qualityEstimate = this.deps.qualityPrediction.estimateQuality(request, strategy);
    if (!qualityEstimate.ok) return qualityEstimate;

    const verificationPlan = this.deps.verification.plan(
      request,
      strategy,
      qualityEstimate.value
    );
    if (!verificationPlan.ok) return verificationPlan;

    const prediction = this.deps.qualityPrediction.predict(request, strategy, budget);
    if (!prediction.ok) return prediction;

    const risks = this.deps.riskAnalyzer.analyze(request);
    if (!risks.ok) return risks;

    const providerHints = this.deps.providerAdaptation.adapt(request, strategy);
    if (!providerHints.ok) return providerHints;

    const optimizationReport = buildOptimizationReport(
      contextPlan.value,
      knowledgePlan.value,
      promptPlan.value
    );

    const resultId = asExecutionIntelligenceResultId(
      this.createId("exec_intel")
    );
    const snapshotId = asExecutionSnapshotId(this.createId("exec_snap"));
    const createdAt = this.nowIso();
    const durationMs = this.clockMs() - start;

    const snapshot = {
      snapshotId,
      requestId: request.requestId,
      capturedAt: createdAt,
      strategy,
      mode,
      budget,
      prediction: prediction.value,
    };

    const result: ExecutionIntelligenceResult = {
      resultId,
      requestId: request.requestId,
      strategy,
      mode,
      contextPlan: contextPlan.value,
      knowledgePlan: knowledgePlan.value,
      promptPlan: promptPlan.value,
      providerHints: providerHints.value,
      budget,
      compressionPlan: compressionPlan.value,
      reasoningPlan: reasoningPlan.value,
      decompositionPlan: decompositionPlan.value,
      prediction: prediction.value,
      risks: risks.value,
      verificationPlan: verificationPlan.value,
      optimizationReport,
      snapshot,
      createdAt,
      durationMs,
    };

    return success(result);
  }

  async explain(
    request: ExecutionIntelligenceRequest
  ): Promise<Result<readonly ExecutionHeuristic[]>> {
    const invalid = validateExecutionIntelligenceRequest(request);
    if (invalid) return failure(invalid);
    return this.deps.heuristics.evaluate(request);
  }
}
