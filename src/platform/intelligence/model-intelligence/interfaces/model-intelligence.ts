/**
 * Model Intelligence public interfaces.
 */

import type { Result } from "../../shared/result";
import type { CanonicalModel } from "../../model-registry/contracts/model";
import type { ModelBenchmarkRecord } from "../contracts/benchmark";
import type { DepartmentLeaderboard, CapabilityLeaderboard, ModelLeaderboard } from "../contracts/leaderboard";
import type { ModelKnowledgeProfile } from "../contracts/knowledge";
import type { ModelIntelligenceProfile } from "../contracts/profile";
import type {
  ModelRecommendation,
  RankedModelCandidates,
  ModelIntelligenceRequest,
} from "../contracts/recommendation";
import type { ModelScoreCard, DynamicScoreInput } from "../contracts/scoring";
import type { ModelDecisionRecord } from "../contracts/decision-record";
import type { DepartmentKind, BenchmarkCategory, LeaderboardScope } from "../contracts/enums";
import type { ModelIntelligenceInputs } from "../contracts/inputs";
import type { ModelIntelligenceResult, PredictionReport } from "../contracts/result";

export interface IModelIntelligenceEngine {
  recommend(request: ModelIntelligenceRequest): Promise<Result<ModelIntelligenceResult>>;
  explain(request: ModelIntelligenceRequest): Promise<Result<RankedModelCandidates>>;
}

export interface IModelKnowledgeBase {
  get(modelId: string): Result<ModelKnowledgeProfile>;
  list(): Result<readonly ModelKnowledgeProfile[]>;
  upsert(profile: ModelKnowledgeProfile): Result<void>;
}

export interface IBenchmarkRepository {
  get(modelId: string): Result<ModelBenchmarkRecord>;
  list(): Result<readonly ModelBenchmarkRecord[]>;
  forCategory(category: BenchmarkCategory): Result<readonly ModelBenchmarkRecord[]>;
}

export interface IPerformanceRepository {
  getReliability(modelId: string): Result<number>;
  getLatencyMs(modelId: string): Result<number>;
}

export interface ICapabilityAnalyzer {
  analyze(model: CanonicalModel): Result<readonly string[]>;
  scoreForCapability(model: CanonicalModel, capabilityId: string): Result<number>;
}

export interface IDepartmentAnalyzer {
  scoreForDepartment(model: CanonicalModel, department: DepartmentKind): Result<number>;
  rankDepartment(department: DepartmentKind): Result<DepartmentLeaderboard>;
}

export interface IScoringEngine {
  score(model: CanonicalModel, knowledge: ModelKnowledgeProfile, inputs?: DynamicScoreInput): Result<ModelScoreCard>;
  scoreAll(
    models: readonly CanonicalModel[],
    knowledgeBase: IModelKnowledgeBase
  ): Result<readonly ModelScoreCard[]>;
}

export interface IRankingEngine {
  rank(request: ModelIntelligenceRequest, scoreCards: readonly ModelScoreCard[], models: ReadonlyMap<string, CanonicalModel>): Result<RankedModelCandidates>;
}

export interface IRecommendationEngine {
  recommend(request: ModelIntelligenceRequest, candidates: RankedModelCandidates): Result<ModelRecommendation>;
  buildDecisionRecord(
    request: ModelIntelligenceRequest,
    recommendation: ModelRecommendation
  ): Result<ModelDecisionRecord>;
}

export interface ILeaderboardEngine {
  global(): Result<ModelLeaderboard>;
  forProvider(providerId: string): Result<ModelLeaderboard>;
  forDepartment(department: DepartmentKind): Result<DepartmentLeaderboard>;
  forCapability(capabilityId: string): Result<CapabilityLeaderboard>;
  forScope(scope: LeaderboardScope, scopeId?: string): Result<ModelLeaderboard>;
}

export interface ITrendAnalyzer {
  analyze(inputs: ModelIntelligenceInputs): Result<Readonly<Record<string, number>>>;
}

export interface IPredictionEngine {
  predict(modelId: string, capabilityId: string): Result<PredictionReport>;
}

export interface ISimulationEngine {
  simulateRanking(request: ModelIntelligenceRequest): Result<RankedModelCandidates>;
}

export interface IProfileBuilder {
  build(model: CanonicalModel, knowledge: ModelKnowledgeProfile): Result<ModelIntelligenceProfile>;
}
