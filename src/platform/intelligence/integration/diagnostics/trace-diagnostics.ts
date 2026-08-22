/**
 * Diagnostics helpers for integration traces.
 */

import type { IntegrationExecutionTrace } from "../contracts/trace";
import type { IntelligenceOsIntegrationReport } from "../contracts/result";
import { INTEGRATION_PIPELINE_ORDER } from "../contracts/enums";

export function summarizeTrace(trace: IntegrationExecutionTrace): string {
  const stages = trace.stages.map((s) => `${s.stage}:${s.status}`).join(" → ");
  const failed = trace.failedStage ? ` FAILED@${trace.failedStage}` : "";
  return `trace=${trace.traceId} corr=${trace.correlationId} [${stages}]${failed}`;
}

export function isCompleteFullPipeline(report: IntelligenceOsIntegrationReport): boolean {
  if (!report.success) return false;
  return INTEGRATION_PIPELINE_ORDER.every((stage) =>
    report.stagesCompleted.includes(stage)
  );
}

export function collectBridgeFailures(trace: IntegrationExecutionTrace): readonly string[] {
  return trace.bridges
    .filter((b) => b.status === "failed")
    .map((b) => `${b.bridgeName}: ${b.errorMessage ?? "unknown"}`);
}
