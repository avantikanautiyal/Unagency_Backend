/**
 * Model Intelligence Engine — orchestrates the full pipeline.
 */

import { failure, success, type Result } from "../../shared/result";
import { ValidationError } from "../../shared/errors";
import { asModelIntelligenceResultId } from "../contracts/identifiers";
import type { CanonicalModel } from "../../model-registry/contracts/model";
import type { BenchmarkReport } from "../contracts/benchmark";
import type { ModelIntelligenceRequest } from "../contracts/recommendation";
import type { ModelIntelligenceResult } from "../contracts/result";
import type {
  ILeaderboardEngine,
  IModelIntelligenceEngine,
  IModelKnowledgeBase,
  IPredictionEngine,
  IRankingEngine,
  IRecommendationEngine,
  IScoringEngine,
  ITrendAnalyzer,
} from "../interfaces/model-intelligence";

export interface ModelIntelligenceEngineDeps {
  readonly models: readonly CanonicalModel[];
  readonly knowledge: IModelKnowledgeBase;
  readonly scoring: IScoringEngine;
  readonly ranking: IRankingEngine;
  readonly recommendation: IRecommendationEngine;
  readonly leaderboards: ILeaderboardEngine;
  readonly prediction: IPredictionEngine;
  readonly trends: ITrendAnalyzer;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export class ModelIntelligenceEngine implements IModelIntelligenceEngine {
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;
  private readonly createId: (prefix: string) => string;
  private readonly modelMap: ReadonlyMap<string, CanonicalModel>;

  constructor(private readonly deps: ModelIntelligenceEngineDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
    this.createId = deps.createId ?? ((p) => `${p}_${Math.random().toString(36).slice(2)}`);
    this.modelMap = new Map(deps.models.map((m) => [String(m.modelId), m]));
  }

  async recommend(request: ModelIntelligenceRequest): Promise<Result<ModelIntelligenceResult>> {
    const start = this.clockMs();
    const invalid = this.validate(request);
    if (invalid) return failure(invalid);

    const scoreCards = this.deps.scoring.scoreAll(this.deps.models, this.deps.knowledge);
    if (!scoreCards.ok) return scoreCards;

    const ranked = this.deps.ranking.rank(request, scoreCards.value, this.modelMap);
    if (!ranked.ok) return ranked;

    const rec = this.deps.recommendation.recommend(request, ranked.value);
    if (!rec.ok) return rec;

    const decision = this.deps.recommendation.buildDecisionRecord(request, rec.value);
    if (!decision.ok) return decision;

    const deptBoard = request.department
      ? this.deps.leaderboards.forDepartment(request.department)
      : undefined;
    const capBoard = this.deps.leaderboards.forCapability(String(request.capabilityId));

    const predictions = ranked.value.candidates.slice(0, 3).map((c) =>
      this.deps.prediction.predict(String(c.modelId), String(request.capabilityId))
    );
    const predValues = predictions.filter((p) => p.ok).map((p) => p.value);

    const benchmarkReports: BenchmarkReport[] = ranked.value.candidates
      .slice(0, 3)
      .map((c) => ({
        reportId: this.createId("bench"),
        modelId: c.modelId,
        categories: ["marketing", "creative_writing"] as never[],
        scores: [],
        summary: `Benchmark summary for ${c.displayName}`,
        generatedAt: this.nowIso(),
      }));

    const durationMs = this.clockMs() - start;

    return success({
      resultId: asModelIntelligenceResultId(this.createId("mi")),
      request,
      candidates: ranked.value,
      recommendation: rec.value,
      decisionRecord: decision.value,
      scoreCards: scoreCards.value,
      departmentLeaderboard: deptBoard?.ok ? deptBoard.value : undefined,
      capabilityLeaderboard: capBoard.ok ? capBoard.value : undefined,
      benchmarkReports,
      predictions: predValues,
      statistics: {
        modelsProfiled: this.deps.models.length,
        benchmarksLoaded: this.deps.models.length,
        departmentsRanked: request.department ? 1 : 0,
        capabilitiesRanked: 1,
        durationMs,
      },
      createdAt: this.nowIso(),
    });
  }

  async explain(request: ModelIntelligenceRequest): Promise<Result<import("../contracts/recommendation").RankedModelCandidates>> {
    const result = await this.recommend(request);
    if (!result.ok) return result;
    return success(result.value.candidates);
  }

  private validate(request: ModelIntelligenceRequest): ValidationError | null {
    if (!request.requestId?.trim()) return new ValidationError("requestId required");
    if (!request.capabilityId) return new ValidationError("capabilityId required");
    return null;
  }
}
