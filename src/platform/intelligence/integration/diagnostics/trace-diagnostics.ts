/**
 * Diagnostics helpers for integration traces.
 */

import type { IntegrationExecutionTrace } from "../contracts/trace";
import type { IntelligenceOsIntegrationReport } from "../contracts/result";

export function summarizeTrace(trace: IntegrationExecutionTrace): string {
  const stages = trace.stages.map((s) => `${s.stage}:${s.status}`).join(" → ");
  const failed = trace.failedStage ? ` FAILED@${trace.failedStage}` : "";
  return `trace=${trace.traceId} corr=${trace.correlationId} [${stages}]${failed}`;
}

export function isCompleteFullPipeline(report: IntelligenceOsIntegrationReport): boolean {
  return (
    report.success &&
    report.stagesCompleted.includes("task_intelligence") &&
    report.stagesCompleted.includes("capability_intelligence") &&
    report.stagesCompleted.includes("provider_runtime") &&
    report.stagesCompleted.includes("consensus") &&
    report.stagesCompleted.includes("evaluation") &&
    report.stagesCompleted.includes("learning") &&
    report.stagesCompleted.includes("experience_intelligence") &&
    report.stagesCompleted.includes("repository_updates")
  );
}

export function collectBridgeFailures(trace: IntegrationExecutionTrace): readonly string[] {
  return trace.bridges
    .filter((b) => b.status === "failed")
    .map((b) => `${b.bridgeName}: ${b.errorMessage ?? "unknown"}`);
}
