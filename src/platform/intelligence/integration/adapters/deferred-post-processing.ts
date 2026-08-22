/**
 * Deferred integration post-processing — stages 12–18 after external provider completion.
 */

import type { Result } from "../../shared/result";
import { asProviderId } from "../../shared/identifiers";
import type { IntelligenceOsIntegrationRequest } from "../contracts/request";
import type { IntelligenceOsIntegrationReport } from "../contracts/result";
import type { IntegrationArtifactBag } from "../contracts/artifacts";
import type { IntegrationStageKind } from "../contracts/enums";
import type { IIntelligenceOsIntegrationEngine } from "../interfaces/integration";
import type { ProviderExecutionResult } from "../../providers/runtime/contracts/provider-execution-response";
import { EMPTY_EXECUTION_STATISTICS } from "../../providers/runtime/contracts/provider-execution-metadata";
import type { StreamingExecutionResult } from "../../providers/streaming/orchestrator/streaming-execution-orchestrator";

export interface IntegrationPlanningSnapshot {
  readonly request: IntelligenceOsIntegrationRequest;
  readonly artifacts: IntegrationArtifactBag;
  readonly stagesCompleted: readonly IntegrationStageKind[];
}

export function buildIntegrationPlanningSnapshot(
  request: IntelligenceOsIntegrationRequest,
  report: IntelligenceOsIntegrationReport
): IntegrationPlanningSnapshot {
  return {
    request,
    artifacts: report.artifacts,
    stagesCompleted: report.stagesCompleted,
  };
}

export function readIntegrationPlanningSnapshot(
  extras: Readonly<Record<string, unknown>> | undefined
): IntegrationPlanningSnapshot | undefined {
  const raw = extras?.integrationPlanningSnapshot;
  if (!raw || typeof raw !== "object") return undefined;
  const row = raw as Record<string, unknown>;
  if (!row.request || typeof row.request !== "object") return undefined;
  if (!row.artifacts || typeof row.artifacts !== "object") return undefined;
  if (!Array.isArray(row.stagesCompleted)) return undefined;
  return {
    request: row.request as IntelligenceOsIntegrationRequest,
    artifacts: row.artifacts as IntegrationArtifactBag,
    stagesCompleted: row.stagesCompleted as IntegrationStageKind[],
  };
}

export function buildProviderRuntimeFromAsyncTerminal(input: {
  readonly executionId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly success: boolean;
  readonly artifactIds: readonly string[];
  readonly errorMessage?: string;
  readonly usage?: Readonly<Record<string, unknown>>;
  readonly nowIso: string;
}): ProviderExecutionResult {
  const requestId = `${input.executionId}_async`;
  return {
    requestId,
    sessionId: `${input.executionId}_session`,
    status: input.success ? "completed" : "failed",
    success: input.success,
    response: input.success
      ? {
          requestId,
          providerId: asProviderId(input.providerId),
          output: {
            artifactIds: [...input.artifactIds],
            outputs: [...input.artifactIds],
          },
          usage: input.usage,
          streamed: false,
          finishedAt: input.nowIso,
        }
      : undefined,
    error: input.success
      ? undefined
      : {
          code: "ASYNC_PROVIDER_FAILED",
          message: input.errorMessage?.trim() || "async provider failed",
        },
    statistics: EMPTY_EXECUTION_STATISTICS,
    completedAt: input.nowIso,
    finalProviderId: input.providerId,
    finalModelId: input.modelId,
  };
}

export function buildProviderRuntimeFromStreamResult(input: {
  readonly executionId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly result: StreamingExecutionResult;
  readonly nowIso: string;
}): ProviderExecutionResult {
  const requestId = `${input.executionId}_stream`;
  const successFlag = input.result.success;
  return {
    requestId,
    sessionId: `${input.executionId}_session`,
    status: successFlag ? "completed" : "failed",
    success: successFlag,
    response: successFlag
      ? {
          requestId,
          providerId: asProviderId(input.providerId),
          output: {
            content: input.result.finalContent,
            text: input.result.finalContent,
          },
          usage: input.result.usage as Readonly<Record<string, unknown>> | undefined,
          streamed: true,
          finishedAt: input.nowIso,
        }
      : input.result.finalContent
        ? {
            requestId,
            providerId: asProviderId(input.providerId),
            output: {
              content: input.result.finalContent,
              text: input.result.finalContent,
            },
            streamed: true,
            finishedAt: input.nowIso,
          }
        : undefined,
    error: successFlag
      ? undefined
      : {
          code: String(input.result.terminationReason ?? "STREAM_FAILED"),
          message: input.result.terminationReason || "live stream failed",
        },
    statistics: {
      ...EMPTY_EXECUTION_STATISTICS,
      streamingMs: input.result.totalStreamDurationMs,
      totalMs: input.result.totalStreamDurationMs,
      streamingChunks: input.result.eventCount,
    },
    completedAt: input.nowIso,
    finalProviderId: input.providerId,
    finalModelId: input.modelId,
  };
}

export async function runDeferredIntegrationPostProcessing(input: {
  readonly integration: IIntelligenceOsIntegrationEngine;
  readonly snapshot: IntegrationPlanningSnapshot;
  readonly runtime: ProviderExecutionResult;
}): Promise<Result<IntelligenceOsIntegrationReport>> {
  const bag: IntegrationArtifactBag = {
    ...input.snapshot.artifacts,
    runtime: input.runtime,
  };
  return input.integration.runPostProcessing(input.snapshot.request, bag, {
    priorStagesCompleted: [...input.snapshot.stagesCompleted],
  });
}

/** Persistable extras fragment for planning snapshot storage. */
export function integrationPlanningSnapshotExtras(
  snapshot: IntegrationPlanningSnapshot
): Readonly<Record<string, unknown>> {
  return { integrationPlanningSnapshot: snapshot };
}
