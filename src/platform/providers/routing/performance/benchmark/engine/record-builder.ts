/**
 * Build ModelPerformanceRecord from Step 2 validation output.
 */

import type { OutputValidationResult } from "../../../../../os/evaluation/output-validation/validation-result";
import type { RequirementValidationStatus } from "../../../../../os/evaluation/output-validation/validation-result";
import {
  OUTPUT_VALIDATOR_RUNTIME_VERSION,
  OUTPUT_VALIDATION_VERSION,
} from "../../../../../os/evaluation/output-validation/validation-result";
import type { BenchmarkCase, BenchmarkStrategy } from "../contracts/benchmark-case";
import type { BenchmarkModelTarget } from "../contracts/benchmark-case";
import type { ModelPerformanceRecord, ReliabilityStatus } from "../contracts/model-performance-record";
import type { PerformanceFailureCategory } from "../../contracts/performance-evidence";
import type { BenchmarkCompatibilityVerdict } from "./benchmark-compatibility";
import { BENCHMARK_EXECUTOR_PROFILE, resolveExecutionProfileById } from "./benchmark-execution-profile";
import {
  interpretQualityScore,
  outcomeAffectsQualityScore,
  resolveBenchmarkOutcome,
} from "./benchmark-outcome-resolver";
import { ARTIFACT_EVALUATION_VERSION, ARTIFACT_EVALUATOR_ID } from "../../../../../os/evaluation/artifact-evaluation/artifact-evaluation-version";
import {
  EVALUATION_PLANE_ID,
  EVALUATION_PLANE_VERSION,
} from "../../../../../os/evaluation/evaluation-plane/evaluation-plane-version";
import type { BenchmarkCostBreakdown } from "./benchmark-cost-accounting";
import type { BenchmarkOutcome } from "../contracts/benchmark-outcome";
import { BENCHMARK_EVIDENCE_DEFAULTS } from "../contracts/evidence-provenance";

export type BenchmarkExecutionOutput = {
  readonly preview: string;
  readonly structuredData?: unknown;
  readonly mediaArtifactIds?: readonly string[];
  readonly latencyMs: number;
  readonly modelLatencyMs?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly estimatedCost?: number | null;
  readonly costBreakdown?: BenchmarkCostBreakdown;
  readonly operationalFailure?: {
    readonly category: PerformanceFailureCategory;
    readonly message: string;
  };
  readonly compatibility?: BenchmarkCompatibilityVerdict;
  readonly skippedPreFlight?: boolean;
  readonly resolvedCapabilityId?: string;
  readonly executionProfileId?: string;
  readonly buildSucceeded?: boolean;
  readonly supportedDownloadFormats?: readonly string[];
  readonly benchmarkAsyncMedia?: import("../../../../../infrastructure/durability/create-async-media-platform").AsyncMediaPlatform;
  readonly benchmarkArtifactsRepo?: import("../../../../../infrastructure/durability/interfaces/execution-store-ports").IArtifactRepository;
};

type RecordCalibrationFields = {
  readonly benchmarkOutcome: BenchmarkOutcome;
  readonly requiredCapabilityId: string;
  readonly capabilityId: string;
  readonly executionProfileId: string;
  readonly executionProfileVersion: string;
  readonly executionInterfacesProvided: readonly string[];
  readonly executionInterfacesRequired: readonly string[];
  readonly validForModelComparison: boolean;
  readonly qualityScoreInterpretation?: string;
  readonly costBreakdown?: BenchmarkCostBreakdown;
};

function calibrationFields(input: {
  readonly compatibility?: BenchmarkCompatibilityVerdict;
  readonly executionOutput: BenchmarkExecutionOutput;
  readonly model: BenchmarkModelTarget;
  readonly outcome: BenchmarkOutcome;
  readonly qualityScore: number;
  readonly completionAllowed: boolean;
}): RecordCalibrationFields {
  const compat = input.compatibility ?? input.executionOutput.compatibility;
  const profileId =
    compat?.executionProfileId ??
    input.executionOutput.executionProfileId ??
    BENCHMARK_EXECUTOR_PROFILE.profileId;
  const profile = resolveExecutionProfileById(profileId);
  const requiredCapabilityId =
    compat?.resolvedCapabilityId ??
    input.executionOutput.resolvedCapabilityId ??
    input.model.capabilityId;

  return Object.freeze({
    benchmarkOutcome: input.outcome,
    requiredCapabilityId,
    capabilityId: requiredCapabilityId,
    executionProfileId: profileId,
    executionProfileVersion: profile.profileVersion,
    executionInterfacesProvided:
      compat?.executionInterfacesProvided ?? profile.interfaces,
    executionInterfacesRequired:
      compat?.executionInterfacesRequired ?? profile.interfaces,
    validForModelComparison: compat?.validForModelComparison ?? false,
    qualityScoreInterpretation: interpretQualityScore({
      outcome: input.outcome,
      qualityScore: input.qualityScore,
      completionAllowed: input.completionAllowed,
      validity: compat?.validity ?? {
        task: "",
        requiredCapabilityId,
        requiredModality: "text",
        requiresStructuredOutput: false,
        requiredExecutionInterfaces: [],
        expectedOutputForm: "",
        contractOutputKind: "",
        validationMethods: [],
        intent: "model_quality",
        validForPureModelComparison: false,
        architectureNote: "",
      },
    }),
    costBreakdown: input.executionOutput.costBreakdown,
  });
}

export function buildModelPerformanceRecord(input: {
  readonly benchmarkCase: BenchmarkCase;
  readonly validation: OutputValidationResult;
  readonly model: BenchmarkModelTarget;
  readonly strategy: BenchmarkStrategy;
  readonly executionId: string;
  readonly attemptId?: string;
  readonly organizationId: string;
  readonly executionOutput: BenchmarkExecutionOutput;
  readonly knowledgeVersion?: string;
  readonly knowledgeId?: string;
  readonly knowledgeFingerprint?: string;
  readonly experimentId?: string;
  readonly experimentVersion?: string;
  readonly repairCount?: number;
  readonly createId: (prefix: string) => string;
  readonly nowIso: () => string;
}): ModelPerformanceRecord {
  const { validation: v, benchmarkCase: bc } = input;
  const hardTotal = v.hardRequirementSummary.total;
  const hardPassed = v.hardRequirementSummary.passed;
  const passRate = hardTotal > 0 ? hardPassed / hardTotal : 1;

  const mandatoryFailures = v.requirements
    .filter((r) => r.status === "FAIL" && r.blocksCompletion)
    .map((r) => r.requirementId);

  const failureCategories: Record<string, number> = {};
  for (const f of v.failureSummary.failures) {
    failureCategories[f.failureCategory] =
      (failureCategories[f.failureCategory] ?? 0) + 1;
  }

  const requirementStatuses: Record<string, RequirementValidationStatus> = {};
  for (const r of v.requirements) {
    requirementStatuses[r.requirementId] = r.status;
  }

  const qualityDimensions: Record<string, number> = {};
  const measuredQuality: string[] = [];
  const unmeasuredQuality: string[] = [];
  for (const d of v.qualityDimensions) {
    qualityDimensions[d.dimensionId] = d.score;
    if (d.status === "PASS" || d.status === "FAIL") {
      measuredQuality.push(d.dimensionId);
    } else {
      unmeasuredQuality.push(d.dimensionId);
    }
  }

  const outcome = resolveBenchmarkOutcome({
    compatibility:
      input.executionOutput.compatibility ??
      ({
        compatible: true,
        modelCapabilitySupported: true,
        executionCapabilityAvailable: true,
        skipExecution: false,
        outcomeIfSkipped: "MODEL_SUCCESS",
        reasons: [],
        validity: {
          task: bc.objective,
          requiredCapabilityId: input.model.capabilityId,
          requiredModality: "text",
          requiresStructuredOutput: false,
          requiredExecutionInterfaces: [],
          expectedOutputForm: "",
          contractOutputKind: bc.outputKind,
          validationMethods: [],
          intent: "model_quality",
          validForPureModelComparison: true,
          architectureNote: "",
        },
        resolvedCapabilityId: input.model.capabilityId,
        executionProfileId: BENCHMARK_EXECUTOR_PROFILE.profileId,
        executionInterfacesProvided: BENCHMARK_EXECUTOR_PROFILE.interfaces,
        executionInterfacesRequired: [],
        missingExecutionInterfaces: [],
        validForModelComparison: true,
      } as BenchmarkCompatibilityVerdict),
    operationalFailure: input.executionOutput.operationalFailure,
    validation: v,
    skippedPreFlight: input.executionOutput.skippedPreFlight,
  });

  let reliabilityStatus: ReliabilityStatus = "success";
  if (input.executionOutput.operationalFailure) {
    reliabilityStatus = "operational_failure";
  } else if (
    outcome === "CONTRACT_FAILURE" ||
    outcome === "MODEL_QUALITY_FAILURE" ||
    v.hardRequirementSummary.unverified > 0 ||
    unmeasuredQuality.length > 0
  ) {
    reliabilityStatus =
      outcome === "MODEL_SUCCESS" && v.completionAllowed ? "success" : "partial";
  }

  const calibration = calibrationFields({
    compatibility: input.executionOutput.compatibility,
    executionOutput: input.executionOutput,
    model: input.model,
    outcome,
    qualityScore: v.overallScore,
    completionAllowed: v.completionAllowed,
  });

  const ranArtifactEvaluation = v.provenance.some(
    (p) => p.field === "artifactEvaluatorId",
  );
  const ranEvaluationPlane = v.provenance.some(
    (p) => p.field === "evaluationPlaneId",
  );

  return Object.freeze({
    performanceRecordId: input.createId("perfrec"),
    benchmarkId: bc.benchmarkId,
    benchmarkVersion: bc.version,
    executionId: input.executionId,
    attemptId: input.attemptId,
    providerId: input.model.providerId,
    modelId: input.model.modelId,
    modelVersion: input.model.modelVersion,
    capabilityId: calibration.capabilityId,
    requiredCapabilityId: calibration.requiredCapabilityId,
    organizationId: input.organizationId,
    service: bc.service,
    subtype: bc.subtype,
    outputKind: bc.outputKind,
    industry: bc.industry,
    complexity: bc.complexity,
    platform: bc.platform,
    format: bc.format,
    contractId: v.contractId,
    contractVersion: v.contractVersion,
    effectiveContractId: v.effectiveContractId,
    strategyId: input.strategy.strategyId,
    strategyVersion: input.strategy.version,
    knowledgeVersion: input.knowledgeVersion,
    ...(input.knowledgeId ? { knowledgeId: input.knowledgeId } : {}),
    ...(input.knowledgeFingerprint ? { knowledgeFingerprint: input.knowledgeFingerprint } : {}),
    ...(input.experimentId ? { experimentId: input.experimentId } : {}),
    ...(input.experimentVersion ? { experimentVersion: input.experimentVersion } : {}),
    evidenceSource: BENCHMARK_EVIDENCE_DEFAULTS.evidenceSource,
    evidenceMode: BENCHMARK_EVIDENCE_DEFAULTS.evidenceMode,
    evaluatorId: "output_contract_validation",
    evaluatorVersion: OUTPUT_VALIDATOR_RUNTIME_VERSION,
    validationVersion: OUTPUT_VALIDATION_VERSION,
    ...(ranArtifactEvaluation
      ? {
          artifactEvaluatorId: ARTIFACT_EVALUATOR_ID,
          artifactEvaluatorVersion: ARTIFACT_EVALUATION_VERSION,
        }
      : {}),
    ...(ranEvaluationPlane
      ? {
          evaluationPlaneId: EVALUATION_PLANE_ID,
          evaluationPlaneVersion: EVALUATION_PLANE_VERSION,
        }
      : {}),
    hardRequirementPassRate: passRate,
    mandatoryRequirementFailures: Object.freeze(mandatoryFailures),
    criticalFailures: v.hardRequirementSummary.criticalFailed,
    hardRequirementsTotal: hardTotal,
    hardRequirementsPassed: hardPassed,
    qualityScore: outcomeAffectsQualityScore(outcome) ? v.overallScore : 0,
    qualityDimensions: Object.freeze(qualityDimensions),
    measuredQualityDimensions: Object.freeze(measuredQuality),
    unmeasuredQualityDimensions: Object.freeze(unmeasuredQuality),
    validationStatus: v.status,
    completionAllowed: v.completionAllowed,
    repairCount: input.repairCount ?? 0,
    initialQualityScore: v.overallScore,
    finalQualityScore: v.overallScore,
    latencyMs: input.executionOutput.latencyMs,
    modelLatencyMs: input.executionOutput.modelLatencyMs,
    inputTokens: input.executionOutput.inputTokens,
    outputTokens: input.executionOutput.outputTokens,
    totalTokens: input.executionOutput.totalTokens,
    estimatedCost: input.executionOutput.estimatedCost,
    costAvailable: input.executionOutput.estimatedCost != null,
    reliabilityStatus,
    operationalFailureCategory: input.executionOutput.operationalFailure?.category,
    benchmarkOutcome: calibration.benchmarkOutcome,
    executionProfileId: calibration.executionProfileId,
    executionProfileVersion: calibration.executionProfileVersion,
    executionInterfacesProvided: calibration.executionInterfacesProvided,
    executionInterfacesRequired: calibration.executionInterfacesRequired,
    validForModelComparison: calibration.validForModelComparison,
    qualityScoreInterpretation: calibration.qualityScoreInterpretation,
    costBreakdown: calibration.costBreakdown,
    failureCategories: Object.freeze(failureCategories),
    requirementStatuses: Object.freeze(requirementStatuses),
    recordedAt: input.nowIso(),
    provenance: Object.freeze([
      { field: "benchmarkId", value: bc.benchmarkId },
      { field: "benchmarkVersion", value: bc.version },
      { field: "contractVersion", value: v.contractVersion },
      { field: "strategyVersion", value: input.strategy.version },
      { field: "evaluatorVersion", value: OUTPUT_VALIDATOR_RUNTIME_VERSION },
      { field: "benchmarkOutcome", value: outcome },
      ...(ranArtifactEvaluation
        ? [
            { field: "artifactEvaluatorId", value: ARTIFACT_EVALUATOR_ID },
            { field: "artifactEvaluatorVersion", value: ARTIFACT_EVALUATION_VERSION },
          ]
        : []),
      ...(ranEvaluationPlane
        ? [
            { field: "evaluationPlaneId", value: EVALUATION_PLANE_ID },
            { field: "evaluationPlaneVersion", value: EVALUATION_PLANE_VERSION },
          ]
        : []),
      ...(input.knowledgeVersion
        ? [{ field: "knowledgeVersion", value: input.knowledgeVersion }]
        : []),
      ...(input.knowledgeId ? [{ field: "knowledgeId", value: input.knowledgeId }] : []),
      ...(input.knowledgeFingerprint
        ? [{ field: "knowledgeFingerprint", value: input.knowledgeFingerprint }]
        : []),
      ...(input.experimentId ? [{ field: "experimentId", value: input.experimentId }] : []),
      ...(input.experimentVersion
        ? [{ field: "experimentVersion", value: input.experimentVersion }]
        : []),
      ...(input.model.modelVersion
        ? [{ field: "modelVersion", value: input.model.modelVersion }]
        : []),
    ]),
  });
}

export function buildPreFlightSkippedBenchmarkRecord(input: {
  readonly benchmarkCase: BenchmarkCase;
  readonly model: BenchmarkModelTarget;
  readonly strategy: BenchmarkStrategy;
  readonly executionId: string;
  readonly attemptId?: string;
  readonly organizationId: string;
  readonly executionOutput: BenchmarkExecutionOutput;
  readonly knowledgeVersion?: string;
  readonly knowledgeId?: string;
  readonly knowledgeFingerprint?: string;
  readonly experimentId?: string;
  readonly experimentVersion?: string;
  readonly contractId: string;
  readonly contractVersion: string;
  readonly effectiveContractId?: string;
  readonly createId: (prefix: string) => string;
  readonly nowIso: () => string;
}): ModelPerformanceRecord {
  const { benchmarkCase: bc, executionOutput } = input;
  const compat = executionOutput.compatibility;
  if (!compat) {
    throw new Error("Pre-flight skipped record requires compatibility verdict");
  }

  const outcome = resolveBenchmarkOutcome({
    compatibility: compat,
    skippedPreFlight: true,
  });

  const calibration = calibrationFields({
    compatibility: compat,
    executionOutput,
    model: input.model,
    outcome,
    qualityScore: 0,
    completionAllowed: false,
  });

  const failureKey =
    outcome === "MODEL_CAPABILITY_UNSUPPORTED"
      ? "model_capability_unsupported"
      : "execution_capability_unavailable";

  return Object.freeze({
    performanceRecordId: input.createId("perfrec"),
    benchmarkId: bc.benchmarkId,
    benchmarkVersion: bc.version,
    executionId: input.executionId,
    attemptId: input.attemptId,
    providerId: input.model.providerId,
    modelId: input.model.modelId,
    modelVersion: input.model.modelVersion,
    capabilityId: calibration.capabilityId,
    requiredCapabilityId: calibration.requiredCapabilityId,
    organizationId: input.organizationId,
    service: bc.service,
    subtype: bc.subtype,
    outputKind: bc.outputKind,
    industry: bc.industry,
    complexity: bc.complexity,
    platform: bc.platform,
    format: bc.format,
    contractId: input.contractId,
    contractVersion: input.contractVersion,
    effectiveContractId: input.effectiveContractId,
    strategyId: input.strategy.strategyId,
    strategyVersion: input.strategy.version,
    knowledgeVersion: input.knowledgeVersion,
    ...(input.knowledgeId ? { knowledgeId: input.knowledgeId } : {}),
    ...(input.knowledgeFingerprint ? { knowledgeFingerprint: input.knowledgeFingerprint } : {}),
    ...(input.experimentId ? { experimentId: input.experimentId } : {}),
    ...(input.experimentVersion ? { experimentVersion: input.experimentVersion } : {}),
    evidenceSource: BENCHMARK_EVIDENCE_DEFAULTS.evidenceSource,
    evidenceMode: BENCHMARK_EVIDENCE_DEFAULTS.evidenceMode,
    evaluatorId: "output_contract_validation",
    evaluatorVersion: OUTPUT_VALIDATOR_RUNTIME_VERSION,
    validationVersion: OUTPUT_VALIDATION_VERSION,
    hardRequirementPassRate: 0,
    mandatoryRequirementFailures: Object.freeze([]),
    criticalFailures: 0,
    hardRequirementsTotal: 0,
    hardRequirementsPassed: 0,
    qualityScore: 0,
    qualityDimensions: Object.freeze({}),
    measuredQualityDimensions: Object.freeze([]),
    unmeasuredQualityDimensions: Object.freeze([]),
    validationStatus: "BLOCKED",
    completionAllowed: false,
    repairCount: 0,
    latencyMs: executionOutput.latencyMs,
    modelLatencyMs: executionOutput.modelLatencyMs,
    estimatedCost: undefined,
    costAvailable: false,
    reliabilityStatus: "operational_failure",
    operationalFailureCategory:
      outcome === "MODEL_CAPABILITY_UNSUPPORTED"
        ? "unsupported_capability"
        : undefined,
    benchmarkOutcome: outcome,
    executionProfileId: calibration.executionProfileId,
    executionProfileVersion: calibration.executionProfileVersion,
    executionInterfacesProvided: calibration.executionInterfacesProvided,
    executionInterfacesRequired: calibration.executionInterfacesRequired,
    validForModelComparison: false,
    qualityScoreInterpretation: calibration.qualityScoreInterpretation,
    costBreakdown: undefined,
    failureCategories: Object.freeze({ [failureKey]: 1 }),
    requirementStatuses: Object.freeze({}),
    recordedAt: input.nowIso(),
    provenance: Object.freeze([
      { field: "benchmarkId", value: bc.benchmarkId },
      { field: "benchmarkVersion", value: bc.version },
      { field: "benchmarkOutcome", value: outcome },
      { field: "preFlightSkipped", value: "true" },
      ...compat.reasons.map((r, i) => ({ field: `skipReason_${i}`, value: r })),
    ]),
  });
}

export function buildOperationalFailureBenchmarkRecord(input: {
  readonly benchmarkCase: BenchmarkCase;
  readonly model: BenchmarkModelTarget;
  readonly strategy: BenchmarkStrategy;
  readonly executionId: string;
  readonly attemptId?: string;
  readonly organizationId: string;
  readonly executionOutput: BenchmarkExecutionOutput;
  readonly knowledgeVersion?: string;
  readonly knowledgeId?: string;
  readonly knowledgeFingerprint?: string;
  readonly experimentId?: string;
  readonly experimentVersion?: string;
  readonly repairCount?: number;
  readonly contractId: string;
  readonly contractVersion: string;
  readonly effectiveContractId?: string;
  readonly validationUnavailableReason: string;
  readonly createId: (prefix: string) => string;
  readonly nowIso: () => string;
}): ModelPerformanceRecord {
  const { benchmarkCase: bc, executionOutput } = input;
  const operational = executionOutput.operationalFailure;
  const compat = executionOutput.compatibility;

  const outcome = resolveBenchmarkOutcome({
    compatibility:
      compat ??
      ({
        compatible: false,
        modelCapabilitySupported: operational?.category !== "unsupported_capability",
        executionCapabilityAvailable: false,
        skipExecution: false,
        outcomeIfSkipped: "PROVIDER_OPERATIONAL_FAILURE",
        reasons: [],
        validity: {
          task: bc.objective,
          requiredCapabilityId: input.model.capabilityId,
          requiredModality: "text",
          requiresStructuredOutput: false,
          requiredExecutionInterfaces: [],
          expectedOutputForm: "",
          contractOutputKind: bc.outputKind,
          validationMethods: [],
          intent: "model_quality",
          validForPureModelComparison: false,
          architectureNote: "",
        },
        resolvedCapabilityId: input.model.capabilityId,
        executionProfileId: BENCHMARK_EXECUTOR_PROFILE.profileId,
        executionInterfacesProvided: BENCHMARK_EXECUTOR_PROFILE.interfaces,
        executionInterfacesRequired: [],
        missingExecutionInterfaces: [],
        validForModelComparison: false,
      } as BenchmarkCompatibilityVerdict),
    operationalFailure: operational,
    validationUnavailableReason: input.validationUnavailableReason,
    skippedPreFlight: executionOutput.skippedPreFlight,
  });

  const calibration = calibrationFields({
    compatibility: compat,
    executionOutput,
    model: input.model,
    outcome,
    qualityScore: 0,
    completionAllowed: false,
  });

  return Object.freeze({
    performanceRecordId: input.createId("perfrec"),
    benchmarkId: bc.benchmarkId,
    benchmarkVersion: bc.version,
    executionId: input.executionId,
    attemptId: input.attemptId,
    providerId: input.model.providerId,
    modelId: input.model.modelId,
    modelVersion: input.model.modelVersion,
    capabilityId: calibration.capabilityId,
    requiredCapabilityId: calibration.requiredCapabilityId,
    organizationId: input.organizationId,
    service: bc.service,
    subtype: bc.subtype,
    outputKind: bc.outputKind,
    industry: bc.industry,
    complexity: bc.complexity,
    platform: bc.platform,
    format: bc.format,
    contractId: input.contractId,
    contractVersion: input.contractVersion,
    effectiveContractId: input.effectiveContractId,
    strategyId: input.strategy.strategyId,
    strategyVersion: input.strategy.version,
    knowledgeVersion: input.knowledgeVersion,
    ...(input.knowledgeId ? { knowledgeId: input.knowledgeId } : {}),
    ...(input.knowledgeFingerprint ? { knowledgeFingerprint: input.knowledgeFingerprint } : {}),
    ...(input.experimentId ? { experimentId: input.experimentId } : {}),
    ...(input.experimentVersion ? { experimentVersion: input.experimentVersion } : {}),
    evidenceSource: BENCHMARK_EVIDENCE_DEFAULTS.evidenceSource,
    evidenceMode: BENCHMARK_EVIDENCE_DEFAULTS.evidenceMode,
    evaluatorId: "output_contract_validation",
    evaluatorVersion: OUTPUT_VALIDATOR_RUNTIME_VERSION,
    validationVersion: OUTPUT_VALIDATION_VERSION,
    hardRequirementPassRate: 0,
    mandatoryRequirementFailures: Object.freeze([]),
    criticalFailures: 0,
    hardRequirementsTotal: 0,
    hardRequirementsPassed: 0,
    qualityScore: 0,
    qualityDimensions: Object.freeze({}),
    measuredQualityDimensions: Object.freeze([]),
    unmeasuredQualityDimensions: Object.freeze([]),
    validationStatus: "BLOCKED",
    completionAllowed: false,
    repairCount: input.repairCount ?? 0,
    latencyMs: executionOutput.latencyMs,
    modelLatencyMs: executionOutput.modelLatencyMs,
    inputTokens: executionOutput.inputTokens,
    outputTokens: executionOutput.outputTokens,
    totalTokens: executionOutput.totalTokens,
    estimatedCost: executionOutput.estimatedCost,
    costAvailable: executionOutput.estimatedCost != null,
    reliabilityStatus: "operational_failure",
    operationalFailureCategory: operational?.category,
    benchmarkOutcome: outcome,
    executionProfileId: calibration.executionProfileId,
    executionProfileVersion: calibration.executionProfileVersion,
    executionInterfacesProvided: calibration.executionInterfacesProvided,
    executionInterfacesRequired: calibration.executionInterfacesRequired,
    validForModelComparison: false,
    qualityScoreInterpretation: calibration.qualityScoreInterpretation,
    costBreakdown: calibration.costBreakdown,
    failureCategories: Object.freeze(
      operational
        ? { [operational.category]: 1 }
        : { validation_unavailable: 1 },
    ),
    requirementStatuses: Object.freeze({}),
    recordedAt: input.nowIso(),
    provenance: Object.freeze([
      { field: "benchmarkId", value: bc.benchmarkId },
      { field: "benchmarkVersion", value: bc.version },
      { field: "contractVersion", value: input.contractVersion },
      { field: "strategyVersion", value: input.strategy.version },
      { field: "evaluatorVersion", value: OUTPUT_VALIDATOR_RUNTIME_VERSION },
      { field: "benchmarkOutcome", value: outcome },
      { field: "validationUnavailable", value: input.validationUnavailableReason },
      ...(input.knowledgeVersion
        ? [{ field: "knowledgeVersion", value: input.knowledgeVersion }]
        : []),
      ...(input.knowledgeId ? [{ field: "knowledgeId", value: input.knowledgeId }] : []),
      ...(input.knowledgeFingerprint
        ? [{ field: "knowledgeFingerprint", value: input.knowledgeFingerprint }]
        : []),
      ...(input.experimentId ? [{ field: "experimentId", value: input.experimentId }] : []),
      ...(input.experimentVersion
        ? [{ field: "experimentVersion", value: input.experimentVersion }]
        : []),
      ...(input.model.modelVersion
        ? [{ field: "modelVersion", value: input.model.modelVersion }]
        : []),
    ]),
  });
}
