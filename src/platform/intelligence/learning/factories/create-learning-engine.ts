/**
 * Factory for LearningIntelligenceEngine with default placeholder components.
 */

import {
  AnalyzerSignalExtractor,
  createDefaultAnalyzers,
} from "../analyzers/analyzer-pipeline";
import { LearningSummaryBuilder } from "../builders/learning-builders";
import { LearningIntelligenceEngine } from "../engine/learning-intelligence-engine";
import type { ILearningIntelligenceEngine } from "../interfaces/learning-ports";
import { PlaceholderPatternDetector } from "../patterns/pattern-detector";
import {
  PlaceholderInsightGenerator,
  PlaceholderRecommendationGenerator,
} from "../recommendations";
import { ConfidenceRankingStrategy } from "../ranking/confidence-ranking";
import { PlaceholderStatisticsEngine } from "../statistics/statistics-engine";

export function createLearningIntelligenceEngine(): ILearningIntelligenceEngine {
  return new LearningIntelligenceEngine({
    signalExtractor: new AnalyzerSignalExtractor(createDefaultAnalyzers()),
    patternDetector: new PlaceholderPatternDetector(),
    statisticsEngine: new PlaceholderStatisticsEngine(),
    insightGenerator: new PlaceholderInsightGenerator(),
    recommendationGenerator: new PlaceholderRecommendationGenerator(),
    rankingStrategy: new ConfidenceRankingStrategy(),
    summaryBuilder: new LearningSummaryBuilder(),
  });
}
