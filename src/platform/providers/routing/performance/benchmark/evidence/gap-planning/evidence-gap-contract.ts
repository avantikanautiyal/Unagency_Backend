/**
 * Priority 4.4 — Evidence gap & experiment planning contracts (advisory only).
 */

import type { BenchmarkModelTarget } from "../../contracts/benchmark-case";
import type { CoverageStrategy, EvidenceMatrixCell } from "../evidence-matrix";
import type {
  EvidenceReadinessBlockerCode,
  EvidenceReadinessScope,
  EvidenceReadinessState,
} from "../readiness/evidence-readiness-contract";

/** Reuses P4.3 blocker codes plus gap-specific codes. */
export type EvidenceGapReasonCode =
  | EvidenceReadinessBlockerCode
  | "MISSING_CONTROLLED_EVIDENCE"
  | "NO_ELIGIBLE_CANDIDATE";

export type EvidenceGap = {
  readonly scope: EvidenceReadinessScope;
  readonly readinessState: EvidenceReadinessState;
  readonly reasonCodes: readonly EvidenceGapReasonCode[];
  readonly evidenceIds: readonly string[];
  readonly missingRequirements: readonly string[];
  readonly productionObservationCount: number;
};

export type ExperimentRecommendationAction =
  | "RUN_CONTROLLED_PILOT"
  | "ADD_COMPARISON_CANDIDATE"
  | "ADD_REPEATS"
  | "RERUN_STALE_CELL"
  | "RERUN_CANONICAL_CONFIGURATION"
  | "RERUN_EVALUATION_PLANE"
  | "NO_ELIGIBLE_CANDIDATE"
  | "BLOCKED_BY_GOVERNANCE"
  | "NO_ACTION";

export type ExperimentGovernanceStatus = "ALLOWED" | "BLOCKED" | "REMEDIATION_REQUIRED";

export type ExperimentRecommendation = {
  readonly kind: "RECOMMENDATION";
  readonly gap: EvidenceGap;
  readonly action: ExperimentRecommendationAction;
  readonly strategy: CoverageStrategy;
  readonly candidates: readonly BenchmarkModelTarget[];
  readonly benchmarkCells: readonly EvidenceMatrixCell[];
  readonly repeats: number;
  readonly totalInvocations: number;
  readonly expectedEvidenceGain: string;
  readonly expectedReadinessImprovement: EvidenceReadinessState;
  readonly rationale: readonly string[];
  readonly governanceStatus: ExperimentGovernanceStatus;
  readonly executable: false;
};

export type EvidenceGapObservation = {
  readonly kind: "OBSERVATION";
  readonly scope: EvidenceReadinessScope;
  readonly readinessState: "SUFFICIENT";
  readonly message: string;
};

export type EvidenceGapAnalysisReport = {
  readonly planeVersion: "p4.4.1";
  readonly adaptiveRoutingActivated: false;
  readonly readinessPlaneVersion: string;
  readonly observations: readonly EvidenceGapObservation[];
  readonly gaps: readonly EvidenceGap[];
  readonly recommendations: readonly ExperimentRecommendation[];
  readonly textReport: string;
};

export type EvidenceGapAnalysisInput = {
  readonly records: readonly import("../../contracts/model-performance-record").ModelPerformanceRecord[];
  readonly nowIso?: () => string;
  readonly governanceBlockedScopeKeys?: readonly string[];
  readonly eligibleModels?: readonly BenchmarkModelTarget[];
};
