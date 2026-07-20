/**
 * Integration report.
 */

import type { IntelligenceOsIntegrationRequest } from "./request";
import type { IntegrationArtifactBag } from "./artifacts";
import type { IntegrationExecutionTrace } from "./trace";
import type { IntegrationResultId } from "./identifiers";
import type { IntegrationStageKind } from "./enums";

export interface IntelligenceOsIntegrationReport {
  readonly resultId: IntegrationResultId;
  readonly requestId: string;
  readonly request: IntelligenceOsIntegrationRequest;
  readonly artifacts: IntegrationArtifactBag;
  readonly trace: IntegrationExecutionTrace;
  readonly stagesCompleted: readonly IntegrationStageKind[];
  readonly success: boolean;
  readonly durationMs: number;
  readonly createdAt: string;
  readonly version: string;
}
