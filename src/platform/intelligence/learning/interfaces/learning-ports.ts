/**
 * Learning Intelligence Platform ports.
 *
 * Purpose: Transform historical artifacts into explainable recommendations.
 * Responsibilities: Observe, analyze, recommend — never modify behavior.
 * Usage: Injected into LearningIntelligenceEngine.
 * Future Extension: ML models, online learning, experiment runners.
 */

import type { ArtifactSnapshot } from "../../artifacts/contracts/artifact-models";
import type { Result } from "../../shared/result";
import type {
  LearningPattern,
  LearningRecommendation,
  LearningRequest,
  LearningResult,
  LearningSignal,
  LearningStatistics,
} from "../contracts/learning-models";

export interface AnalyzerContext {
  readonly request: LearningRequest;
  readonly artifacts: readonly ArtifactSnapshot[];
}

export interface IAnalyzer {
  readonly analyzerId: string;
  analyze(context: AnalyzerContext): Promise<Result<readonly LearningSignal[]>>;
}

export interface ISignalExtractor {
  extract(request: LearningRequest): Promise<Result<readonly LearningSignal[]>>;
}

export interface IPatternDetector {
  detect(
    signals: readonly LearningSignal[],
    request: LearningRequest
  ): Result<readonly LearningPattern[]>;
}

export interface IStatisticsEngine {
  compute(
    signals: readonly LearningSignal[],
    patterns: readonly LearningPattern[],
    request: LearningRequest
  ): Result<LearningStatistics>;
}

export interface IRecommendationGenerator {
  generate(input: RecommendationInput): Result<readonly LearningRecommendation[]>;
}

export interface RecommendationInput {
  readonly request: LearningRequest;
  readonly signals: readonly LearningSignal[];
  readonly patterns: readonly LearningPattern[];
  readonly statistics: LearningStatistics;
}

export interface IInsightGenerator {
  generate(input: RecommendationInput): Result<LearningResult["insights"]>;
}

export interface ILearningSummaryBuilder {
  build(input: {
    request: LearningRequest;
    signals: readonly LearningSignal[];
    patterns: readonly LearningPattern[];
    recommendations: readonly LearningRecommendation[];
    insights: LearningResult["insights"];
  }): LearningResult["summary"];
}

export interface ILearningIntelligenceEngine {
  learn(request: LearningRequest): Promise<Result<LearningResult>>;
}

export interface IClusteringEngine {
  readonly supported: boolean;
  cluster(signals: readonly LearningSignal[]): Result<readonly LearningSignal[][]>;
}

export interface IOptimizationEngine {
  readonly supported: boolean;
  suggest(
    recommendations: readonly LearningRecommendation[]
  ): Result<readonly LearningRecommendation[]>;
}

export interface IRankingStrategy {
  rank(
    recommendations: readonly LearningRecommendation[]
  ): readonly LearningRecommendation[];
}

export interface IExperimentManager {
  readonly supported: boolean;
  createExperiment(
    input: Readonly<Record<string, unknown>>
  ): Result<import("../contracts/learning-models").LearningExperiment>;
}
