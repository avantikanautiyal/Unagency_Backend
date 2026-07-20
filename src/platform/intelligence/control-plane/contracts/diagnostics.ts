/**
 * Diagnostics contracts.
 */

import type { PipelineStageKind } from "./enums";
import type { StageTiming } from "./context";

export interface StageDiagnostic {
  readonly stage: PipelineStageKind;
  readonly success: boolean;
  readonly message: string;
  readonly warnings: readonly string[];
}

export interface PipelineDiagnostics {
  readonly diagnosticsId: string;
  readonly stageTimings: readonly StageTiming[];
  readonly stageResults: readonly StageDiagnostic[];
  readonly validationPassed: boolean;
  readonly recommendations: readonly string[];
  readonly explainabilityRefs: readonly string[];
}
