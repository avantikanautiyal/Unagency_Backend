/**
 * Execution Optimization Engine.
 *
 * Purpose: Learn from historical executions and generate advisory recommendations.
 * Never executes providers, mutates heuristics, or changes prompts directly.
 */

import { failure, success, type Result } from "../../shared/result";
import type { OptimizationRecommendation } from "../contracts/recommendation";
import type { ExecutionOptimizationRequest } from "../contracts/request";
import type { ExecutionOptimizationResult } from "../contracts/result";
import type { OptimizationBenchmark } from "../contracts/benchmark";
import type { OptimizationSimulation } from "../contracts/simulation";
import type { OptimizationStatistics } from "../contracts/statistics";
import {
  asExecutionOptimizationResultId,
  asOptimizationSnapshotId,
} from "../contracts/identifiers";
import { buildComparisons } from "../optimizer/comparison-builder";
import { inputSampleSize } from "../heuristics/learner-helpers";
import { validateExecutionOptimizationRequest } from "../validation/request-validator";
import type {
  IBenchmarkEngine,
  IConfidenceEngine,
  IContextLearner,
  IExecutionOptimizationEngine,
  IExperimentProposer,
  IFeedbackAnalyzer,
  IHeuristicLearner,
  IKnowledgeLearner,
  IProviderLearner,
  IPromptLearner,
  IQualityLearner,
  IRecommendationEngine,
  IRoutingLearner,
  IScoringEngine,
  ISimulationEngine,
  IStrategyLearner,
  ITokenLearner,
  ITrendAnalyzer,
} from "../interfaces/execution-optimization";

export interface ExecutionOptimizationEngineDeps {
  readonly feedback: IFeedbackAnalyzer;
  readonly heuristics: IHeuristicLearner;
  readonly strategy: IStrategyLearner;
  readonly provider: IProviderLearner;
  readonly prompt: IPromptLearner;
  readonly context: IContextLearner;
  readonly knowledge: IKnowledgeLearner;
  readonly token: ITokenLearner;
  readonly quality: IQualityLearner;
  readonly routing: IRoutingLearner;
  readonly scoring: IScoringEngine;
  readonly confidence: IConfidenceEngine;
  readonly benchmark: IBenchmarkEngine;
  readonly simulation: ISimulationEngine;
  readonly recommendations: IRecommendationEngine;
  readonly trends: ITrendAnalyzer;
  readonly experiments: IExperimentProposer;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export class ExecutionOptimizationEngine implements IExecutionOptimizationEngine {
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;
  private readonly createId: (prefix: string) => string;

  constructor(private readonly deps: ExecutionOptimizationEngineDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
    this.createId = deps.createId ?? ((p) => `${p}_${Math.random().toString(36).slice(2)}`);
  }

  async optimize(
    request: ExecutionOptimizationRequest
  ): Promise<Result<ExecutionOptimizationResult>> {
    const start = this.clockMs();
    const invalid = validateExecutionOptimizationRequest(request);
    if (invalid) return failure(invalid);

    const patterns = this.deps.feedback.analyze(request.inputs);
    if (!patterns.ok) return patterns;

    const learners: Result<readonly OptimizationRecommendation[]>[] = [
      this.deps.strategy.learn(request, patterns.value),
      this.deps.provider.learn(request, patterns.value),
      this.deps.prompt.learn(request, patterns.value),
      this.deps.context.learn(request, patterns.value),
      this.deps.knowledge.learn(request, patterns.value),
      this.deps.token.learn(request, patterns.value),
      this.deps.quality.learn(request, patterns.value),
      this.deps.routing.learn(request, patterns.value),
    ];

    const allRecs: OptimizationRecommendation[] = [];
    for (const lr of learners) {
      if (!lr.ok) return lr;
      allRecs.push(...lr.value);
    }

    const heuristicProposals = this.deps.heuristics.learn(request, patterns.value);
    if (!heuristicProposals.ok) return heuristicProposals;

    const maxRecs = request.preferences?.maxRecommendations ?? 20;
    const prioritized = this.deps.recommendations.prioritize(allRecs, maxRecs);
    if (!prioritized.ok) return prioritized;

    const scores = this.deps.scoring.score(request, prioritized.value);
    if (!scores.ok) return scores;

    const sampleSize = inputSampleSize(request);
    const confidence = this.deps.confidence.compute(request, scores.value, sampleSize);
    if (!confidence.ok) return confidence;

    const trends = this.deps.trends.analyze(request.inputs);
    if (!trends.ok) return trends;

    let benchmarks: readonly OptimizationBenchmark[] = [];
    if (request.preferences?.includeBenchmark !== false) {
      const bench = this.deps.benchmark.benchmark(request, prioritized.value);
      if (!bench.ok) return bench;
      benchmarks = bench.value;
    }

    let simulations: readonly OptimizationSimulation[] = [];
    if (request.preferences?.includeSimulation !== false) {
      const sim = this.deps.simulation.simulate(request, prioritized.value);
      if (!sim.ok) return sim;
      simulations = sim.value;
    }

    const experiments = this.deps.experiments.propose(prioritized.value);
    if (!experiments.ok) return experiments;

    const createdAt = this.nowIso();
    const durationMs = this.clockMs() - start;
    const statistics: OptimizationStatistics = {
      artifactsAnalyzed: request.inputs.executionArtifacts?.length ?? 0,
      evaluationsAnalyzed: request.inputs.evaluationReports?.length ?? 0,
      learningSignalsAnalyzed:
        request.inputs.learningResults?.reduce((s, lr) => s + lr.signals.length, 0) ?? 0,
      observabilityReportsAnalyzed: request.inputs.observabilityReports?.length ?? 0,
      intelligenceResultsAnalyzed: request.inputs.intelligenceResults?.length ?? 0,
      patternsDetected: patterns.value.length,
      recommendationsGenerated: prioritized.value.length,
      simulationsRun: simulations.length,
      durationMs,
    };

    const snapshot = {
      snapshotId: asOptimizationSnapshotId(this.createId("opt_snap")),
      requestId: request.requestId,
      capturedAt: createdAt,
      topRecommendations: prioritized.value.slice(0, 5),
      patterns: patterns.value,
      confidence: confidence.value,
    };

    return success({
      resultId: asExecutionOptimizationResultId(this.createId("exec_opt")),
      requestId: request.requestId,
      recommendations: prioritized.value,
      heuristicProposals: heuristicProposals.value,
      scores: scores.value,
      confidence: confidence.value,
      benchmarks,
      experiments: experiments.value,
      simulations,
      patterns: patterns.value,
      comparisons: buildComparisons(benchmarks),
      trends: trends.value,
      statistics,
      snapshot,
      advisoryOnly: true,
      createdAt,
      durationMs,
    });
  }

  async explain(
    request: ExecutionOptimizationRequest
  ): Promise<Result<readonly OptimizationRecommendation[]>> {
    const result = await this.optimize(request);
    if (!result.ok) return result;
    return success(result.value.recommendations);
  }
}
