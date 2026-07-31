/**
 * Ranking engine — produces ranked candidates with explainability.
 */

import { success, type Result } from "../../shared/result";
import type { CanonicalModel } from "../../model-registry/contracts/model";
import type { RankedModelCandidate, RankedModelCandidates, ModelIntelligenceRequest } from "../contracts/recommendation";
import type { ModelScoreCard } from "../contracts/scoring";
import type { ConfidenceLevel } from "../contracts/enums";
import type { IRankingEngine } from "../interfaces/model-intelligence";
import type { InMemoryPerformanceRepository } from "../repositories/in-memory-performance-repository";
import type { ModelKnowledgeProfile } from "../contracts/knowledge";
import type { IModelKnowledgeBase } from "../interfaces/model-intelligence";
import type { ICapabilityAnalyzer } from "../interfaces/model-intelligence";
import { isEmbeddingExecutableProvider } from "../../providers/embedding/configs/verified-embedding-provider-specs";

function confidenceFor(score: number): ConfidenceLevel {
  if (score >= 0.9) return "very_high";
  if (score >= 0.75) return "high";
  if (score >= 0.55) return "medium";
  return "low";
}

export class DefaultRankingEngine implements IRankingEngine {
  constructor(
    private readonly knowledge: IModelKnowledgeBase,
    private readonly capability: ICapabilityAnalyzer,
    private readonly performance: InMemoryPerformanceRepository,
    private readonly nowIso: () => string = () => new Date().toISOString()
  ) {}

  rank(
    request: ModelIntelligenceRequest,
    scoreCards: readonly ModelScoreCard[],
    models: ReadonlyMap<string, CanonicalModel>
  ): Result<RankedModelCandidates> {
    const capId = String(request.capabilityId);
    const candidates: RankedModelCandidate[] = [];

    for (const card of scoreCards) {
      const model = models.get(String(card.modelId));
      if (!model) continue;

      // Inventory authority: only models that declare the requested capability are candidates.
      // Soft scoring alone allowed text models to outrank embedding models for embedding.generate.
      const supportsCapability = model.capabilities.some(
        (c) => c.capabilityId === capId && c.supported !== false
      );
      if (!supportsCapability) continue;

      // M9.5K: embedding.generate candidates must be embedding-modality models from
      // verified executable providers (inventory alone is not enough — e.g. Gemini).
      if (capId === "embedding.generate") {
        if (!isEmbeddingExecutableProvider(String(model.providerId))) continue;
        const hasEmbeddingModality = model.modalities.some(
          (m) => String(m) === "embedding"
        );
        if (!hasEmbeddingModality) continue;
      }

      const knowledge = this.knowledge.get(String(card.modelId));
      const capScore = this.capability.scoreForCapability(model, capId);
      if (!capScore.ok) continue;

      const combined = card.weightedOverall * 0.6 + capScore.value * 0.4;
      const latency = this.performance.getLatencyMs(String(card.modelId));
      const reliability = this.performance.getReliability(String(card.modelId));
      const knowledgeProfile = knowledge.ok ? knowledge.value : undefined;

      const reasoning = card.dimensions.find((d) => d.dimension === "reasoning")?.score ?? 0.5;
      const cost = card.dimensions.find((d) => d.dimension === "cost")?.score ?? 0.5;
      const latencyScore = card.dimensions.find((d) => d.dimension === "latency")?.score ?? 0.5;
      const reliabilityScore = reliability.ok ? reliability.value : 0.7;

      let adjusted = combined;
      if (request.budgetPerRequest !== undefined) {
        const estCost = (request.expectedOutputTokens ?? 500) * 0.00002;
        if (estCost > request.budgetPerRequest) adjusted -= 0.1;
      }
      if (request.latencyTargetMs !== undefined && latency.ok) {
        if (latency.value > request.latencyTargetMs) adjusted -= 0.08;
      }

      candidates.push({
        rank: 0,
        modelId: card.modelId,
        displayName: card.displayName,
        providerId: card.providerId,
        overallScore: Math.round(adjusted * 1000) / 10,
        capabilityScore: capScore.value,
        reasoningScore: reasoning,
        costScore: cost,
        latencyScore,
        reliabilityScore,
        confidence: confidenceFor(adjusted),
        explanation: buildExplanation(card, knowledgeProfile, adjusted),
        expectedCost: undefined,
        expectedLatencyMs: latency.ok ? latency.value : 1000,
        expectedQuality: adjusted,
        expectedReliability: reliabilityScore,
      });
    }

    candidates.sort((a, b) => b.overallScore - a.overallScore);
    const ranked = candidates.map((c, i) => ({ ...c, rank: i + 1 }));

    return success({
      capabilityId: request.capabilityId,
      department: request.department,
      candidates: ranked,
      generatedAt: this.nowIso(),
    });
  }
}

function buildExplanation(
  card: ModelScoreCard,
  knowledge: ModelKnowledgeProfile | undefined,
  score: number
) {
  const strengths = knowledge?.knownStrengths ?? [];
  const weaknesses = knowledge?.knownWeaknesses ?? [];
  const writing = card.dimensions.find((d) => d.dimension === "writing")?.score ?? 0;
  const cost = card.dimensions.find((d) => d.dimension === "cost")?.score ?? 0;

  return {
    summary: `Overall score ${(score * 100).toFixed(1)} based on benchmarks and capability fit`,
    strengths: [
      ...strengths.slice(0, 3),
      ...(writing > 0.8 ? ["excellent creative writing"] : []),
      ...(card.weightedOverall > 0.85 ? ["high marketing benchmark"] : []),
    ],
    weaknesses: [
      ...weaknesses.slice(0, 2),
      ...(cost < 0.5 ? ["slightly higher cost"] : []),
    ],
    tradeoffs: [
      cost < 0.6 ? "Higher cost for quality" : "Balanced cost-performance",
      card.dimensions.find((d) => d.dimension === "latency")?.score ?? 0.5 < 0.6
        ? "Latency vs quality tradeoff"
        : "Fast execution",
    ],
    whyRanked: `Strong ${strengths[0] ?? "general"} performance with weighted score ${(card.weightedOverall * 100).toFixed(1)}`,
    whyAlternativesLower: "Lower benchmark scores or weaker capability alignment",
  };
}
