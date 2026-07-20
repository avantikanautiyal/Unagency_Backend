/**
 * Pipeline context and state contracts.
 */

import type { PipelineStageKind, PipelineStateKind } from "./enums";

export interface StageTiming {
  readonly stage: PipelineStageKind;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly state: PipelineStateKind;
}

export interface PipelineContext {
  readonly contextId: string;
  readonly requestId: string;
  readonly stageTimings: readonly StageTiming[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly skippedStages: readonly PipelineStageKind[];
}

export interface PlanningState {
  readonly currentStage: PipelineStageKind | "complete";
  readonly stagesCompleted: readonly PipelineStageKind[];
  readonly totalDurationMs: number;
}
