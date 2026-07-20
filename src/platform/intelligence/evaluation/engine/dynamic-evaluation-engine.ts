/**
 * Dynamic Evaluation Engine — strategy-driven; reuses IntelligenceEvaluationEngine.
 */

import { failure, success, type Result } from "../../shared/result";
import { EvaluationValidationError } from "../errors";
import { IntelligenceEvaluationEngine } from "./intelligence-evaluation-engine";
import { EvaluationReportBuilder } from "../builders/evaluation-builders";
import { PlaceholderConfidenceEngine } from "../confidence/confidence-engine";
import { PlaceholderReviewDecisionEngine } from "../review/review-decision-engine";
import { WeightedScoreAggregator } from "../scoring/weighted-aggregator";
import { JudgePipeline } from "../judges/judge-pipeline";
import { buildDynamicRubric } from "../scoring/dynamic-rubric-builder";
import { adaptPassingScore } from "../adaptive/adapt-thresholds";
import type { EvaluationRequest } from "../contracts/evaluation-models";
import type {
  DynamicEvaluationRequest,
  DynamicEvaluationResult,
} from "../contracts/dynamic-evaluation";
import type {
  IBenchmarkResolver,
  IDynamicEvaluationEngine,
  IDynamicEvaluationExplainabilityBuilder,
  IEvaluationLearningSignalEmitter,
  IEvaluationStrategyResolver,
  IEvidencePlanner,
  IJudgeRegistry,
  IJudgeSelector,
  IJudgeWeightingEngine,
} from "../interfaces/dynamic-evaluation-ports";

export interface DynamicEvaluationEngineDeps {
  readonly registry: IJudgeRegistry;
  readonly strategyResolver: IEvaluationStrategyResolver;
  readonly judgeSelector: IJudgeSelector;
  readonly weighting: IJudgeWeightingEngine;
  readonly evidencePlanner: IEvidencePlanner;
  readonly benchmarkResolver: IBenchmarkResolver;
  readonly explainability: IDynamicEvaluationExplainabilityBuilder;
  readonly learningSignals: IEvaluationLearningSignalEmitter;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

/**
 * Additive dynamic engine. Does not replace IntelligenceEvaluationEngine —
 * constructs a purpose-built pipeline then delegates to it.
 */
export class DynamicEvaluationEngine implements IDynamicEvaluationEngine {
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;
  private readonly createId: (prefix: string) => string;

  constructor(private readonly deps: DynamicEvaluationEngineDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
    this.createId = deps.createId ?? ((p) => `${p}_${Date.now()}`);
  }

  async evaluate(
    request: DynamicEvaluationRequest
  ): Promise<Result<DynamicEvaluationResult>> {
    const start = this.clockMs();

    if (!request.requestId?.trim()) {
      return failure(new EvaluationValidationError("requestId is required"));
    }
    if (!request.inputs.executionResult) {
      return failure(new EvaluationValidationError("executionResult is required"));
    }

    const strategy = this.deps.strategyResolver.resolve(request);
    if (!strategy.ok) return strategy;

    const plan = this.deps.judgeSelector.select(strategy.value, this.deps.registry);
    if (!plan.ok) return plan;
    if (plan.value.selectedJudges.length === 0) {
      return failure(new EvaluationValidationError("no judges selected for strategy"));
    }

    const weights = this.deps.weighting.weight(strategy.value, plan.value);
    if (!weights.ok) return weights;

    const evidence = this.deps.evidencePlanner.plan(strategy.value, plan.value);
    if (!evidence.ok) return evidence;

    const benchmark = this.deps.benchmarkResolver.resolve(strategy.value, request);
    if (!benchmark.ok) return benchmark;

    const explainability = this.deps.explainability.build({
      strategy: strategy.value,
      plan: plan.value,
      weights: weights.value,
      evidence: evidence.value,
      benchmark: benchmark.value,
      request,
    });
    if (!explainability.ok) return explainability;

    const kinds = plan.value.selectedJudges.map((j) => j.kind);
    const judges = this.deps.registry.resolve(kinds);
    if (!judges.ok) return judges;

    const passingScore = adaptPassingScore(strategy.value, benchmark.value);
    const rubric = buildDynamicRubric(
      strategy.value.pipelineFamily,
      weights.value,
      passingScore
    );

    const evaluationRequest: EvaluationRequest = {
      requestId: request.requestId,
      identity: request.identity,
      executionResult: request.inputs.executionResult,
      rubric,
      attributes: {
        ...request.attributes,
        dynamicStrategyId: strategy.value.strategyId,
        pipelineFamily: strategy.value.pipelineFamily,
        benchmarkProfileId: benchmark.value.profileId,
      },
    };

    // Reuse existing engine with a dynamically constructed judge pipeline.
    const engine = new IntelligenceEvaluationEngine({
      rubricResolver: {
        resolve: (req) =>
          req.rubric
            ? success(req.rubric)
            : failure(new EvaluationValidationError("dynamic rubric missing")),
      },
      judgePipeline: new JudgePipeline([...judges.value]),
      scoreAggregator: new WeightedScoreAggregator(),
      reportBuilder: new EvaluationReportBuilder(),
      confidenceEngine: new PlaceholderConfidenceEngine(),
      reviewDecisionEngine: new PlaceholderReviewDecisionEngine(),
    });

    const evaluation = await engine.evaluate(evaluationRequest);
    if (!evaluation.ok) return evaluation;

    const learningSignals = this.deps.learningSignals.emit({
      strategy: strategy.value,
      plan: plan.value,
      weights: weights.value,
      evaluationPassed: evaluation.value.report.summary.passed,
      overallScore: evaluation.value.report.summary.overallScore,
    });
    if (!learningSignals.ok) return learningSignals;

    const confidenceProfile = {
      expectedConfidence: evaluation.value.confidence.confidenceLevel,
      coverage: Math.min(1, plan.value.selectedJudges.length / 8),
      rationale: `Coverage from ${plan.value.selectedJudges.length} selected judges.`,
    };

    const weightMap: Record<string, number> = {};
    for (const e of weights.value.entries) weightMap[e.kind] = e.weight;

    const experienceCandidates = [
      `exp_candidate_${strategy.value.pipelineFamily}_${this.createId("ev")}`,
      ...learningSignals.value
        .filter((s) => s.kind === "judge_performance" || s.kind === "risk_miss")
        .map((s) => s.signalId),
    ];

    return success({
      requestId: request.requestId,
      strategy: strategy.value,
      judgePlan: plan.value,
      weightProfile: weights.value,
      evidence: evidence.value,
      benchmark: benchmark.value,
      confidenceProfile,
      evaluation: evaluation.value,
      explainability: explainability.value,
      learningSignals: learningSignals.value,
      experienceCandidates,
      observability: {
        judgeTimingsMs: Object.fromEntries(
          evaluation.value.report.judgeResults.map((j) => [j.kind, 0])
        ),
        weights: weightMap,
        evidenceCount: evidence.value.requirements.length,
        confidence: evaluation.value.confidence.confidenceScore,
        coverage: confidenceProfile.coverage,
        failures: evaluation.value.report.summary.failedCriteria,
        durationMs: Math.max(0, this.clockMs() - start),
      },
      createdAt: this.nowIso(),
    });
  }
}
