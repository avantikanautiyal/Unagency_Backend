/**
 * Maps finalized execution trace + integrity result into a durable observability record.
 */

import type { ExecutionTraceStage, ExecutionTraceState } from "./execution-trace";
import {
  EXECUTION_OBSERVABILITY_RECORD_KIND,
  type DurableExecutionObservabilityRecord,
  type ExecutionObservabilityEvidenceStatus,
} from "./execution-observability-contract";
import type {
  ProductionExecutionIntegrityResult,
  StageOutcomeStatus,
} from "./production-execution-integrity";

export type BuildDurableObservabilityInput = {
  readonly organizationId: string;
  readonly trace: ExecutionTraceState;
  readonly integrity: ProductionExecutionIntegrityResult;
  readonly latencyMs?: number;
  readonly evaluationPlaneVersion?: string;
  readonly evidenceSource?: string;
  readonly evidenceMode?: string;
  readonly performanceRecordId?: string;
  readonly contractValidationStatus?: string;
  readonly qualityScore?: number;
  readonly finalOutcome?: string;
  readonly executionStatus?: string;
  readonly nowIso?: () => string;
};

function stageOutcome(
  stages: ExecutionTraceState["stages"],
  stage: ExecutionTraceStage,
): StageOutcomeStatus {
  const hit = stages.filter((s) => s.stage === stage).pop();
  if (!hit) return "NOT_TRACED";
  if (hit.status === "COMPLETED") return "COMPLETED";
  if (hit.status === "FAILED") return "FAILED";
  return "SKIPPED";
}

function routingDecisionFromTrace(trace: ExecutionTraceState): string | undefined {
  if (trace.adaptiveDecision) return trace.adaptiveDecision;
  const adaptive = trace.stages.filter((s) => s.stage === "adaptive_routing").pop();
  if (adaptive?.status === "COMPLETED") return "adaptive_routing_completed";
  if (adaptive?.status === "SKIPPED") {
    return `adaptive_skipped${adaptive.skipReason ? `:${adaptive.skipReason}` : ""}`;
  }
  const routing = trace.stages.filter((s) => s.stage === "static_routing").pop();
  if (routing?.status === "COMPLETED") return "static_routing_completed";
  if (trace.routingMode) return trace.routingMode;
  return undefined;
}

function evidenceStatusFromIntegrity(
  integrity: ProductionExecutionIntegrityResult,
): ExecutionObservabilityEvidenceStatus {
  return integrity.performanceRecordStatus === "COMPLETED" ? "RECORDED" : "NOT_RECORDED";
}

function computeDurationMs(stages: ExecutionTraceState["stages"]): number | undefined {
  if (stages.length < 2) return undefined;
  const start = Date.parse(stages[0]!.at);
  const end = Date.parse(stages[stages.length - 1]!.at);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return undefined;
  return end - start;
}

export function buildDurableExecutionObservabilityRecord(
  input: BuildDurableObservabilityInput,
): DurableExecutionObservabilityRecord {
  const { trace, integrity } = input;
  const stages = trace.stages;
  const startedAt = stages[0]?.at ?? (input.nowIso?.() ?? new Date().toISOString());
  const finalizedAt = stages[stages.length - 1]?.at ?? startedAt;

  return Object.freeze({
    recordKind: EXECUTION_OBSERVABILITY_RECORD_KIND,
    executionId: trace.executionId,
    correlationId: trace.correlationId,
    organizationId: input.organizationId,
    service: integrity.service,
    subtype: integrity.subtype,
    outputKind: integrity.outputKind,
    capabilityId: trace.capabilityId,
    requestedProviderId: integrity.requestedProvider ?? trace.requestedProviderId,
    requestedModelId: integrity.requestedModel ?? trace.requestedModelId,
    selectedProviderId: integrity.selectedProvider ?? trace.selectedProviderId,
    selectedModelId: integrity.selectedModel ?? trace.selectedModelId,
    actualProviderId: integrity.actualProvider ?? trace.actualProviderId ?? trace.finalProviderId,
    actualModelId: integrity.actualModel ?? trace.actualModelId ?? trace.finalModelId,
    fallbackUsed: integrity.fallbackUsed,
    fallbackReason: integrity.fallbackReason,
    classificationStatus: stageOutcome(stages, "classification"),
    routingMode: trace.routingMode,
    adaptiveRoutingEnabled: trace.adaptiveRoutingEnabled,
    routingDecision: routingDecisionFromTrace(trace),
    structuredOutputStatus:
      stageOutcome(stages, "structured_output") !== "NOT_TRACED"
        ? stageOutcome(stages, "structured_output")
        : integrity.structuredOutputStatus,
    materializationStatus:
      stageOutcome(stages, "os_materialization") !== "NOT_TRACED"
        ? stageOutcome(stages, "os_materialization")
        : integrity.materializationStatus,
    artifactPersistenceStatus: stageOutcome(stages, "artifact_persistence"),
    artifactHydrationStatus: stageOutcome(stages, "artifact_hydration"),
    artifactRenderStatus: stageOutcome(stages, "artifact_render"),
    runtimeEvaluationStatus: stageOutcome(stages, "runtime_evaluation"),
    evaluationPlaneStatus: stageOutcome(stages, "evaluation_plane"),
    evaluationPlaneVersion: input.evaluationPlaneVersion,
    step2Status: stageOutcome(stages, "step2_validation"),
    qualityGateStatus: stageOutcome(stages, "quality_gate"),
    evidenceStatus: evidenceStatusFromIntegrity(integrity),
    performanceRecordStatus:
      stageOutcome(stages, "model_performance_record") !== "NOT_TRACED"
        ? stageOutcome(stages, "model_performance_record")
        : integrity.performanceRecordStatus,
    artifactIds: Object.freeze([...integrity.artifactIds]),
    artifactType: integrity.outputKind,
    performanceRecordId:
      input.performanceRecordId ?? trace.performanceRecordId,
    evidenceSource: input.evidenceSource ?? trace.evidenceSource,
    evidenceMode: input.evidenceMode ?? trace.evidenceMode,
    executionStatus: input.executionStatus ?? trace.executionStatus,
    finalOutcome: input.finalOutcome ?? trace.finalOutcome,
    contractValidationStatus:
      input.contractValidationStatus ?? trace.contractValidationStatus,
    qualityScore: input.qualityScore ?? trace.qualityScore,
    integrityStatus: integrity.integrityStatus,
    failureCategory: integrity.failureCategory,
    failureReason: integrity.failureReason,
    integrityFailures: integrity.integrityFailures,
    stages: Object.freeze([...stages]),
    startedAt,
    finalizedAt,
    durationMs: computeDurationMs(stages),
    latencyMs: input.latencyMs,
    persistedAt: (input.nowIso ?? (() => new Date().toISOString()))(),
  });
}
