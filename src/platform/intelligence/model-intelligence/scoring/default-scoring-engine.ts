/**
 * Scoring engine — weighted multi-source placeholder.
 */

import { success, type Result } from "../../shared/result";
import type { CanonicalModel } from "../../model-registry/contracts/model";
import type { ModelKnowledgeProfile } from "../contracts/knowledge";
import type { DimensionScore, DynamicScoreInput, ModelScoreCard } from "../contracts/scoring";
import type { ScoreDimension } from "../contracts/enums";
import { asCanonicalModelId } from "../../model-registry/contracts/identifiers";
import type { IModelKnowledgeBase, IScoringEngine } from "../interfaces/model-intelligence";
import type { InMemoryBenchmarkRepository } from "../repositories/in-memory-benchmark-repository";
import type { InMemoryPerformanceRepository } from "../repositories/in-memory-performance-repository";

const DIMENSION_WEIGHTS: Record<ScoreDimension, number> = {
  reasoning: 0.08,
  creativity: 0.07,
  coding: 0.07,
  planning: 0.05,
  vision: 0.06,
  research: 0.06,
  writing: 0.08,
  latency: 0.07,
  reliability: 0.08,
  cost: 0.07,
  context: 0.05,
  structured_output: 0.05,
  tool_use: 0.05,
  json: 0.04,
  multilingual: 0.04,
  image: 0.04,
  video: 0.03,
  speech: 0.03,
  overall: 0.0,
};

export class DefaultScoringEngine implements IScoringEngine {
  constructor(
    private readonly benchmarks: InMemoryBenchmarkRepository,
    private readonly performance: InMemoryPerformanceRepository,
    private readonly nowIso: () => string = () => new Date().toISOString()
  ) {}

  score(
    model: CanonicalModel,
    knowledge: ModelKnowledgeProfile,
    _inputs?: DynamicScoreInput
  ): Result<ModelScoreCard> {
    const bench = this.benchmarks.get(String(model.modelId));
    const reliability = this.performance.getReliability(String(model.modelId));
    const latency = this.performance.getLatencyMs(String(model.modelId));
    if (!bench.ok || !reliability.ok || !latency.ok) {
      return bench.ok ? (reliability.ok ? latency : reliability) : bench;
    }

    const b = bench.value;
    const getBench = (cat: string) =>
      b.benchmarks.find((x) => x.category === cat)?.score ?? 0.5;

    const costScore = 1 - Math.min(1, (model.pricing.inputPer1kTokens ?? 1) / 20);
    const latencyScore = 1 - Math.min(1, latency.value / 5000);
    const contextScore = Math.min(1, model.limits.maximumContext / 200000);

    const dimensions: DimensionScore[] = [
      dim("reasoning", getBench("reasoning")),
      dim("creativity", getBench("creative_writing")),
      dim("coding", getBench("coding")),
      dim("planning", getBench("planning")),
      dim("vision", getBench("vision")),
      dim("research", getBench("research")),
      dim("writing", getBench("marketing") * 0.5 + getBench("brand_copy") * 0.5),
      dim("latency", latencyScore),
      dim("reliability", reliability.value),
      dim("cost", costScore),
      dim("context", contextScore),
      dim("structured_output", getBench("structured_output")),
      dim("tool_use", getBench("tool_calling")),
      dim("json", model.flags.structuredOutput ? 0.85 : 0.5),
      dim("multilingual", 0.7),
      dim("image", getBench("image_generation")),
      dim("video", getBench("video_generation")),
      dim("speech", getBench("speech")),
    ];

    const weightedOverall = dimensions.reduce(
      (s, d) => s + d.score * (DIMENSION_WEIGHTS[d.dimension] ?? 0.05),
      0
    );
    const strengthBoost = Math.min(0.05, knowledge.knownStrengths.length * 0.01);
    const weaknessPenalty = Math.min(0.05, knowledge.knownWeaknesses.length * 0.008);

    return success({
      modelId: asCanonicalModelId(String(model.modelId)),
      displayName: model.displayName,
      providerId: String(model.providerId),
      dimensions,
      overall: b.aggregateScore,
      weightedOverall: Math.min(0.99, weightedOverall + strengthBoost - weaknessPenalty),
      computedAt: this.nowIso(),
    });
  }

  scoreAll(
    models: readonly CanonicalModel[],
    knowledgeBase: IModelKnowledgeBase
  ): Result<readonly ModelScoreCard[]> {
    const cards: ModelScoreCard[] = [];
    for (const model of models) {
      const k = knowledgeBase.get(String(model.modelId));
      if (!k.ok) continue;
      const scored = this.score(model, k.value);
      if (scored.ok) cards.push(scored.value);
    }
    return success(cards);
  }
}

function dim(dimension: ScoreDimension, score: number): DimensionScore {
  return {
    dimension,
    score,
    weight: DIMENSION_WEIGHTS[dimension] ?? 0.05,
    source: "static_benchmark",
  };
}
