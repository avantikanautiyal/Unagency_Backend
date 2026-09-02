/**
 * Step 16 — Production execution integrity verification (observability only).
 * Ensures lifecycle records are internally consistent before evidence ingestion.
 */

import {
  resolveServiceOutputSpec,
  type ServiceOutputKind,
} from "../../config/service-output-map";
import type { ExecutionTraceStage, ExecutionTraceState } from "./execution-trace";
import { sanitizeOsLogFields } from "./execution-log";

export const EXECUTION_INTEGRITY_PREFIX = "[UNAGENCY-EXECUTION-INTEGRITY]" as const;

export type ProductionIntegrityFailureCategory =
  | "CLASSIFICATION_MISMATCH"
  | "OUTPUT_KIND_MISMATCH"
  | "CAPABILITY_MISMATCH"
  | "PROVIDER_IDENTITY_MISMATCH"
  | "STRUCTURED_OUTPUT_FAILURE"
  | "MATERIALIZATION_FAILURE"
  | "ARTIFACT_PERSISTENCE_FAILURE"
  | "ARTIFACT_HYDRATION_FAILURE"
  | "EVALUATION_FAILURE"
  | "STEP2_VALIDATION_FAILURE"
  | "EVIDENCE_PERSISTENCE_FAILURE"
  | "TRACE_INCONSISTENCY";

export type StageOutcomeStatus = "COMPLETED" | "FAILED" | "SKIPPED" | "NOT_TRACED";

export type ProductionExecutionIntegrityResult = {
  readonly executionId: string;
  readonly correlationId: string;
  readonly service: string;
  readonly subtype: string;
  readonly outputKind: string;
  readonly requestedProvider?: string;
  readonly requestedModel?: string;
  readonly selectedProvider?: string;
  readonly selectedModel?: string;
  readonly actualProvider?: string;
  readonly actualModel?: string;
  readonly fallbackProvider?: string;
  readonly fallbackModel?: string;
  readonly fallbackUsed: boolean;
  readonly fallbackReason?: string;
  readonly structuredOutputStatus: StageOutcomeStatus;
  readonly materializationStatus: StageOutcomeStatus;
  readonly artifactPersisted: boolean;
  readonly artifactHydrated: boolean;
  readonly artifactEvaluated: boolean;
  readonly evaluationPlaneStatus: StageOutcomeStatus;
  readonly step2Status: StageOutcomeStatus;
  readonly qualityGateStatus: StageOutcomeStatus;
  readonly performanceRecordStatus: StageOutcomeStatus;
  readonly integrityStatus: "PASS" | "FAIL";
  readonly failureCategory?: ProductionIntegrityFailureCategory;
  readonly failureReason?: string;
  readonly artifactIds: readonly string[];
  readonly integrityFailures: readonly ProductionIntegrityFailureCategory[];
};

export type ProviderIdentitySnapshot = {
  readonly requestedProviderId?: string;
  readonly requestedModelId?: string;
  readonly selectedProviderId?: string;
  readonly selectedModelId?: string;
  readonly actualProviderId?: string;
  readonly actualModelId?: string;
  readonly fallbackProviderId?: string;
  readonly fallbackModelId?: string;
  readonly fallbackUsed?: boolean;
  readonly fallbackReason?: string;
};

export type BuildProductionIntegrityInput = {
  readonly executionId: string;
  readonly correlationId: string;
  readonly service: string;
  readonly subtype: string;
  readonly outputKind: string;
  readonly capabilityId?: string;
  readonly providerIdentity: ProviderIdentitySnapshot;
  readonly trace?: ExecutionTraceState;
  readonly structuredOutputRequested?: boolean;
  readonly structuredDataPresent?: boolean;
  readonly mediaArtifactIds?: readonly string[];
  readonly performanceRecordId?: string;
  readonly evidenceRecorded?: boolean;
  readonly validationExecuted?: boolean;
  readonly evaluationPlaneExecuted?: boolean;
  readonly artifactHydrated?: boolean;
  readonly artifactEvaluated?: boolean;
};

function stageOutcome(
  stages: readonly { readonly stage: ExecutionTraceStage; readonly status: string }[],
  stage: ExecutionTraceStage,
): StageOutcomeStatus {
  const hit = stages.filter((s) => s.stage === stage).pop();
  if (!hit) return "NOT_TRACED";
  if (hit.status === "COMPLETED") return "COMPLETED";
  if (hit.status === "FAILED") return "FAILED";
  return "SKIPPED";
}

export function resolveActualProviderIdentity(
  jobSummary: Readonly<Record<string, unknown>>,
): ProviderIdentitySnapshot {
  const actualProviderId = firstString(
    jobSummary.actualProviderId,
    jobSummary.providerId,
    jobSummary.provider,
  );
  const actualModelId = firstString(jobSummary.actualModelId, jobSummary.modelId, jobSummary.model);
  const routedProviderId = firstString(jobSummary.routedProviderId);
  const routedModelId = firstString(jobSummary.routedModelId);
  const fallbackUsed = jobSummary.fallbackUsed === true;
  const fallbackProviderId = firstString(jobSummary.fallbackProviderId);
  const fallbackModelId = firstString(jobSummary.fallbackModelId);
  const fallbackReason =
    typeof jobSummary.fallbackReason === "string" ? jobSummary.fallbackReason : undefined;

  return Object.freeze({
    requestedProviderId: undefined,
    requestedModelId: undefined,
    selectedProviderId: routedProviderId,
    selectedModelId: routedModelId,
    actualProviderId,
    actualModelId,
    fallbackProviderId: fallbackUsed ? fallbackProviderId ?? actualProviderId : undefined,
    fallbackModelId: fallbackUsed ? fallbackModelId ?? actualModelId : undefined,
    fallbackUsed,
    fallbackReason,
  });
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export function verifyOutputKindConsistency(input: {
  readonly service: string;
  readonly subtype: string;
  readonly declaredOutputKind?: string;
  readonly capabilityId?: string;
}): ProductionIntegrityFailureCategory | undefined {
  const spec = resolveServiceOutputSpec({
    service: input.service,
    subtype: input.subtype,
  });
  const declared = input.declaredOutputKind?.trim();
  if (declared && spec.kind !== "dynamic" && declared !== spec.kind) {
    return "OUTPUT_KIND_MISMATCH";
  }
  const capability = input.capabilityId ?? "";
  if (
    spec.kind === "image" &&
    capability &&
    !capability.includes("image") &&
    !capability.includes("text")
  ) {
    return "CAPABILITY_MISMATCH";
  }
  if (
    (spec.kind === "video" || spec.kind === "animation") &&
    capability &&
    !capability.includes("video")
  ) {
    return "CAPABILITY_MISMATCH";
  }
  return undefined;
}

export function verifyProviderIdentityConsistency(
  identity: ProviderIdentitySnapshot,
): ProductionIntegrityFailureCategory | undefined {
  const actualProvider = identity.actualProviderId;
  const selectedProvider = identity.selectedProviderId;
  if (!actualProvider) return undefined;
  if (
    selectedProvider &&
    actualProvider !== selectedProvider &&
    !identity.fallbackUsed
  ) {
    return "PROVIDER_IDENTITY_MISMATCH";
  }
  return undefined;
}

export function verifyArtifactIdentityContinuity(input: {
  readonly executionArtifactIds?: readonly string[];
  readonly persistedArtifactIds?: readonly string[];
  readonly hydratedArtifactIds?: readonly string[];
  readonly evaluationArtifactIds?: readonly string[];
  readonly recordArtifactIds?: readonly string[];
}): ProductionIntegrityFailureCategory | undefined {
  const executionIds = input.executionArtifactIds ?? [];
  const persistedIds = input.persistedArtifactIds ?? executionIds;
  if (executionIds.length > 0 && persistedIds.length === 0) {
    return "ARTIFACT_PERSISTENCE_FAILURE";
  }
  if (executionIds.length > 0 && persistedIds.length > 0) {
    const persistedSet = new Set(persistedIds);
    for (const id of executionIds) {
      if (!persistedSet.has(id)) return "ARTIFACT_PERSISTENCE_FAILURE";
    }
  }
  const hydratedIds = input.hydratedArtifactIds;
  if (hydratedIds && persistedIds.length > 0 && hydratedIds.length === 0) {
    return "ARTIFACT_HYDRATION_FAILURE";
  }
  if (hydratedIds && hydratedIds.length > 0) {
    const persistedSet = new Set(persistedIds);
    for (const id of hydratedIds) {
      if (!persistedSet.has(id)) return "ARTIFACT_HYDRATION_FAILURE";
    }
  }
  const recordIds = input.recordArtifactIds;
  if (recordIds && executionIds.length > 0) {
    const executionSet = new Set(executionIds);
    for (const id of recordIds) {
      if (!executionSet.has(id)) return "TRACE_INCONSISTENCY";
    }
  }
  return undefined;
}

export function verifyTraceStageConsistency(
  trace: ExecutionTraceState | undefined,
): readonly ProductionIntegrityFailureCategory[] {
  if (!trace) return Object.freeze([]);
  const failures: ProductionIntegrityFailureCategory[] = [];
  const stages = trace.stages;

  const evaluationPlane = stageOutcome(stages, "evaluation_plane");
  const step2 = stageOutcome(stages, "step2_validation");
  const hydration = stageOutcome(stages, "artifact_hydration");
  const structured = stageOutcome(stages, "structured_output");
  const materialization = stageOutcome(stages, "os_materialization");
  const persistence = stageOutcome(stages, "artifact_persistence");
  const evidence = stageOutcome(stages, "production_evidence");
  const perfRecord = stageOutcome(stages, "model_performance_record");

  if (trace.usedEvaluationPlane && evaluationPlane !== "COMPLETED") {
    failures.push("TRACE_INCONSISTENCY");
  }
  if (trace.usedStep2Validation && step2 !== "COMPLETED") {
    failures.push("TRACE_INCONSISTENCY");
  }
  if (
    (trace.artifactIds?.length ?? 0) > 0 &&
    persistence === "FAILED"
  ) {
    failures.push("ARTIFACT_PERSISTENCE_FAILURE");
  }
  if (
    hydration === "COMPLETED" &&
    (trace.artifactIds?.length ?? 0) === 0
  ) {
    failures.push("TRACE_INCONSISTENCY");
  }
  if (
    structured === "FAILED" &&
    trace.usedStructuredOutput
  ) {
    failures.push("STRUCTURED_OUTPUT_FAILURE");
  }
  if (materialization === "FAILED" && trace.usedOsArtifactPipeline) {
    failures.push("MATERIALIZATION_FAILURE");
  }
  if (evidence === "FAILED") {
    failures.push("EVIDENCE_PERSISTENCE_FAILURE");
  }
  if (perfRecord === "FAILED" && trace.usedProductionEvidence) {
    failures.push("EVIDENCE_PERSISTENCE_FAILURE");
  }
  return Object.freeze(failures);
}

export function buildProductionExecutionIntegrity(
  input: BuildProductionIntegrityInput,
): ProductionExecutionIntegrityResult {
  const stages = input.trace?.stages ?? [];
  const structuredOutputStatus = input.structuredOutputRequested
    ? input.structuredDataPresent
      ? stageOutcome(stages, "structured_output")
      : "FAILED"
    : stageOutcome(stages, "structured_output");
  const materializationStatus = stageOutcome(stages, "os_materialization");
  const evaluationPlaneStatus = stageOutcome(stages, "evaluation_plane");
  const step2Status = input.validationExecuted
    ? stageOutcome(stages, "step2_validation")
    : input.validationExecuted === false
      ? "SKIPPED"
      : stageOutcome(stages, "step2_validation");
  const qualityGateStatus = stageOutcome(stages, "quality_gate");
  const performanceRecordStatus = input.performanceRecordId
    ? "COMPLETED"
    : input.evidenceRecorded === false
      ? "FAILED"
      : stageOutcome(stages, "model_performance_record");

  const artifactIds = input.mediaArtifactIds ?? input.trace?.artifactIds ?? [];
  const artifactPersisted =
    stageOutcome(stages, "artifact_persistence") === "COMPLETED" ||
    (artifactIds.length > 0 &&
      stageOutcome(stages, "artifact_persistence") !== "FAILED");
  const artifactHydrated =
    input.artifactHydrated ??
    stageOutcome(stages, "artifact_hydration") === "COMPLETED";
  const artifactEvaluated =
    input.artifactEvaluated ??
    (evaluationPlaneStatus === "COMPLETED" && artifactHydrated);

  const integrityFailures: ProductionIntegrityFailureCategory[] = [
    ...verifyTraceStageConsistency(input.trace),
  ];

  const outputKindFailure = verifyOutputKindConsistency({
    service: input.service,
    subtype: input.subtype,
    declaredOutputKind: input.outputKind,
    capabilityId: input.capabilityId,
  });
  if (outputKindFailure) integrityFailures.push(outputKindFailure);

  const providerFailure = verifyProviderIdentityConsistency(input.providerIdentity);
  if (providerFailure) integrityFailures.push(providerFailure);

  const artifactFailure = verifyArtifactIdentityContinuity({
    executionArtifactIds: artifactIds,
    persistedArtifactIds: artifactIds,
    hydratedArtifactIds: artifactHydrated ? artifactIds : [],
    recordArtifactIds: artifactIds,
  });
  if (artifactFailure) integrityFailures.push(artifactFailure);

  if (structuredOutputStatus === "FAILED") {
    integrityFailures.push("STRUCTURED_OUTPUT_FAILURE");
  }
  if (materializationStatus === "FAILED") {
    integrityFailures.push("MATERIALIZATION_FAILURE");
  }
  if (evaluationPlaneStatus === "FAILED") {
    integrityFailures.push("EVALUATION_FAILURE");
  }
  if (step2Status === "FAILED") {
    integrityFailures.push("STEP2_VALIDATION_FAILURE");
  }
  if (performanceRecordStatus === "FAILED") {
    integrityFailures.push("EVIDENCE_PERSISTENCE_FAILURE");
  }

  const uniqueFailures = Object.freeze([...new Set(integrityFailures)]);
  const integrityStatus = uniqueFailures.length === 0 ? "PASS" : "FAIL";
  const failureCategory = uniqueFailures[0];
  const failureReason = failureCategory
    ? describeIntegrityFailure(failureCategory, input)
    : undefined;

  return Object.freeze({
    executionId: input.executionId,
    correlationId: input.correlationId,
    service: input.service,
    subtype: input.subtype,
    outputKind: input.outputKind,
    requestedProvider: input.providerIdentity.requestedProviderId,
    requestedModel: input.providerIdentity.requestedModelId,
    selectedProvider: input.providerIdentity.selectedProviderId,
    selectedModel: input.providerIdentity.selectedModelId,
    actualProvider: input.providerIdentity.actualProviderId,
    actualModel: input.providerIdentity.actualModelId,
    fallbackProvider: input.providerIdentity.fallbackProviderId,
    fallbackModel: input.providerIdentity.fallbackModelId,
    fallbackUsed: input.providerIdentity.fallbackUsed === true,
    fallbackReason: input.providerIdentity.fallbackReason,
    structuredOutputStatus,
    materializationStatus,
    artifactPersisted,
    artifactHydrated,
    artifactEvaluated,
    evaluationPlaneStatus,
    step2Status,
    qualityGateStatus,
    performanceRecordStatus,
    integrityStatus,
    failureCategory,
    failureReason,
    artifactIds: Object.freeze([...artifactIds]),
    integrityFailures: uniqueFailures,
  });
}

function describeIntegrityFailure(
  category: ProductionIntegrityFailureCategory,
  input: BuildProductionIntegrityInput,
): string {
  switch (category) {
    case "OUTPUT_KIND_MISMATCH":
      return `declared outputKind=${input.outputKind} disagrees with service/subtype catalog`;
    case "PROVIDER_IDENTITY_MISMATCH":
      return `actual provider ${input.providerIdentity.actualProviderId} differs from selected ${input.providerIdentity.selectedProviderId} without fallbackUsed`;
    case "TRACE_INCONSISTENCY":
      return "execution trace stages disagree with recorded lifecycle facts";
    case "STRUCTURED_OUTPUT_FAILURE":
      return "structured output requested but missing or failed";
    case "EVIDENCE_PERSISTENCE_FAILURE":
      return "ModelPerformanceRecord was not persisted";
    default:
      return category;
  }
}

export function logProductionExecutionIntegrity(
  result: ProductionExecutionIntegrityResult,
): void {
  try {
    const safe = sanitizeOsLogFields({
      executionId: result.executionId,
      correlationId: result.correlationId,
      service: result.service,
      subtype: result.subtype,
      outputKind: result.outputKind,
      requestedModel: [result.requestedProvider, result.requestedModel].filter(Boolean).join("/") || "unknown",
      selectedModel: [result.selectedProvider, result.selectedModel].filter(Boolean).join("/") || "unknown",
      actualModel: [result.actualProvider, result.actualModel].filter(Boolean).join("/") || "unknown",
      fallbackUsed: result.fallbackUsed,
      fallbackReason: result.fallbackReason,
      structuredOutput: result.structuredOutputStatus,
      materialization: result.materializationStatus,
      artifact: result.artifactIds.length > 0 ? "CREATED" : "MISSING",
      artifactIds: result.artifactIds.join(",") || "none",
      persisted: result.artifactPersisted,
      hydrated: result.artifactHydrated ? "COMPLETED" : "SKIPPED",
      evaluated: result.artifactEvaluated ? "COMPLETED" : "SKIPPED",
      evaluation: result.evaluationPlaneStatus,
      step2: result.step2Status,
      qualityGate: result.qualityGateStatus,
      evidence: result.performanceRecordStatus === "COMPLETED" ? "RECORDED" : "NOT_RECORDED",
      status: result.integrityStatus,
      failureCategory: result.failureCategory,
      failureReason: result.failureReason,
    });
    console.log(`${EXECUTION_INTEGRITY_PREFIX} ${JSON.stringify(safe)}`);
  } catch {
    // Observability must never break execution.
  }
}

export function mergeProviderIdentityFromTrace(
  trace: ExecutionTraceState | undefined,
  jobIdentity: ProviderIdentitySnapshot,
): ProviderIdentitySnapshot {
  if (!trace) return jobIdentity;
  return Object.freeze({
    requestedProviderId: trace.requestedProviderId ?? jobIdentity.requestedProviderId,
    requestedModelId: trace.requestedModelId ?? jobIdentity.requestedModelId,
    selectedProviderId: trace.selectedProviderId ?? jobIdentity.selectedProviderId,
    selectedModelId: trace.selectedModelId ?? jobIdentity.selectedModelId,
    actualProviderId: trace.actualProviderId ?? jobIdentity.actualProviderId,
    actualModelId: trace.actualModelId ?? jobIdentity.actualModelId,
    fallbackProviderId: trace.fallbackProviderId ?? jobIdentity.fallbackProviderId,
    fallbackModelId: trace.fallbackModelId ?? jobIdentity.fallbackModelId,
    fallbackUsed: trace.fallbackUsed ?? jobIdentity.fallbackUsed,
    fallbackReason: trace.fallbackReason ?? jobIdentity.fallbackReason,
  });
}
