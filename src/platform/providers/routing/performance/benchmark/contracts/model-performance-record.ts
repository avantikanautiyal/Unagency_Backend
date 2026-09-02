/**
 * Step 3 — Canonical Model Performance Record.
 * Immutable append-only evidence from benchmark execution.
 */

import type { ValidationGateStatus } from "../../../../../os/evaluation/output-validation/validation-result";
import type { RequirementValidationStatus } from "../../../../../os/evaluation/output-validation/validation-result";
import type { PerformanceFailureCategory } from "../../contracts/performance-evidence";
import type { BenchmarkComplexity } from "./benchmark-case";
import type { BenchmarkOutcome } from "./benchmark-outcome";
import type { BenchmarkCostBreakdown } from "../engine/benchmark-cost-accounting";
import type { EvidenceMode, EvidenceSource } from "./evidence-provenance";

export type ReliabilityStatus = "success" | "operational_failure" | "partial";

export type ModelPerformanceRecord = {
  readonly performanceRecordId: string;

  readonly benchmarkId: string;
  readonly benchmarkVersion: string;
  readonly executionId: string;
  readonly attemptId?: string;

  readonly providerId: string;
  readonly modelId: string;
  readonly modelVersion?: string;
  readonly capabilityId: string;
  readonly requiredCapabilityId: string;
  readonly organizationId: string;

  readonly service: string;
  readonly subtype: string;
  readonly outputKind: string;
  readonly industry?: string;
  readonly complexity: BenchmarkComplexity;
  readonly platform?: string;
  readonly format?: string;

  readonly contractId: string;
  readonly contractVersion: string;
  readonly effectiveContractId?: string;

  readonly strategyId: string;
  readonly strategyVersion: string;
  readonly knowledgeVersion?: string;
  /** Step 9 — canonical knowledge identity (never record knowledge without version). */
  readonly knowledgeId?: string;
  readonly knowledgeFingerprint?: string;
  /** Step 9 — experiment provenance when run under controlled experiment. */
  readonly experimentId?: string;
  readonly experimentVersion?: string;

  /** Step 10 — distinguish production observational vs controlled benchmark evidence. */
  readonly evidenceSource: EvidenceSource;
  readonly evidenceMode: EvidenceMode;
  readonly requestId?: string;
  readonly productionExecutionId?: string;

  /** Step 12 — production routing provenance (adaptive vs static). */
  readonly routingMode?: "static" | "adaptive";
  readonly routingPolicyId?: string;
  readonly routingPolicyVersion?: string;
  readonly adaptiveDecisionId?: string;
  readonly adaptiveSelected?: boolean;
  readonly adaptiveExecutionSucceeded?: boolean;
  readonly fallbackUsed?: boolean;

  readonly evaluatorId: string;
  readonly evaluatorVersion: string;
  readonly validationVersion: string;
  /** Step 6 — artifact evaluation provenance when automated evaluation ran. */
  readonly artifactEvaluatorId?: string;
  readonly artifactEvaluatorVersion?: string;
  /** Step 7 — generalized evaluation plane provenance. */
  readonly evaluationPlaneId?: string;
  readonly evaluationPlaneVersion?: string;

  /** A. Hard requirement performance */
  readonly hardRequirementPassRate: number;
  readonly mandatoryRequirementFailures: readonly string[];
  readonly criticalFailures: number;
  readonly hardRequirementsTotal: number;
  readonly hardRequirementsPassed: number;

  /** B. Quality performance */
  readonly qualityScore: number;
  readonly qualityDimensions: Readonly<Record<string, number>>;
  readonly measuredQualityDimensions: readonly string[];
  readonly unmeasuredQualityDimensions: readonly string[];

  readonly validationStatus: ValidationGateStatus;
  readonly completionAllowed: boolean;

  readonly repairCount: number;
  readonly initialQualityScore?: number;
  readonly finalQualityScore?: number;

  /** C. Operational performance */
  readonly latencyMs: number;
  readonly modelLatencyMs?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly estimatedCost?: number | null;
  readonly costAvailable: boolean;
  readonly reliabilityStatus: ReliabilityStatus;
  readonly operationalFailureCategory?: PerformanceFailureCategory;

  /** Step 4B — calibrated benchmark evidence semantics */
  readonly benchmarkOutcome: BenchmarkOutcome;
  readonly executionProfileId: string;
  readonly executionProfileVersion: string;
  readonly executionInterfacesProvided: readonly string[];
  readonly executionInterfacesRequired: readonly string[];
  readonly validForModelComparison: boolean;
  readonly qualityScoreInterpretation?: string;
  readonly costBreakdown?: BenchmarkCostBreakdown;

  /** Failure profile */
  readonly failureCategories: Readonly<Record<string, number>>;
  readonly requirementStatuses: Readonly<
    Record<string, RequirementValidationStatus>
  >;

  readonly recordedAt: string;
  readonly provenance: readonly {
    readonly field: string;
    readonly value: string;
  }[];
};

export type PerformanceFingerprint = {
  readonly providerId: string;
  readonly modelId: string;
  readonly modelVersion?: string;
  readonly service: string;
  readonly subtype?: string;
  readonly outputKind?: string;
  readonly industry?: string;
  readonly platform?: string;
  readonly format?: string;
  readonly complexity?: BenchmarkComplexity;
  readonly strategyId?: string;
  readonly contractVersion?: string;
  readonly knowledgeVersion?: string;
  readonly knowledgeId?: string;
  readonly knowledgeFingerprint?: string;
  readonly experimentId?: string;
  readonly evidenceSource?: EvidenceSource;
  readonly evidenceMode?: EvidenceMode;
  readonly benchmarkVersion?: string;
  readonly evaluatorVersion?: string;
  readonly evaluationPlaneVersion?: string;
  readonly artifactEvaluatorVersion?: string;

  readonly sampleCount: number;
  readonly successfulSamples: number;
  readonly failedSamples: number;
  /** Samples valid for fair model comparison (MODEL_SUCCESS / MODEL_QUALITY_FAILURE). */
  readonly validComparisonSamples: number;
  readonly operationalFailureSamples: number;

  readonly hardRequirementPassRateMean: number;
  readonly qualityScoreMean: number;
  readonly qualityDimensions: Readonly<Record<string, number>>;
  readonly measuredQualityDimensions: readonly string[];
  readonly unmeasuredQualityDimensions: readonly string[];

  readonly latencyMsMean: number;
  readonly latencyMsMedian: number;
  readonly costMean?: number | null;
  readonly costPerSuccessfulSample?: number | null;
  readonly costPerValidComparisonSample?: number | null;
  readonly operationalFailureRate: number;

  readonly failureProfile: Readonly<Record<string, number>>;
  readonly confidence: PerformanceConfidence;
  readonly windowStart: string;
  readonly windowEnd: string;
};

export type PerformanceConfidence = {
  readonly level: "high" | "medium" | "low" | "insufficient";
  readonly sampleCount: number;
  readonly scoreVariance?: number;
  readonly recencyWeight: number;
  readonly reason: string;
};

export type ComparisonCompatibility = {
  readonly compatible: boolean;
  readonly reasons: readonly string[];
};
