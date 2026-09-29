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
import { isCdfCanonicalArtifactId } from "../../cdf/artifacts/ids";
import { isStructuralCompletionBlocked } from "../../cdf/generation-validation/structural-completion-authority";

export const EXECUTION_INTEGRITY_PREFIX = "[UNAGENCY-EXECUTION-INTEGRITY]" as const;

export type ProductionIntegrityFailureCategory =
  | "CLASSIFICATION_MISMATCH"
  | "OUTPUT_KIND_MISMATCH"
  | "CAPABILITY_MISMATCH"
  | "PROVIDER_IDENTITY_MISMATCH"
  | "PROVIDER_EXECUTION_FAILURE"
  | "STRUCTURAL_COMPLIANCE_FAILURE"
  | "CANONICAL_COMPLETION_BLOCKED"
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
  readonly integrityStatus: "PASS" | "FAIL" | "INCOMPLETE";
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
  /**
   * Independently sourced artifact ID stages for continuity checks.
   * Do NOT pass the same array into every field — that self-validates.
   */
  readonly executionArtifactIds?: readonly string[];
  readonly persistedArtifactIds?: readonly string[];
  readonly hydratedArtifactIds?: readonly string[];
  readonly evaluationArtifactIds?: readonly string[];
  readonly recordArtifactIds?: readonly string[];
  /**
   * When true, empty mediaArtifactIds may still PASS (text-only / no-media).
   * Default false: missing artifacts with no independent continuity → INCOMPLETE.
   */
  readonly allowMissingArtifacts?: boolean;
  readonly performanceRecordId?: string;
  readonly evidenceRecorded?: boolean;
  readonly validationExecuted?: boolean;
  readonly evaluationPlaneExecuted?: boolean;
  readonly artifactHydrated?: boolean;
  readonly artifactEvaluated?: boolean;
  /**
   * When false, missing structured output / artifacts are INCOMPLETE (observational),
   * never FAIL — provider has not finished. Default true for backward-compat callers
   * that only invoke integrity after terminal completion.
   */
  readonly providerLifecycleComplete?: boolean;
  /**
   * When false, terminal provider/runtime failure (e.g. HTTP 429). Distinct from
   * in-flight incomplete and from successful-but-ingest-pending.
   * Default undefined/true — omit when provider outcome is not known.
   */
  readonly providerSuccess?: boolean;
  /** Optional create metadata for CDF authority-aware integrity checks. */
  readonly metadata?: Readonly<Record<string, unknown>>;
};

/**
 * Generic continuity evidence for canonical CDF phases.
 * Exact ArtifactVersion X@V + generatedArtifacts bind — not art_* media IDs.
 */
export type CanonicalCdfContinuityEvidence = {
  readonly artifactId: string;
  readonly artifactVersion: number;
  readonly generatedArtifactsBound: boolean;
  readonly artifactKey?: string;
  readonly sessionId?: string;
  readonly phaseId?: string;
};

export function resolveCanonicalCdfContinuityEvidence(
  metadata?: Readonly<Record<string, unknown>>,
): CanonicalCdfContinuityEvidence | undefined {
  if (!metadata) return undefined;
  const artifactId =
    typeof metadata.cdfArtifactId === "string"
      ? metadata.cdfArtifactId.trim()
      : "";
  if (!artifactId || !isCdfCanonicalArtifactId(artifactId)) return undefined;
  const versionRaw = metadata.cdfArtifactVersion;
  const artifactVersion =
    typeof versionRaw === "number"
      ? versionRaw
      : typeof versionRaw === "string" && /^\d+$/.test(versionRaw.trim())
        ? Number(versionRaw.trim())
        : NaN;
  if (!Number.isInteger(artifactVersion) || artifactVersion < 1) return undefined;

  const generatedArtifactsBound =
    metadata.cdfGeneratedArtifactsBound === true ||
    metadata.cdfCanonicalCompletionEstablished === true;

  return Object.freeze({
    artifactId,
    artifactVersion,
    generatedArtifactsBound,
    artifactKey:
      typeof metadata.cdfArtifactKey === "string"
        ? metadata.cdfArtifactKey
        : undefined,
    sessionId:
      typeof metadata.cdfSessionId === "string"
        ? metadata.cdfSessionId
        : undefined,
    phaseId:
      typeof metadata.cdfPhaseId === "string" ? metadata.cdfPhaseId : undefined,
  });
}

/** True when canonical CDF completion continuity is established (ingest + bind). */
export function hasCanonicalCdfContinuityEvidence(
  metadata?: Readonly<Record<string, unknown>>,
): boolean {
  const evidence = resolveCanonicalCdfContinuityEvidence(metadata);
  return evidence?.generatedArtifactsBound === true;
}

function stageOutcome(
  stages: readonly { readonly stage: ExecutionTraceStage; readonly status: string }[],
  stage: ExecutionTraceStage,
): StageOutcomeStatus {
  const hit = stages.filter((s) => s.stage === stage).pop();
  if (!hit) return "NOT_TRACED";
  if (hit.status === "COMPLETED") return "COMPLETED";
  if (hit.status === "FAILED") return "FAILED";
  // NOT_APPLICABLE is observational success for non-media modalities.
  if (hit.status === "NOT_APPLICABLE") return "SKIPPED";
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
  readonly metadata?: Readonly<Record<string, unknown>>;
}): ProductionIntegrityFailureCategory | undefined {
  const spec = resolveServiceOutputSpec({
    service: input.service,
    subtype: input.subtype,
  });
  // CDF sealed authority wins over product catalog (observability must not
  // reclassify a successful CDF execution against the pre-CDF subtype map).
  const cdfSealed = input.metadata?.cdfExecutionAuthorityApplied === true;
  const stampedKind =
    typeof input.metadata?.cdfAuthorityOutputKind === "string"
      ? input.metadata.cdfAuthorityOutputKind.trim()
      : "";
  const authoritative = cdfSealed && stampedKind ? stampedKind : undefined;
  const expected = authoritative || spec.kind;
  const declared = input.declaredOutputKind?.trim();
  if (declared && expected !== "dynamic" && declared !== expected) {
    // Sealed CDF executions: catalog disagreement is diagnostic only — never FAIL.
    if (cdfSealed) {
      return undefined;
    }
    return "OUTPUT_KIND_MISMATCH";
  }
  const capability = input.capabilityId ?? "";
  if (
    expected === "image" &&
    capability &&
    !capability.includes("image") &&
    !capability.includes("text")
  ) {
    return "CAPABILITY_MISMATCH";
  }
  if (
    (expected === "video" || expected === "animation") &&
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
  // Never default persisted/hydrated/record to executionIds — that self-validates.
  const persistedIds = input.persistedArtifactIds;
  if (executionIds.length > 0 && persistedIds && persistedIds.length === 0) {
    return "ARTIFACT_PERSISTENCE_FAILURE";
  }
  if (executionIds.length > 0 && persistedIds && persistedIds.length > 0) {
    const persistedSet = new Set(persistedIds);
    for (const id of executionIds) {
      if (!persistedSet.has(id)) return "ARTIFACT_PERSISTENCE_FAILURE";
    }
  }
  const hydratedIds = input.hydratedArtifactIds;
  if (
    hydratedIds &&
    persistedIds &&
    persistedIds.length > 0 &&
    hydratedIds.length === 0
  ) {
    return "ARTIFACT_HYDRATION_FAILURE";
  }
  if (hydratedIds && hydratedIds.length > 0 && persistedIds) {
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
  const providerComplete = input.providerLifecycleComplete !== false;
  const structuredOutputStatus = !providerComplete
    ? input.structuredDataPresent
      ? "COMPLETED"
      : input.structuredOutputRequested
        ? "SKIPPED"
        : stageOutcome(stages, "structured_output")
    : input.structuredOutputRequested
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
    metadata: input.metadata,
  });
  if (outputKindFailure) integrityFailures.push(outputKindFailure);

  const providerFailure = verifyProviderIdentityConsistency(input.providerIdentity);
  if (providerFailure) integrityFailures.push(providerFailure);

  // Continuity checks only when independently sourced stage ID lists are provided.
  // Never copy mediaArtifactIds into every stage (self-validating).
  const executionArtifactIds =
    input.executionArtifactIds ?? artifactIds;
  const persistedArtifactIds = input.persistedArtifactIds;
  const hydratedArtifactIds = input.hydratedArtifactIds;
  const recordArtifactIds = input.recordArtifactIds;
  const artifactFailure = verifyArtifactIdentityContinuity({
    executionArtifactIds,
    ...(persistedArtifactIds ? { persistedArtifactIds } : {}),
    ...(hydratedArtifactIds ? { hydratedArtifactIds } : {}),
    ...(recordArtifactIds ? { recordArtifactIds } : {}),
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
  const hasIndependentContinuity =
    input.persistedArtifactIds !== undefined ||
    input.hydratedArtifactIds !== undefined ||
    input.recordArtifactIds !== undefined ||
    input.evaluationArtifactIds !== undefined;
  const cdfContinuity = resolveCanonicalCdfContinuityEvidence(input.metadata);
  const cdfCanonicalCompletion =
    cdfContinuity?.generatedArtifactsBound === true;
  // Structural plane fails integrity only when it actually withheld canonical
  // completion — a warning on an established cdfart_*@V is not a failure.
  const structuralComplianceBlocked = isStructuralCompletionBlocked(
    input.metadata,
  );
  const canonicalCompletionBlocked =
    !structuralComplianceBlocked &&
    input.trace?.canonicalCompletionBlocked === true;
  const completionBlocked =
    structuralComplianceBlocked || canonicalCompletionBlocked;
  // Provider plane: completion-gate rejection does not mean provider dispatch failed.
  const providerFailed =
    input.providerSuccess === false && !completionBlocked;
  let integrityStatus: "PASS" | "FAIL" | "INCOMPLETE";
  // Observational: never FAIL before provider lifecycle completes.
  if (!providerComplete) {
    integrityStatus = "INCOMPLETE";
  } else if (completionBlocked) {
    integrityStatus = "FAIL";
  } else if (providerFailed) {
    integrityStatus = "FAIL";
  } else if (uniqueFailures.length > 0) {
    integrityStatus = "FAIL";
  } else if (cdfCanonicalCompletion) {
    // Canonical CDF: ingest accepted + exact cdfart_* X@V bound is continuity.
    // Do not require legacy independent media-ID arrays.
    integrityStatus = "PASS";
  } else if (
    !input.allowMissingArtifacts &&
    artifactIds.length === 0 &&
    !hasIndependentContinuity
  ) {
    // Observed false-PASS: artifact=MISSING, hydrated/evaluated SKIPPED, status=PASS.
    // Includes: successful provider + no canonical artifact (ingest pending).
    // Includes: cdfart present in metadata but not session-bound.
    integrityStatus = "INCOMPLETE";
  } else if (
    artifactIds.length > 0 &&
    !hasIndependentContinuity &&
    !input.allowMissingArtifacts
  ) {
    // Claimed media IDs without independently sourced persistence/hydration evidence.
    // art_* alone is never canonical CDF continuity.
    integrityStatus = "INCOMPLETE";
  } else {
    integrityStatus = "PASS";
  }
  const failureCategory =
    !providerComplete ||
    (uniqueFailures.length === 0 &&
      !providerFailed &&
      !completionBlocked)
      ? undefined
      : structuralComplianceBlocked
        ? "STRUCTURAL_COMPLIANCE_FAILURE"
        : canonicalCompletionBlocked
          ? "CANONICAL_COMPLETION_BLOCKED"
          : providerFailed
            ? "PROVIDER_EXECUTION_FAILURE"
            : uniqueFailures[0];
  const failureReason = !providerComplete
    ? "Provider lifecycle incomplete — integrity observational only"
    : structuralComplianceBlocked
      ? "Provider generated media but structural composition compliance blocked canonical completion"
      : canonicalCompletionBlocked
      ? `Provider succeeded but canonical ingest blocked completion (${input.trace?.canonicalCompletionBlockReason ?? "unknown"})`
      : providerFailed
      ? "Provider/runtime execution failed"
      : failureCategory
      ? describeIntegrityFailure(failureCategory, input)
      : integrityStatus === "INCOMPLETE"
        ? cdfContinuity && !cdfCanonicalCompletion
          ? "Canonical ArtifactVersion present without generatedArtifacts session bind"
          : artifactIds.length === 0
          ? "Artifact continuity incomplete: no artifact IDs and no independent stage evidence"
          : "Artifact continuity incomplete: media IDs present without independent persistence/hydration evidence"
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
    // Do not surface terminal failure categories before provider completion.
    integrityFailures: Object.freeze(
      !providerComplete
        ? ([] as ProductionIntegrityFailureCategory[])
        : structuralComplianceBlocked
          ? ([
              "STRUCTURAL_COMPLIANCE_FAILURE",
              ...uniqueFailures,
            ] as ProductionIntegrityFailureCategory[])
          : canonicalCompletionBlocked
          ? ([
              "CANONICAL_COMPLETION_BLOCKED",
              ...uniqueFailures,
            ] as ProductionIntegrityFailureCategory[])
          : providerFailed
            ? ([
                "PROVIDER_EXECUTION_FAILURE",
                ...uniqueFailures,
              ] as ProductionIntegrityFailureCategory[])
            : [...uniqueFailures],
    ),
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
    case "PROVIDER_EXECUTION_FAILURE":
      return "Provider/runtime execution failed";
    case "STRUCTURAL_COMPLIANCE_FAILURE":
      return "Provider generated media but structural composition compliance blocked canonical completion";
    case "CANONICAL_COMPLETION_BLOCKED":
      return `Provider succeeded but canonical ingest blocked completion (${input.trace?.canonicalCompletionBlockReason ?? "unknown"})`;
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
      artifact: (() => {
        if (result.artifactIds.length > 0) return "CREATED";
        // Structured/text PASS with zero media IDs is N/A — not MISSING.
        if (
          result.integrityStatus === "PASS" &&
          (result.structuredOutputStatus === "COMPLETED" ||
            result.structuredOutputStatus === "SKIPPED")
        ) {
          return "NOT_APPLICABLE";
        }
        return "MISSING";
      })(),
      artifactIds: result.artifactIds.join(",") || "none",
      persisted: result.artifactPersisted,
      hydrated: result.artifactHydrated
        ? "COMPLETED"
        : result.integrityStatus === "PASS" && result.artifactIds.length === 0
          ? "NOT_APPLICABLE"
          : "SKIPPED",
      evaluated: result.artifactEvaluated
        ? "COMPLETED"
        : result.integrityStatus === "PASS" && result.artifactIds.length === 0
          ? "NOT_APPLICABLE"
          : "SKIPPED",
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
