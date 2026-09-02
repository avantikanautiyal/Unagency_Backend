/**
 * Step 10 — Build ModelPerformanceRecord from production execution context.
 * Reuses Step 2 validation; observational evidence only (not fair-comparison eligible).
 */

import type { OutputValidationResult } from "../../../../../os/evaluation/output-validation/validation-result";
import type { RequirementValidationStatus } from "../../../../../os/evaluation/output-validation/validation-result";
import {
  OUTPUT_VALIDATOR_RUNTIME_VERSION,
  OUTPUT_VALIDATION_VERSION,
} from "../../../../../os/evaluation/output-validation/validation-result";
import type { BenchmarkComplexity } from "../contracts/benchmark-case";
import type { ModelPerformanceRecord, ReliabilityStatus } from "../contracts/model-performance-record";
import type { PerformanceFailureCategory } from "../../contracts/performance-evidence";
import {
  PRODUCTION_BENCHMARK_ID,
  PRODUCTION_BENCHMARK_VERSION,
  PRODUCTION_EVIDENCE_DEFAULTS,
} from "../contracts/evidence-provenance";
import { BENCHMARK_EXECUTOR_PROFILE } from "../engine/benchmark-execution-profile";
import {
  interpretQualityScore,
  outcomeAffectsQualityScore,
  resolveBenchmarkOutcome,
} from "../engine/benchmark-outcome-resolver";
import type { BenchmarkOutcome } from "../contracts/benchmark-outcome";

export type ProductionEvidenceInput = {
  readonly organizationId: string;
  readonly productionExecutionId: string;
  readonly requestId?: string;
  readonly attemptId?: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly modelVersion?: string;
  readonly capabilityId: string;
  readonly service: string;
  readonly subtype: string;
  readonly outputKind: string;
  readonly industry?: string;
  readonly complexity?: BenchmarkComplexity;
  readonly platform?: string;
  readonly format?: string;
  readonly strategyId: string;
  readonly strategyVersion: string;
  readonly knowledgeId?: string;
  readonly knowledgeVersion?: string;
  readonly knowledgeFingerprint?: string;
  readonly validation: OutputValidationResult;
  readonly preview: string;
  readonly mediaArtifactIds?: readonly string[];
  readonly latencyMs: number;
  readonly modelLatencyMs?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly estimatedCost?: number | null;
  readonly providerSuccess: boolean;
  readonly operationalFailureCategory?: PerformanceFailureCategory;
  readonly routingMode?: "static" | "adaptive";
  readonly routingPolicyId?: string;
  readonly routingPolicyVersion?: string;
  readonly adaptiveDecisionId?: string;
  readonly adaptiveSelected?: boolean;
  readonly adaptiveExecutionSucceeded?: boolean;
  readonly fallbackUsed?: boolean;
  readonly createId: (prefix: string) => string;
  readonly nowIso: () => string;
};

function productionOutcome(input: {
  readonly validation: OutputValidationResult;
  readonly providerSuccess: boolean;
  readonly operationalFailureCategory?: PerformanceFailureCategory;
}): BenchmarkOutcome {
  if (input.operationalFailureCategory || !input.providerSuccess) {
    return "PROVIDER_OPERATIONAL_FAILURE";
  }
  return resolveBenchmarkOutcome({
    compatibility: {
      compatible: true,
      modelCapabilitySupported: true,
      executionCapabilityAvailable: true,
      skipExecution: false,
      outcomeIfSkipped: "MODEL_SUCCESS",
      reasons: [],
      validity: {
        task: "production",
        requiredCapabilityId: "text.generate",
        requiredModality: "text",
        requiresStructuredOutput: false,
        requiredExecutionInterfaces: [],
        expectedOutputForm: "",
        contractOutputKind: "",
        validationMethods: [],
        intent: "observational",
        validForPureModelComparison: false,
        architectureNote: "Production observational evidence",
      },
      resolvedCapabilityId: "text.generate",
      executionProfileId: BENCHMARK_EXECUTOR_PROFILE.profileId,
      executionInterfacesProvided: BENCHMARK_EXECUTOR_PROFILE.interfaces,
      executionInterfacesRequired: [],
      missingExecutionInterfaces: [],
      validForModelComparison: false,
    },
    validation: input.validation,
    skippedPreFlight: false,
    operationalFailure: input.operationalFailureCategory
      ? {
          category: input.operationalFailureCategory,
          message: "Production operational failure",
        }
      : undefined,
  });
}

export function buildProductionPerformanceRecord(
  input: ProductionEvidenceInput,
): ModelPerformanceRecord {
  const v = input.validation;
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

  const outcome = productionOutcome(input);

  let reliabilityStatus: ReliabilityStatus = "success";
  if (input.operationalFailureCategory) {
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

  const ranArtifactEvaluation = v.provenance.some(
    (p) => p.field === "artifactEvaluatorId",
  );
  const ranEvaluationPlane = v.provenance.some(
    (p) => p.field === "evaluationPlaneId",
  );

  return Object.freeze({
    performanceRecordId: input.createId("perfrec"),
    benchmarkId: PRODUCTION_BENCHMARK_ID,
    benchmarkVersion: PRODUCTION_BENCHMARK_VERSION,
    executionId: input.productionExecutionId,
    attemptId: input.attemptId,
    providerId: input.providerId,
    modelId: input.modelId,
    modelVersion: input.modelVersion,
    capabilityId: input.capabilityId,
    requiredCapabilityId: input.capabilityId,
    organizationId: input.organizationId,
    service: input.service,
    subtype: input.subtype,
    outputKind: input.outputKind,
    industry: input.industry,
    complexity: input.complexity ?? "medium",
    platform: input.platform,
    format: input.format,
    contractId: v.contractId,
    contractVersion: v.contractVersion,
    effectiveContractId: v.effectiveContractId,
    strategyId: input.strategyId,
    strategyVersion: input.strategyVersion,
    knowledgeVersion: input.knowledgeVersion,
    ...(input.knowledgeId ? { knowledgeId: input.knowledgeId } : {}),
    ...(input.knowledgeFingerprint ? { knowledgeFingerprint: input.knowledgeFingerprint } : {}),
    evidenceSource: PRODUCTION_EVIDENCE_DEFAULTS.evidenceSource,
    evidenceMode: PRODUCTION_EVIDENCE_DEFAULTS.evidenceMode,
    requestId: input.requestId,
    productionExecutionId: input.productionExecutionId,
    ...(input.routingMode ? { routingMode: input.routingMode } : { routingMode: "static" as const }),
    ...(input.routingPolicyId ? { routingPolicyId: input.routingPolicyId } : {}),
    ...(input.routingPolicyVersion ? { routingPolicyVersion: input.routingPolicyVersion } : {}),
    ...(input.adaptiveDecisionId ? { adaptiveDecisionId: input.adaptiveDecisionId } : {}),
    ...(input.adaptiveSelected != null ? { adaptiveSelected: input.adaptiveSelected } : {}),
    ...(input.adaptiveExecutionSucceeded != null
      ? { adaptiveExecutionSucceeded: input.adaptiveExecutionSucceeded }
      : {}),
    ...(input.fallbackUsed != null ? { fallbackUsed: input.fallbackUsed } : {}),
    evaluatorId: "output_contract_validation",
    evaluatorVersion: OUTPUT_VALIDATOR_RUNTIME_VERSION,
    validationVersion: OUTPUT_VALIDATION_VERSION,
    ...(ranArtifactEvaluation
      ? {
          artifactEvaluatorId: v.provenance.find((p) => p.field === "artifactEvaluatorId")?.value,
          artifactEvaluatorVersion: v.provenance.find(
            (p) => p.field === "artifactEvaluatorVersion",
          )?.value,
        }
      : {}),
    ...(ranEvaluationPlane
      ? {
          evaluationPlaneId: v.provenance.find((p) => p.field === "evaluationPlaneId")?.value,
          evaluationPlaneVersion: v.provenance.find(
            (p) => p.field === "evaluationPlaneVersion",
          )?.value,
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
    repairCount: 0,
    initialQualityScore: v.overallScore,
    finalQualityScore: v.overallScore,
    latencyMs: input.latencyMs,
    modelLatencyMs: input.modelLatencyMs,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    totalTokens: input.totalTokens,
    estimatedCost: input.estimatedCost,
    costAvailable: input.estimatedCost != null,
    reliabilityStatus,
    operationalFailureCategory: input.operationalFailureCategory,
    benchmarkOutcome: outcome,
    executionProfileId: BENCHMARK_EXECUTOR_PROFILE.profileId,
    executionProfileVersion: BENCHMARK_EXECUTOR_PROFILE.profileVersion,
    executionInterfacesProvided: BENCHMARK_EXECUTOR_PROFILE.interfaces,
    executionInterfacesRequired: [],
    validForModelComparison: false,
    qualityScoreInterpretation: interpretQualityScore({
      outcome,
      qualityScore: v.overallScore,
      completionAllowed: v.completionAllowed,
      validity: {
        task: "production",
        requiredCapabilityId: input.capabilityId,
        requiredModality: "text",
        requiresStructuredOutput: false,
        requiredExecutionInterfaces: [],
        expectedOutputForm: "",
        contractOutputKind: input.outputKind,
        validationMethods: [],
        intent: "observational",
        validForPureModelComparison: false,
        architectureNote: "Production observational — excluded from controlled comparison",
      },
    }),
    failureCategories: Object.freeze(failureCategories),
    requirementStatuses: Object.freeze(requirementStatuses),
    recordedAt: input.nowIso(),
    provenance: Object.freeze([
      { field: "evidenceSource", value: PRODUCTION_EVIDENCE_DEFAULTS.evidenceSource },
      { field: "evidenceMode", value: PRODUCTION_EVIDENCE_DEFAULTS.evidenceMode },
      { field: "benchmarkId", value: PRODUCTION_BENCHMARK_ID },
      { field: "benchmarkVersion", value: PRODUCTION_BENCHMARK_VERSION },
      { field: "contractVersion", value: v.contractVersion },
      { field: "strategyId", value: input.strategyId },
      { field: "strategyVersion", value: input.strategyVersion },
      { field: "evaluatorVersion", value: OUTPUT_VALIDATOR_RUNTIME_VERSION },
      { field: "benchmarkOutcome", value: outcome },
      ...(input.requestId ? [{ field: "requestId", value: input.requestId }] : []),
      ...(input.routingMode ? [{ field: "routingMode", value: input.routingMode }] : []),
      ...(input.adaptiveDecisionId
        ? [{ field: "adaptiveDecisionId", value: input.adaptiveDecisionId }]
        : []),
      ...(input.knowledgeVersion
        ? [{ field: "knowledgeVersion", value: input.knowledgeVersion }]
        : []),
      ...(input.knowledgeId ? [{ field: "knowledgeId", value: input.knowledgeId }] : []),
      ...(input.knowledgeFingerprint
        ? [{ field: "knowledgeFingerprint", value: input.knowledgeFingerprint }]
        : []),
      ...(input.modelVersion ? [{ field: "modelVersion", value: input.modelVersion }] : []),
      ...(input.mediaArtifactIds?.length
        ? [{ field: "mediaArtifactIds", value: input.mediaArtifactIds.join(",") }]
        : []),
      ...(ranEvaluationPlane
        ? v.provenance.filter(
            (p) =>
              p.field === "evaluationPlaneId" ||
              p.field === "evaluationPlaneVersion" ||
              p.field === "artifactEvaluatorId" ||
              p.field === "artifactEvaluatorVersion",
          )
        : []),
    ]),
  });
}
