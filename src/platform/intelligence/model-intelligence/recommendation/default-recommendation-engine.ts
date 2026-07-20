/**
 * Recommendation and decision record engine.
 */

import { failure, success, type Result } from "../../shared/result";
import { ValidationError } from "../../shared/errors";
import { asModelDecisionRecordId } from "../contracts/identifiers";
import type {
  ModelIntelligenceRequest,
  ModelRecommendation,
  RankedModelCandidates,
} from "../contracts/recommendation";
import type { ModelDecisionRecord } from "../contracts/decision-record";
import type { IRecommendationEngine } from "../interfaces/model-intelligence";

export class DefaultRecommendationEngine implements IRecommendationEngine {
  constructor(
    private readonly createId: (prefix: string) => string = (p) => `${p}_${Date.now()}`,
    private readonly nowIso: () => string = () => new Date().toISOString()
  ) {}

  recommend(
    request: ModelIntelligenceRequest,
    candidates: RankedModelCandidates
  ): Result<ModelRecommendation> {
    if (candidates.candidates.length === 0) {
      return failure(new ValidationError("no candidates"));
    }
    const primary = candidates.candidates[0];
    const fallbacks = candidates.candidates.slice(1, 4);

    return success({
      recommendationId: this.createId("rec"),
      capabilityId: request.capabilityId,
      department: request.department,
      primary,
      fallbacks,
      generatedAt: this.nowIso(),
    });
  }

  buildDecisionRecord(
    request: ModelIntelligenceRequest,
    recommendation: ModelRecommendation
  ): Result<ModelDecisionRecord> {
    const primary = recommendation.primary;
    const rankingScores: Record<string, number> = {};
    for (const c of [primary, ...recommendation.fallbacks]) {
      rankingScores[String(c.modelId)] = c.overallScore;
    }

    return success({
      recordId: asModelDecisionRecordId(this.createId("mdr")),
      capabilityId: request.capabilityId,
      department: request.department,
      candidateModels: [primary, ...recommendation.fallbacks],
      rankingScores,
      rankingExplanation: primary.explanation.summary,
      winningModel: primary,
      fallbackModels: recommendation.fallbacks,
      expectedCost: primary.expectedCost,
      expectedTokens: request.expectedOutputTokens ?? 500,
      expectedLatencyMs: primary.expectedLatencyMs,
      expectedQuality: primary.expectedQuality,
      expectedConfidence:
        primary.confidence === "very_high" ? 0.95 : primary.confidence === "high" ? 0.8 : 0.6,
      reasonForSelection: primary.explanation.whyRanked,
      policyDecisions: request.policies ?? [],
      constraintDecisions: request.constraints ?? [],
      timestamp: this.nowIso(),
      version: "1.0.0",
    });
  }
}
