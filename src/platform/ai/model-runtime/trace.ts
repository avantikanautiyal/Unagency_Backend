/**
 * Phase 11 — Safe Model Runtime traces (IDs/counts/hashes only).
 */

import { sanitizeOsLogFields } from "../../os/observability/execution-log";
import { recordExecutionTraceStage } from "../../os/observability/execution-trace";
import type { ModelRuntimeRepresentationStrategy } from "./types";
import { MODEL_RUNTIME_SOURCE } from "./types";

export const MODEL_RUNTIME_TRACE_SCOPE = "ai.model_runtime" as const;

const recent: Array<Record<string, unknown>> = [];
const MAX = 64;

function push(event: Record<string, unknown>): void {
  const safe = sanitizeOsLogFields(event);
  recent.push(safe);
  if (recent.length > MAX) recent.shift();
  try {
    recordExecutionTraceStage({
      stage: "ai.model_runtime" as never,
      status: event.event === "ai.model_runtime.failed" ? "error" : "ok",
      detail: safe,
    } as never);
  } catch {
    // Trace must never break runtime.
  }
}

export function emitModelRuntimeMappedTrace(input: {
  readonly executionId?: string;
  readonly correlationId?: string;
  readonly apiExecutionId?: string;
  readonly cdfSessionId?: string;
  readonly cdfPhaseId?: string;
  readonly generationContextHash?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly representationStrategy: ModelRuntimeRepresentationStrategy;
  readonly cmrPresent: boolean;
  readonly messageCount?: number;
  readonly contentPartCount?: number;
  readonly multimodalItemCount?: number;
  readonly upstreamArtifactCount?: number;
  readonly artifactVersions?: readonly string[];
  readonly outputContractPresent?: boolean;
  readonly productionSpecPresent?: boolean;
  readonly compatibilityFlattenOccurred: boolean;
  readonly mappedCount?: number;
  readonly omittedCount?: number;
  readonly capabilityAssessmentApplied?: boolean;
  readonly supportedCount?: number;
  readonly compatibilityCount?: number;
  readonly requiredUnrepresentableCount?: number;
  readonly componentNames?: readonly string[];
  readonly capabilityStatuses?: readonly string[];
  readonly providerFamily?: string;
}): void {
  push({
    scope: MODEL_RUNTIME_TRACE_SCOPE,
    event: "ai.model_runtime.mapped",
    ts: new Date().toISOString(),
    runtimeBoundaryApplied: true,
    runtimeSource: MODEL_RUNTIME_SOURCE,
    executionId: input.executionId,
    correlationId: input.correlationId,
    apiExecutionId: input.apiExecutionId,
    cdfSessionId: input.cdfSessionId,
    cdfPhaseId: input.cdfPhaseId,
    generationContextHash: input.generationContextHash,
    providerId: input.providerId,
    modelId: input.modelId,
    representationStrategy: input.representationStrategy,
    cmrPresent: input.cmrPresent,
    messageCount: input.messageCount,
    contentPartCount: input.contentPartCount,
    multimodalItemCount: input.multimodalItemCount,
    upstreamArtifactCount: input.upstreamArtifactCount,
    artifactVersions: input.artifactVersions,
    outputContractPresent: input.outputContractPresent,
    productionSpecPresent: input.productionSpecPresent,
    compatibilityFlattenOccurred: input.compatibilityFlattenOccurred,
    mappedCount: input.mappedCount,
    omittedCount: input.omittedCount,
    capabilityAssessmentApplied: input.capabilityAssessmentApplied,
    supportedCount: input.supportedCount,
    compatibilityCount: input.compatibilityCount,
    requiredUnrepresentableCount: input.requiredUnrepresentableCount,
    componentNames: input.componentNames,
    capabilityStatuses: input.capabilityStatuses,
    providerFamily: input.providerFamily,
  });
}

export function emitModelRuntimeFailedTrace(input: {
  readonly executionId?: string;
  readonly failureCategory: string;
  readonly messageSafe: string;
}): void {
  push({
    scope: MODEL_RUNTIME_TRACE_SCOPE,
    event: "ai.model_runtime.failed",
    ts: new Date().toISOString(),
    runtimeBoundaryApplied: false,
    executionId: input.executionId,
    failureCategory: input.failureCategory,
    messageSafe: input.messageSafe.slice(0, 200),
  });
}

export function getModelRuntimeTraceEventsForTests(): readonly Record<
  string,
  unknown
>[] {
  return [...recent];
}

export function resetModelRuntimeTracesForTests(): void {
  recent.length = 0;
}
