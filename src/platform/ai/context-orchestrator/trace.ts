/**
 * Phase 10 — Safe Context Orchestrator traces (IDs/counts/hashes only).
 */

import { sanitizeOsLogFields } from "../../os/observability/execution-log";
import { recordExecutionTraceStage } from "../../os/observability/execution-trace";
import type { ContextContributorPresence } from "./types";
import { CONTEXT_ORCHESTRATOR_SOURCE } from "./types";

export const CONTEXT_ORCHESTRATOR_TRACE_SCOPE = "ai.context_orchestrator" as const;

const recent: Array<Record<string, unknown>> = [];
const MAX = 64;

function push(event: Record<string, unknown>): void {
  const safe = sanitizeOsLogFields(event);
  recent.push(safe);
  if (recent.length > MAX) recent.shift();
  try {
    recordExecutionTraceStage({
      stage: "ai.context_orchestrator" as never,
      status: event.orchestratorApplied === true ? "ok" : "info",
      detail: safe,
    } as never);
  } catch {
    // Trace must never break orchestration.
  }
}

export function emitContextOrchestratorAppliedTrace(input: {
  readonly cdfSessionId?: string;
  readonly cdfPhaseId?: string;
  readonly executionId?: string;
  readonly correlationId?: string;
  readonly generationContextHash?: string;
  readonly contributors: ContextContributorPresence;
  readonly requirementCount?: number;
  readonly decisionCount?: number;
  readonly referenceCount?: number;
  readonly workingMemoryCount?: number;
  readonly multimodalItemCount?: number;
  readonly upstreamArtifactCount?: number;
  readonly artifactVersions?: readonly string[];
  readonly productionSpecPresent?: boolean;
  readonly outputContractPresent?: boolean;
}): void {
  push({
    scope: CONTEXT_ORCHESTRATOR_TRACE_SCOPE,
    event: "ai.context_orchestrator.applied",
    ts: new Date().toISOString(),
    orchestratorApplied: true,
    orchestratorSkipped: false,
    canonicalAssemblySource: CONTEXT_ORCHESTRATOR_SOURCE,
    canonicalRequestAssembled: true,
    cdfSessionId: input.cdfSessionId,
    cdfPhaseId: input.cdfPhaseId,
    executionId: input.executionId,
    correlationId: input.correlationId,
    generationContextHash: input.generationContextHash,
    contributors: input.contributors,
    requirementCount: input.requirementCount,
    decisionCount: input.decisionCount,
    referenceCount: input.referenceCount,
    workingMemoryCount: input.workingMemoryCount,
    multimodalItemCount: input.multimodalItemCount,
    upstreamArtifactCount: input.upstreamArtifactCount,
    artifactVersions: input.artifactVersions,
    productionSpecPresent: input.productionSpecPresent,
    outputContractPresent: input.outputContractPresent,
  });
}

export function emitContextOrchestratorSkippedTrace(input: {
  readonly reason: string;
  readonly executionId?: string;
}): void {
  push({
    scope: CONTEXT_ORCHESTRATOR_TRACE_SCOPE,
    event: "ai.context_orchestrator.skipped",
    ts: new Date().toISOString(),
    orchestratorApplied: false,
    orchestratorSkipped: true,
    reason: input.reason,
    executionId: input.executionId,
  });
}

export function emitContextOrchestratorFailedTrace(input: {
  readonly code: string;
  readonly message: string;
  readonly executionId?: string;
}): void {
  push({
    scope: CONTEXT_ORCHESTRATOR_TRACE_SCOPE,
    event: "ai.context_orchestrator.failed",
    ts: new Date().toISOString(),
    orchestratorApplied: false,
    failureCategory: input.code,
    messageSafe: input.message.slice(0, 200),
    executionId: input.executionId,
  });
}

export function getContextOrchestratorTraceEventsForTests(): readonly Record<
  string,
  unknown
>[] {
  return [...recent];
}

export function resetContextOrchestratorTracesForTests(): void {
  recent.length = 0;
}
