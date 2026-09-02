/**
 * Direct execution contracts — prompt → provider, no intelligence layers.
 */

import type { OrganizationId, WorkspaceId } from "../core/identifiers";

export type DirectExecutionMode = "full" | "planning_through_routing";

export interface DirectExecutionRequest {
  readonly requestId: string;
  readonly rawPrompt: string;
  readonly organizationId?: OrganizationId;
  readonly workspaceId?: WorkspaceId;
  readonly scenarioHint?: string;
  readonly budgetLimit?: number;
  readonly tokenBudgetLimit?: number;
  readonly regionHint?: string;
  readonly mode?: DirectExecutionMode;
  readonly correlationId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Active pipeline stages on the direct provider path. */
export type DirectExecutionStageKind = "routing" | "provider_runtime";

export interface StageTraceRecord {
  readonly stage: DirectExecutionStageKind;
  readonly status: "succeeded" | "failed" | "skipped";
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly message: string;
  readonly artifactRefs: readonly string[];
}

export interface BridgeObservabilityRecord {
  readonly bridgeName: string;
  readonly fromStage: DirectExecutionStageKind;
  readonly toStage: DirectExecutionStageKind;
  readonly durationMs: number;
  readonly status: "succeeded" | "failed";
}

export interface IntegrationExecutionTrace {
  readonly traceId: string;
  readonly correlationId: string;
  readonly requestId: string;
  readonly stages: readonly StageTraceRecord[];
  readonly bridges: readonly BridgeObservabilityRecord[];
  readonly completedStages: readonly DirectExecutionStageKind[];
  readonly capturedAt: string;
}

export interface DirectArtifactBag {
  readonly task?: {
    readonly request: { readonly rawPrompt: string };
    readonly capabilityMap: { readonly primary: string };
  };
  readonly routing?: {
    readonly plan: {
      readonly primary: { readonly providerId: string; readonly modelId?: string };
    };
  };
  readonly runtime?: import("../providers/runtime/contracts/provider-execution-response").ProviderExecutionResult;
}

export type IntegrationArtifactBag = DirectArtifactBag;

export interface DirectExecutionReport {
  readonly resultId: string;
  readonly requestId: string;
  readonly request: DirectExecutionRequest;
  readonly artifacts: IntegrationArtifactBag;
  readonly trace: IntegrationExecutionTrace;
  readonly stagesCompleted: readonly DirectExecutionStageKind[];
  readonly success: boolean;
  readonly durationMs: number;
  readonly createdAt: string;
  readonly version: string;
}

export interface IntegrationPostProcessingOptions {
  readonly priorStages?: readonly StageTraceRecord[];
  readonly priorBridges?: readonly BridgeObservabilityRecord[];
  readonly priorStagesCompleted?: readonly DirectExecutionStageKind[];
}

export interface IDirectExecutionEngine {
  run(
    request: DirectExecutionRequest
  ): Promise<import("../core/result").Result<DirectExecutionReport>>;
  runPostProcessing(
    request: DirectExecutionRequest,
    bag: IntegrationArtifactBag,
    options?: IntegrationPostProcessingOptions
  ): Promise<import("../core/result").Result<DirectExecutionReport>>;
}
