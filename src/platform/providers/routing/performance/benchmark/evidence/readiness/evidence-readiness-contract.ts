/**
 * Priority 4.3 — Evidence readiness contracts (coverage/control layer).
 */

import type { BenchmarkComplexity } from "../../contracts/benchmark-case";
import type {
  ModelPerformanceRecord,
  PerformanceConfidence,
} from "../../contracts/model-performance-record";
import type { EvidenceTier } from "../evidence-collection-config";

export type EvidenceReadinessState =
  | "SUFFICIENT"
  | "PARTIAL"
  | "INSUFFICIENT"
  | "STALE"
  | "INCOMPARABLE"
  | "BLOCKED";

export type EvidenceReadinessBlockerCode =
  | "TOO_FEW_CONTROLLED_SAMPLES"
  | "INSUFFICIENT_REPEATS"
  | "NO_COMPARABLE_CANDIDATE"
  | "SINGLE_MODEL_ONLY"
  | "PRODUCTION_ONLY_EVIDENCE"
  | "STALE_EVIDENCE"
  | "INCOMPARABLE_CONFIGURATION"
  | "PROVENANCE_MISMATCH"
  | "EVALUATION_INCOMPLETE"
  | "HEURISTIC_ONLY_EVALUATION"
  | "MODEL_JUDGED_ONLY"
  | "EVALUATION_FAILURE"
  | "GOVERNANCE_BLOCKED"
  | "INVALID_COMPARISON_PROVENANCE";

export type EvidenceReadinessBlocker = {
  readonly code: EvidenceReadinessBlockerCode;
  readonly message: string;
  readonly evidenceIds?: readonly string[];
};

export type EvidenceReadinessScope = {
  readonly service: string;
  readonly subtype: string;
  readonly industry?: string;
  readonly modality: string;
  readonly complexity: BenchmarkComplexity;
  readonly strategyId: string;
  readonly scopeKey: string;
};

export type EvidenceReadinessCandidate = {
  readonly providerId: string;
  readonly modelId: string;
  readonly controlledSampleCount: number;
  readonly validComparisonSampleCount: number;
  readonly repeatCoverage: number;
  readonly evidenceTier: EvidenceTier;
  readonly confidence: PerformanceConfidence;
  readonly evaluationPlaneVersion?: string;
  readonly newestRecordedAt?: string;
  readonly oldestRecordedAt?: string;
  readonly evidenceIds: readonly string[];
};

export type EvidenceEvaluationCoverageSummary = {
  readonly recordsWithEvaluationPlane: number;
  readonly recordsWithArtifactEvaluator: number;
  readonly objectiveMeasurementRatio: number;
  readonly heuristicOnlyRecords: number;
  readonly modelJudgedRecords: number;
  readonly failedEvaluationRecords: number;
  readonly notAutomatedDimensionCount: number;
  readonly measuredDimensionCount: number;
};

export type EvidenceReadinessSliceReport = {
  readonly scope: EvidenceReadinessScope;
  readonly readiness: EvidenceReadinessState;
  readonly controlledEvidenceCount: number;
  readonly productionEvidenceCountExcluded: number;
  readonly validComparisonSampleCount: number;
  readonly comparableCandidateCount: number;
  readonly repeatCoverage: number;
  readonly evaluationCoverage: EvidenceEvaluationCoverageSummary;
  readonly evidenceTier: EvidenceTier;
  readonly confidence: PerformanceConfidence;
  readonly freshnessDays?: number;
  readonly freshnessStatus: "FRESH" | "AGING" | "STALE" | "UNKNOWN";
  readonly candidates: readonly EvidenceReadinessCandidate[];
  readonly blockers: readonly EvidenceReadinessBlocker[];
  readonly evidenceIds: readonly string[];
  readonly adaptiveRoutingEligible: false;
};

export type EvidenceReadinessReport = {
  readonly planeVersion: "p4.3.1";
  readonly adaptiveRoutingActivated: false;
  readonly overallReadiness: EvidenceReadinessState;
  readonly totalRecords: number;
  readonly controlledRecordCount: number;
  readonly productionRecordCountExcluded: number;
  readonly slices: readonly EvidenceReadinessSliceReport[];
  readonly blockers: readonly EvidenceReadinessBlocker[];
  readonly textReport: string;
};

export type EvidenceReadinessInput = {
  readonly records: readonly ModelPerformanceRecord[];
  readonly nowIso?: () => string;
  readonly governanceBlockedScopeKeys?: readonly string[];
};
