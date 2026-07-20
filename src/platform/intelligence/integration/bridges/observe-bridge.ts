/**
 * Shared bridge observability helper.
 */

import { asBridgeInvocationId } from "../contracts/identifiers";
import type { BridgeObservabilityRecord } from "../contracts/trace";
import type { BridgeStatus, IntegrationStageKind } from "../contracts/enums";
import type { BridgeContext, BridgeInvocationResult } from "../interfaces/integration";
import { failure, success, type Result } from "../../shared/result";

export interface ObserveBridgeOptions {
  readonly bridgeName: string;
  readonly fromStage: IntegrationStageKind;
  readonly toStage: IntegrationStageKind;
  readonly ctx: BridgeContext;
  readonly nowIso: () => string;
  readonly clockMs: () => number;
  readonly createId: (prefix: string) => string;
  readonly inputSummary: Readonly<Record<string, unknown>>;
  readonly artifactRefs?: readonly string[];
}

export async function observeBridgeCall<T>(
  options: ObserveBridgeOptions,
  call: () => Promise<Result<T>>,
  summarizeOutput: (value: T) => Readonly<Record<string, unknown>>
): Promise<Result<BridgeInvocationResult<T>>> {
  const startedAt = options.nowIso();
  const start = options.clockMs();
  const result = await call();
  const completedAt = options.nowIso();
  const durationMs = Math.max(0, options.clockMs() - start);

  if (!result.ok) {
    const observability: BridgeObservabilityRecord = {
      invocationId: asBridgeInvocationId(options.createId("bridge")),
      bridgeName: options.bridgeName,
      fromStage: options.fromStage,
      toStage: options.toStage,
      correlationId: options.ctx.correlationId,
      startedAt,
      completedAt,
      durationMs,
      status: "failed",
      inputSummary: options.inputSummary,
      outputSummary: {},
      artifactRefs: options.artifactRefs ?? [],
      errorMessage: String(result.error.message ?? result.error),
    };
    return failure(result.error);
  }

  const observability: BridgeObservabilityRecord = {
    invocationId: asBridgeInvocationId(options.createId("bridge")),
    bridgeName: options.bridgeName,
    fromStage: options.fromStage,
    toStage: options.toStage,
    correlationId: options.ctx.correlationId,
    startedAt,
    completedAt,
    durationMs,
    status: "succeeded" satisfies BridgeStatus,
    inputSummary: options.inputSummary,
    outputSummary: summarizeOutput(result.value),
    artifactRefs: options.artifactRefs ?? [],
  };

  return success({ value: result.value, observability });
}
