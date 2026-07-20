/**
 * Bridge observability + execution trace contracts.
 */

import type { BridgeStatus, IntegrationStageKind } from "./enums";
import type { BridgeInvocationId, IntegrationTraceId } from "./identifiers";

export interface BridgeObservabilityRecord {
  readonly invocationId: BridgeInvocationId;
  readonly bridgeName: string;
  readonly fromStage: IntegrationStageKind;
  readonly toStage: IntegrationStageKind;
  readonly correlationId: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly status: BridgeStatus;
  readonly inputSummary: Readonly<Record<string, unknown>>;
  readonly outputSummary: Readonly<Record<string, unknown>>;
  readonly artifactRefs: readonly string[];
  readonly errorMessage?: string;
}

export interface StageTraceRecord {
  readonly stage: IntegrationStageKind;
  readonly status: BridgeStatus;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly message: string;
  readonly artifactRefs: readonly string[];
}

export interface IntegrationExecutionTrace {
  readonly traceId: IntegrationTraceId;
  readonly correlationId: string;
  readonly requestId: string;
  readonly stages: readonly StageTraceRecord[];
  readonly bridges: readonly BridgeObservabilityRecord[];
  readonly completedStages: readonly IntegrationStageKind[];
  readonly failedStage?: IntegrationStageKind;
  readonly capturedAt: string;
}
