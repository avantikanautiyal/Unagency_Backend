/**
 * Simulation engine — dry-run ranking without side effects.
 */

import { success, type Result } from "../../shared/result";
import type { ModelIntelligenceRequest, RankedModelCandidates } from "../contracts/recommendation";
import type { ISimulationEngine } from "../interfaces/model-intelligence";
import type { IRankingEngine, IScoringEngine, IModelKnowledgeBase } from "../interfaces/model-intelligence";
import type { CanonicalModel } from "../../model-registry/contracts/model";

export class DefaultSimulationEngine implements ISimulationEngine {
  constructor(
    private readonly models: readonly CanonicalModel[],
    private readonly knowledge: IModelKnowledgeBase,
    private readonly scoring: IScoringEngine,
    private readonly ranking: IRankingEngine
  ) {}

  simulateRanking(request: ModelIntelligenceRequest): Result<RankedModelCandidates> {
    const modelMap = new Map(this.models.map((m) => [String(m.modelId), m]));
    const scoreCards = this.scoring.scoreAll(this.models, this.knowledge);
    if (!scoreCards.ok) return scoreCards;
    return this.ranking.rank(request, scoreCards.value, modelMap);
  }
}
