/**
 * Model Intelligence result contracts.
 */

import type { ModelIntelligenceResultId } from "./identifiers";
import type { BenchmarkReport } from "./benchmark";
import type { ModelDecisionRecord } from "./decision-record";
import type { CapabilityLeaderboard, DepartmentLeaderboard } from "./leaderboard";
import type { ModelRecommendation, RankedModelCandidates } from "./recommendation";
import type { ModelScoreCard } from "./scoring";
import type { ModelIntelligenceRequest } from "./recommendation";

export interface PredictionReport {
  readonly reportId: string;
  readonly modelId: string;
  readonly predictedQuality: number;
  readonly predictedLatencyMs: number;
  readonly predictedCost: number;
  readonly confidence: number;
  readonly rationale: string;
  readonly generatedAt: string;
}

export interface ModelIntelligenceStatistics {
  readonly modelsProfiled: number;
  readonly benchmarksLoaded: number;
  readonly departmentsRanked: number;
  readonly capabilitiesRanked: number;
  readonly durationMs: number;
}

export interface ModelIntelligenceResult {
  readonly resultId: ModelIntelligenceResultId;
  readonly request: ModelIntelligenceRequest;
  readonly candidates: RankedModelCandidates;
  readonly recommendation: ModelRecommendation;
  readonly decisionRecord: ModelDecisionRecord;
  readonly scoreCards: readonly ModelScoreCard[];
  readonly departmentLeaderboard?: DepartmentLeaderboard;
  readonly capabilityLeaderboard?: CapabilityLeaderboard;
  readonly benchmarkReports: readonly BenchmarkReport[];
  readonly predictions: readonly PredictionReport[];
  readonly statistics: ModelIntelligenceStatistics;
  readonly createdAt: string;
}
