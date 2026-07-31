/**
 * Model Intelligence platform factory.
 */

import { createModelRegistryPlatform } from "../../model-registry/factories/create-model-registry-platform";
import { DefaultCapabilityAnalyzer } from "../capability-analysis/default-capability-analyzer";
import { ModelIntelligenceEngine } from "../engine/model-intelligence-engine";
import { DefaultLeaderboardEngine } from "../leaderboards/default-leaderboard-engine";
import { DefaultPredictionEngine } from "../prediction/default-prediction-engine";
import { DefaultRankingEngine } from "../ranking/default-ranking-engine";
import { DefaultRecommendationEngine } from "../recommendation/default-recommendation-engine";
import { buildKnowledgeProfile } from "../repositories/knowledge-base-seed";
import { InMemoryBenchmarkRepository } from "../repositories/in-memory-benchmark-repository";
import { InMemoryModelKnowledgeBase } from "../repositories/in-memory-knowledge-base";
import { InMemoryPerformanceRepository } from "../repositories/in-memory-performance-repository";
import { DefaultScoringEngine } from "../scoring/default-scoring-engine";
import { DefaultTrendAnalyzer } from "../trend-analysis/default-trend-analyzer";
import type { IModelIntelligenceEngine } from "../interfaces/model-intelligence";
import type { ProviderId } from "../../shared/identifiers";

export interface ModelIntelligencePlatform {
  readonly engine: IModelIntelligenceEngine;
}

export interface CreateModelIntelligencePlatformOptions {
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
  /**
   * When set, limit candidate models to a safe subset of providers.
   * This is used by production composition to avoid selecting catalogue-only providers.
   */
  readonly allowedProviderIds?: readonly ProviderId[];
}

export function createModelIntelligencePlatform(
  options: CreateModelIntelligencePlatformOptions = {}
): ModelIntelligencePlatform {
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const registry = createModelRegistryPlatform({ nowIso, loadSeed: true });
  const modelsResult = registry.registry.listModels();
  if (!modelsResult.ok) throw modelsResult.error;
  const models = options.allowedProviderIds?.length
    ? modelsResult.value.filter((m) =>
        options.allowedProviderIds!.includes(m.providerId)
      )
    : modelsResult.value;

  const knowledgeProfiles = models.map((m) => buildKnowledgeProfile(m, nowIso()));
  const knowledge = new InMemoryModelKnowledgeBase(knowledgeProfiles);
  const benchmarks = new InMemoryBenchmarkRepository(models, nowIso);
  const performance = new InMemoryPerformanceRepository(models);
  const scoring = new DefaultScoringEngine(benchmarks, performance, nowIso);
  const capability = new DefaultCapabilityAnalyzer();

  const scoreCardsResult = scoring.scoreAll(models, knowledge);
  const scoreCards = scoreCardsResult.ok ? scoreCardsResult.value : [];

  const ranking = new DefaultRankingEngine(knowledge, capability, performance, nowIso);
  const recommendation = new DefaultRecommendationEngine(options.createId, nowIso);
  const leaderboards = new DefaultLeaderboardEngine(scoreCards, nowIso);
  const prediction = new DefaultPredictionEngine(benchmarks, performance, nowIso, options.createId);
  const trends = new DefaultTrendAnalyzer();

  const engine = new ModelIntelligenceEngine({
    models,
    knowledge,
    scoring,
    ranking,
    recommendation,
    leaderboards,
    prediction,
    trends,
    nowIso: options.nowIso,
    clockMs: options.clockMs,
    createId: options.createId,
  });

  return { engine };
}
