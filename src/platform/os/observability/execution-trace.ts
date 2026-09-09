/**
 * Step 14A — Production execution lifecycle trace (observability only).
 * Non-blocking; logging failure must never break user execution.
 */

import { sanitizeOsLogFields } from "./execution-log";

export const EXECUTION_TRACE_PREFIX = "[UNAGENCY-EXECUTION-TRACE]" as const;

export type ExecutionTraceStage =
  | "request_intake"
  | "requirement_resolution"
  | "classification"
  | "static_routing"
  | "adaptive_routing"
  | "provider_selection"
  | "provider_dispatch"
  | "structured_output"
  | "os_materialization"
  | "artifact_persistence"
  | "artifact_hydration"
  | "artifact_render"
  | "runtime_evaluation"
  | "evaluation_plane"
  | "step2_validation"
  | "quality_gate"
  | "production_evidence"
  | "model_performance_record";

export type ExecutionTraceStageStatus = "COMPLETED" | "SKIPPED" | "FAILED";

export type ExecutionTraceStageRecord = {
  readonly stage: ExecutionTraceStage;
  readonly status: ExecutionTraceStageStatus;
  readonly skipReason?: string;
  readonly error?: string;
  readonly at: string;
  readonly details?: Readonly<Record<string, unknown>>;
};

export type ExecutionTraceState = {
  readonly requestId: string;
  readonly executionId: string;
  readonly correlationId: string;
  readonly service?: string;
  readonly subtype?: string;
  readonly outputKind?: string;
  readonly capabilityId?: string;
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
  readonly finalProviderId?: string;
  readonly finalModelId?: string;
  readonly routingMode?: "static" | "adaptive";
  readonly adaptiveRoutingEnabled?: boolean;
  readonly adaptiveDecision?: string;
  readonly adaptiveSkipReason?: string;
  readonly usedStructuredOutput?: boolean;
  readonly usedOsArtifactPipeline?: boolean;
  readonly usedArtifactMaterialization?: boolean;
  readonly usedEvaluationPlane?: boolean;
  readonly usedStep2Validation?: boolean;
  readonly usedProductionEvidence?: boolean;
  readonly artifactIds?: readonly string[];
  readonly contractValidationStatus?: string;
  readonly evaluationStatus?: string;
  readonly evidenceSource?: string;
  readonly evidenceMode?: string;
  readonly performanceRecordId?: string;
  readonly executionStatus?: string;
  readonly finalOutcome?: string;
  readonly qualityScore?: number;
  readonly stages: readonly ExecutionTraceStageRecord[];
};

export type BeginExecutionTraceInput = {
  readonly requestId: string;
  readonly executionId: string;
  readonly correlationId: string;
  readonly service?: string;
  readonly subtype?: string;
  readonly outputKind?: string;
  readonly capabilityId?: string;
  readonly requestedProviderId?: string;
  readonly requestedModelId?: string;
  readonly adaptiveRoutingEnabled?: boolean;
  readonly usedStructuredOutput?: boolean;
  readonly usedOsArtifactPipeline?: boolean;
};

export type RecordExecutionTraceStageInput = {
  readonly executionId: string;
  readonly stage: ExecutionTraceStage;
  readonly status: ExecutionTraceStageStatus;
  readonly skipReason?: string;
  readonly error?: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly nowIso?: () => string;
};

export type UpdateExecutionTraceInput = {
  readonly executionId: string;
  readonly patch: Partial<
    Omit<ExecutionTraceState, "executionId" | "requestId" | "correlationId" | "stages">
  >;
};

const traces = new Map<string, ExecutionTraceState>();

function safeRun(fn: () => void): void {
  try {
    fn();
  } catch {
    // Observability must never break execution.
  }
}

function cloneStages(stages: readonly ExecutionTraceStageRecord[]): ExecutionTraceStageRecord[] {
  return [...stages];
}

export function beginExecutionTrace(input: BeginExecutionTraceInput): void {
  safeRun(() => {
    traces.set(input.executionId, Object.freeze({
      requestId: input.requestId,
      executionId: input.executionId,
      correlationId: input.correlationId,
      service: input.service,
      subtype: input.subtype,
      outputKind: input.outputKind,
      capabilityId: input.capabilityId,
      requestedProviderId: input.requestedProviderId,
      requestedModelId: input.requestedModelId,
      adaptiveRoutingEnabled: input.adaptiveRoutingEnabled ?? false,
      usedStructuredOutput: input.usedStructuredOutput,
      usedOsArtifactPipeline: input.usedOsArtifactPipeline,
      stages: Object.freeze([
        Object.freeze({
          stage: "request_intake" as const,
          status: "COMPLETED" as const,
          at: new Date().toISOString(),
        }),
      ]),
    }));
  });
}

export function recordExecutionTraceStage(input: RecordExecutionTraceStageInput): void {
  safeRun(() => {
    const existing = traces.get(input.executionId);
    if (!existing) return;
    const record: ExecutionTraceStageRecord = Object.freeze({
      stage: input.stage,
      status: input.status,
      ...(input.skipReason ? { skipReason: input.skipReason } : {}),
      ...(input.error ? { error: input.error } : {}),
      at: (input.nowIso ?? (() => new Date().toISOString()))(),
      ...(input.details ? { details: input.details } : {}),
    });
    traces.set(input.executionId, Object.freeze({
      ...existing,
      stages: Object.freeze([...existing.stages, record]),
    }));
  });
}

export function updateExecutionTrace(input: UpdateExecutionTraceInput): void {
  safeRun(() => {
    const existing = traces.get(input.executionId);
    if (!existing) return;
    traces.set(input.executionId, Object.freeze({
      ...existing,
      ...input.patch,
      stages: existing.stages,
    }));
  });
}

export function getExecutionTrace(executionId: string): ExecutionTraceState | undefined {
  return traces.get(executionId);
}

export function resetExecutionTracesForTests(): void {
  traces.clear();
}

function stageStatusLabel(
  stages: readonly ExecutionTraceStageRecord[],
  stage: ExecutionTraceStage,
): string {
  const hit = stages.filter((s) => s.stage === stage).pop();
  if (!hit) return "NOT_TRACED";
  if (hit.status === "SKIPPED") return `SKIPPED${hit.skipReason ? `(${hit.skipReason})` : ""}`;
  if (hit.status === "FAILED") return "FAILED";
  return "COMPLETED";
}

export function buildExecutionTraceSummary(state: ExecutionTraceState): string {
  const hasArtifacts = (state.artifactIds?.length ?? 0) > 0;
  const artifact = hasArtifacts ? "CREATED" : "MISSING";
  const evaluationPlane = stageStatusLabel(state.stages, "evaluation_plane");
  const step2 = stageStatusLabel(state.stages, "step2_validation");
  const evaluation =
    evaluationPlane === "COMPLETED"
      ? "COMPLETED"
      : evaluationPlane.startsWith("SKIPPED")
        ? evaluationPlane
        : step2;
  const contract = state.contractValidationStatus ?? "UNVERIFIED";
  const evidence =
    state.performanceRecordId &&
    stageStatusLabel(state.stages, "model_performance_record") === "COMPLETED"
      ? "RECORDED"
      : "NOT_RECORDED";
  const routing = state.routingMode === "adaptive" ? "ADAPTIVE" : "STATIC";
  const structuredOutput = state.usedStructuredOutput ? "YES" : "NO";
  const requestedModel = [state.requestedProviderId, state.requestedModelId]
    .filter(Boolean)
    .join("/") || "unknown";
  const selectedModel = [state.selectedProviderId, state.selectedModelId]
    .filter(Boolean)
    .join("/") || "unknown";
  const actualModel = [
    state.finalProviderId ?? state.actualProviderId,
    state.finalModelId ?? state.actualModelId,
  ]
    .filter(Boolean)
    .join("/") || "unknown";
  const fallback =
    state.fallbackUsed === true
      ? `YES(${state.fallbackReason ?? "provider_failover"})`
      : "NO";

  return [
    `${EXECUTION_TRACE_PREFIX}`,
    `executionId=${state.executionId}`,
    `correlationId=${state.correlationId}`,
    `service=${state.service ?? "unknown"}`,
    `subtype=${state.subtype ?? "unknown"}`,
    `outputKind=${state.outputKind ?? "unknown"}`,
    `requestedModel=${requestedModel}`,
    `selectedModel=${selectedModel}`,
    `actualModel=${actualModel}`,
    `fallbackUsed=${fallback}`,
    `execution=${state.executionStatus ?? "UNKNOWN"}`,
    `structuredOutput=${structuredOutput}`,
    `artifact=${artifact}`,
    `artifactId=${state.artifactIds?.join(",") ?? "none"}`,
    `artifact_render=${stageStatusLabel(state.stages, "artifact_render")}`,
    `runtime_evaluation=${stageStatusLabel(state.stages, "runtime_evaluation")}`,
    `evaluation_plane=${evaluationPlane}`,
    `step2_validation=${step2}`,
    `evaluation=${evaluation}`,
    `contract=${contract}`,
    `quality=${state.qualityScore ?? "n/a"}`,
    `evidence=${evidence}`,
    `routing=${routing}`,
    `finalStatus=${state.finalOutcome ?? state.executionStatus ?? "UNKNOWN"}`,
  ].join("\n");
}

export function logExecutionTraceStageEvent(
  stage: ExecutionTraceStage,
  fields: Readonly<Record<string, unknown>>,
): void {
  safeRun(() => {
    const safe = sanitizeOsLogFields({
      event: `execution.trace.${stage}`,
      ...fields,
    });
    console.log(`[UNAGENCY OS] ${JSON.stringify(safe)}`);
  });
}

export function finalizeExecutionTrace(executionId: string): ExecutionTraceState | undefined {
  let finalized: ExecutionTraceState | undefined;
  safeRun(() => {
    const state = traces.get(executionId);
    if (!state) return;
    finalized = state;
    console.log(buildExecutionTraceSummary(state));
    traces.delete(executionId);
  });
  return finalized;
}

/** Record stages that production path intentionally skips (not inferred as PASS). */
export function recordProductionSkippedTraceStages(executionId: string): void {
  recordExecutionTraceStage({
    executionId,
    stage: "artifact_hydration",
    status: "SKIPPED",
    skipReason: "production_evidence_path_does_not_hydrate_artifacts",
  });
  recordExecutionTraceStage({
    executionId,
    stage: "artifact_render",
    status: "SKIPPED",
    skipReason: "production_evidence_path_does_not_render_artifacts",
  });
  recordExecutionTraceStage({
    executionId,
    stage: "runtime_evaluation",
    status: "SKIPPED",
    skipReason: "production_evidence_path_does_not_run_runtime_evaluation",
  });
  recordExecutionTraceStage({
    executionId,
    stage: "evaluation_plane",
    status: "SKIPPED",
    skipReason: "production_evidence_uses_step2_directly_without_evaluation_plane",
  });
}

export type RecordProviderDispatchTraceInput = {
  readonly executionId: string;
  readonly executionStatus: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly selectedProviderId?: string;
  readonly selectedModelId?: string;
  readonly fallbackUsed?: boolean;
  readonly fallbackProviderId?: string;
  readonly fallbackModelId?: string;
  readonly fallbackReason?: string;
  readonly structuredDataPresent: boolean;
  readonly structuredOutputRequested: boolean;
  readonly errorMessage?: string;
};

export function recordProviderDispatchTrace(input: RecordProviderDispatchTraceInput): void {
  updateExecutionTrace({
    executionId: input.executionId,
    patch: Object.freeze({
      actualProviderId: input.providerId,
      actualModelId: input.modelId,
      finalProviderId: input.providerId,
      finalModelId: input.modelId,
      executionStatus: input.executionStatus,
      usedStructuredOutput: input.structuredOutputRequested,
      fallbackUsed: input.fallbackUsed,
      fallbackProviderId: input.fallbackProviderId,
      fallbackModelId: input.fallbackModelId,
      fallbackReason: input.fallbackReason,
    }),
  });
  recordExecutionTraceStage({
    executionId: input.executionId,
    stage: "provider_selection",
    status: "COMPLETED",
    details: Object.freeze({
      selectedProviderId: input.selectedProviderId ?? input.providerId,
      selectedModelId: input.selectedModelId ?? input.modelId,
      fallbackUsed: input.fallbackUsed === true,
    }),
  });
  recordExecutionTraceStage({
    executionId: input.executionId,
    stage: "provider_dispatch",
    status:
      input.executionStatus === "succeeded" || input.executionStatus === "completed"
        ? "COMPLETED"
        : "FAILED",
    error: input.errorMessage,
  });
  recordExecutionTraceStage({
    executionId: input.executionId,
    stage: "structured_output",
    status: input.structuredDataPresent
      ? "COMPLETED"
      : input.structuredOutputRequested
        ? "FAILED"
        : "SKIPPED",
    skipReason: input.structuredOutputRequested ? undefined : "no_structured_output_requested",
    error:
      input.structuredOutputRequested && !input.structuredDataPresent
        ? "structured_output_missing"
        : undefined,
  });
}

export function recordProviderDispatchFromSummary(input: {
  readonly executionId: string;
  readonly status: string;
  readonly jobSummary: Readonly<Record<string, unknown>>;
  readonly workingMetadata?: Readonly<Record<string, unknown>>;
  readonly errorMessage?: string;
}): void {
  const actualProviderId = firstNonEmptyString(
    input.jobSummary.actualProviderId,
    input.jobSummary.providerId,
    input.jobSummary.provider,
  );
  const actualModelId = firstNonEmptyString(
    input.jobSummary.actualModelId,
    input.jobSummary.modelId,
    input.jobSummary.model,
  );
  const selectedProviderId = firstNonEmptyString(
    input.jobSummary.routedProviderId,
    input.workingMetadata?.preferredProviderId,
  );
  const selectedModelId = firstNonEmptyString(
    input.jobSummary.routedModelId,
    input.workingMetadata?.preferredModelId,
  );
  const fallbackUsed = input.jobSummary.fallbackUsed === true;
  recordProviderDispatchTrace({
    executionId: input.executionId,
    executionStatus: input.status,
    providerId: actualProviderId,
    modelId: actualModelId,
    selectedProviderId,
    selectedModelId,
    fallbackUsed,
    fallbackProviderId: fallbackUsed
      ? firstNonEmptyString(input.jobSummary.fallbackProviderId, actualProviderId)
      : undefined,
    fallbackModelId: fallbackUsed
      ? firstNonEmptyString(input.jobSummary.fallbackModelId, actualModelId)
      : undefined,
    fallbackReason:
      typeof input.jobSummary.fallbackReason === "string"
        ? input.jobSummary.fallbackReason
        : fallbackUsed
          ? "provider_failover"
          : undefined,
    structuredDataPresent: input.jobSummary.structuredData != null,
    structuredOutputRequested: Boolean(input.workingMetadata?.structuredOutput),
    errorMessage: input.errorMessage,
  });
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export type RecordClassificationTraceInput = {
  readonly executionId: string;
  readonly service: string;
  readonly subtype: string;
  readonly outputKind: string;
  readonly capabilityId?: string;
  readonly classificationOk: boolean;
  readonly mismatchReason?: string;
};

export function recordClassificationTrace(input: RecordClassificationTraceInput): void {
  recordExecutionTraceStage({
    executionId: input.executionId,
    stage: "classification",
    status: input.classificationOk ? "COMPLETED" : "FAILED",
    error: input.classificationOk ? undefined : input.mismatchReason,
    details: Object.freeze({
      service: input.service,
      subtype: input.subtype,
      outputKind: input.outputKind,
      capabilityId: input.capabilityId,
    }),
  });
  updateExecutionTrace({
    executionId: input.executionId,
    patch: Object.freeze({
      service: input.service,
      subtype: input.subtype,
      outputKind: input.outputKind,
      capabilityId: input.capabilityId,
    }),
  });
}

export type RecordWebsiteMaterializationTraceInput = {
  readonly executionId: string;
  readonly exported: boolean;
  readonly websiteRequired: boolean;
  readonly artifactIds?: readonly string[];
  readonly errorCode?: string;
  readonly finalProviderId?: string;
  readonly finalModelId?: string;
};

export function recordWebsiteMaterializationTrace(
  input: RecordWebsiteMaterializationTraceInput,
): void {
  const hasArtifacts = (input.artifactIds?.length ?? 0) > 0;
  const materializationSucceeded = input.exported && hasArtifacts;
  const materializationRequired = input.websiteRequired;
  recordExecutionTraceStage({
    executionId: input.executionId,
    stage: "os_materialization",
    status: materializationSucceeded
      ? "COMPLETED"
      : materializationRequired
        ? "FAILED"
        : "SKIPPED",
    skipReason:
      !materializationRequired && !input.exported
        ? "website_export_not_required"
        : undefined,
    error: input.errorCode,
  });
  recordExecutionTraceStage({
    executionId: input.executionId,
    stage: "artifact_persistence",
    status: hasArtifacts ? "COMPLETED" : input.websiteRequired ? "FAILED" : "SKIPPED",
    skipReason: !input.websiteRequired && !hasArtifacts ? "no_artifacts_to_persist" : undefined,
  });
  updateExecutionTrace({
    executionId: input.executionId,
    patch: Object.freeze({
      artifactIds: input.artifactIds,
      usedArtifactMaterialization: materializationSucceeded,
      finalProviderId: input.finalProviderId,
      finalModelId: input.finalModelId,
    }),
  });
}

export type RecordProductionEvidenceTraceInput = {
  readonly executionId: string;
  readonly contractValidationStatus?: string;
  readonly evaluationStatus?: string;
  readonly qualityScore?: number;
  readonly evidenceSource?: string;
  readonly evidenceMode?: string;
  readonly performanceRecordId?: string;
  readonly finalOutcome?: string;
  readonly providerSuccess: boolean;
  readonly step2SkippedReason?: string;
  readonly evidenceRecorded?: boolean;
  readonly step2Executed?: boolean;
  readonly stageTrace?: {
    readonly artifactHydration: "COMPLETED" | "SKIPPED" | "FAILED";
    readonly artifactHydrationReason?: string;
    readonly artifactRender?: "COMPLETED" | "SKIPPED" | "FAILED";
    readonly artifactRenderReason?: string;
    readonly runtimeEvaluation?: "COMPLETED" | "SKIPPED" | "FAILED";
    readonly runtimeEvaluationReason?: string;
    readonly evaluationPlane: "COMPLETED" | "SKIPPED" | "FAILED";
    readonly evaluationPlaneReason?: string;
    readonly hydratedArtifactCount?: number;
  };
};

export function recordProductionEvidenceTrace(
  input: RecordProductionEvidenceTraceInput,
): ExecutionTraceState | undefined {
  if (input.stageTrace) {
    recordExecutionTraceStage({
      executionId: input.executionId,
      stage: "artifact_hydration",
      status: input.stageTrace.artifactHydration,
      skipReason:
        input.stageTrace.artifactHydration === "SKIPPED"
          ? input.stageTrace.artifactHydrationReason
          : undefined,
      error:
        input.stageTrace.artifactHydration === "FAILED"
          ? input.stageTrace.artifactHydrationReason
          : undefined,
      details: Object.freeze({
        hydratedArtifactCount: input.stageTrace.hydratedArtifactCount ?? 0,
      }),
    });
    recordExecutionTraceStage({
      executionId: input.executionId,
      stage: "artifact_render",
      status: input.stageTrace.artifactRender ?? "SKIPPED",
      skipReason:
        input.stageTrace.artifactRender === "SKIPPED"
          ? input.stageTrace.artifactRenderReason
          : undefined,
      error:
        input.stageTrace.artifactRender === "FAILED"
          ? input.stageTrace.artifactRenderReason
          : undefined,
    });
    recordExecutionTraceStage({
      executionId: input.executionId,
      stage: "runtime_evaluation",
      status: input.stageTrace.runtimeEvaluation ?? "SKIPPED",
      skipReason:
        input.stageTrace.runtimeEvaluation === "SKIPPED"
          ? input.stageTrace.runtimeEvaluationReason
          : undefined,
      error:
        input.stageTrace.runtimeEvaluation === "FAILED"
          ? input.stageTrace.runtimeEvaluationReason
          : undefined,
    });
    recordExecutionTraceStage({
      executionId: input.executionId,
      stage: "evaluation_plane",
      status: input.stageTrace.evaluationPlane,
      skipReason:
        input.stageTrace.evaluationPlane === "SKIPPED"
          ? input.stageTrace.evaluationPlaneReason
          : undefined,
      error:
        input.stageTrace.evaluationPlane === "FAILED"
          ? input.stageTrace.evaluationPlaneReason
          : undefined,
    });
  }
  recordExecutionTraceStage({
    executionId: input.executionId,
    stage: "production_evidence",
    status: input.evidenceRecorded === false ? "FAILED" : "COMPLETED",
    error: input.evidenceRecorded === false ? "evidence_not_recorded" : undefined,
  });
  const step2Executed = input.step2Executed ?? !input.step2SkippedReason;
  if (!step2Executed) {
    recordExecutionTraceStage({
      executionId: input.executionId,
      stage: "step2_validation",
      status: "SKIPPED",
      skipReason: input.step2SkippedReason ?? "step2_not_executed",
    });
    recordExecutionTraceStage({
      executionId: input.executionId,
      stage: "quality_gate",
      status: "SKIPPED",
      skipReason: input.step2SkippedReason ?? "step2_not_executed",
    });
  } else {
    recordExecutionTraceStage({
      executionId: input.executionId,
      stage: "step2_validation",
      status: "COMPLETED",
      details: Object.freeze({
        contractValidationStatus: input.contractValidationStatus,
      }),
    });
    recordExecutionTraceStage({
      executionId: input.executionId,
      stage: "quality_gate",
      status: "COMPLETED",
      details: Object.freeze({
        qualityScore: input.qualityScore,
      }),
    });
  }
  recordExecutionTraceStage({
    executionId: input.executionId,
    stage: "model_performance_record",
    status: input.performanceRecordId ? "COMPLETED" : "FAILED",
    error: input.performanceRecordId ? undefined : "performance_record_not_created",
  });
  updateExecutionTrace({
    executionId: input.executionId,
    patch: Object.freeze({
      contractValidationStatus: input.contractValidationStatus,
      evaluationStatus: input.evaluationStatus,
      qualityScore: input.qualityScore,
      evidenceSource: input.evidenceSource,
      evidenceMode: input.evidenceMode,
      performanceRecordId: input.performanceRecordId,
      finalOutcome: input.finalOutcome,
      usedStep2Validation: step2Executed,
      usedProductionEvidence: input.evidenceRecorded !== false,
      usedEvaluationPlane: input.stageTrace?.evaluationPlane === "COMPLETED",
      executionStatus: input.providerSuccess ? "SUCCESS" : "FAIL",
    }),
  });
  return finalizeExecutionTrace(input.executionId);
}
