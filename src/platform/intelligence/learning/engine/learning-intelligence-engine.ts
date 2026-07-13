/**
 * Learning Intelligence Engine.
 *
 * Purpose: Transform historical artifacts into explainable recommendations.
 * Responsibilities: Observe, analyze, recommend — never modify behavior.
 * Usage: learn(LearningRequest) → LearningResult
 * Future Extension: ML models, experiment runners, online learning (external).
 */

import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { LearningRequest, LearningResult } from "../contracts/learning-models";
import { LearningValidationError } from "../errors";
import type {
  IInsightGenerator,
  ILearningIntelligenceEngine,
  ILearningSummaryBuilder,
  IPatternDetector,
  IRecommendationGenerator,
  ISignalExtractor,
  IStatisticsEngine,
} from "../interfaces/learning-ports";
import type { IRankingStrategy } from "../interfaces/learning-ports";

export interface LearningIntelligenceEngineDependencies {
  readonly signalExtractor: ISignalExtractor;
  readonly patternDetector: IPatternDetector;
  readonly statisticsEngine: IStatisticsEngine;
  readonly insightGenerator: IInsightGenerator;
  readonly recommendationGenerator: IRecommendationGenerator;
  readonly rankingStrategy: IRankingStrategy;
  readonly summaryBuilder: ILearningSummaryBuilder;
}

export class LearningIntelligenceEngine implements ILearningIntelligenceEngine {
  constructor(private readonly deps: LearningIntelligenceEngineDependencies) {}

  async learn(request: LearningRequest): Promise<Result<LearningResult>> {
    if (!request.identity.organizationId || !request.identity.workspaceId) {
      return failure(
        new LearningValidationError("organizationId and workspaceId are required")
      );
    }
    if (!request.artifacts.length) {
      return failure(new LearningValidationError("artifacts are required"));
    }

    const signals = await this.deps.signalExtractor.extract(request);
    if (!signals.ok) return signals;

    const patterns = this.deps.patternDetector.detect(signals.value, request);
    if (!patterns.ok) return patterns;

    const statistics = this.deps.statisticsEngine.compute(
      signals.value,
      patterns.value,
      request
    );
    if (!statistics.ok) return statistics;

    const recommendationInput = {
      request,
      signals: signals.value,
      patterns: patterns.value,
      statistics: statistics.value,
    };

    const insights = this.deps.insightGenerator.generate(recommendationInput);
    if (!insights.ok) return insights;

    const recommendations = this.deps.recommendationGenerator.generate(
      recommendationInput
    );
    if (!recommendations.ok) return recommendations;

    const ranked = this.deps.rankingStrategy.rank(recommendations.value);

    const summary = this.deps.summaryBuilder.build({
      request,
      signals: signals.value,
      patterns: patterns.value,
      recommendations: ranked,
      insights: insights.value,
    });

    return success({
      requestId: request.requestId,
      identity: request.identity,
      signals: signals.value,
      patterns: patterns.value,
      statistics: statistics.value,
      insights: insights.value,
      recommendations: ranked,
      summary,
      generatedAt: new Date().toISOString(),
    });
  }
}
