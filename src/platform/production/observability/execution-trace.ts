/**
 * Execution trace for production observability.
 */

import type { IntelligenceOsIntegrationReport } from "../../intelligence/integration/contracts/result";
import type { ProductionExecutionTrace } from "../contracts/metrics";

export function buildExecutionTrace(
  report: IntelligenceOsIntegrationReport,
  nowIso: () => string
): ProductionExecutionTrace {
  const a = report.artifacts;
  const artifactKeys = (Object.keys(a) as (keyof typeof a)[]).filter(
    (k) => a[k] !== undefined
  );

  return {
    correlationId: report.trace.correlationId,
    requestId: report.requestId,
    stageTimings: report.trace.stages.map((s) => ({
      stage: s.stage,
      durationMs: s.durationMs,
      status: s.status,
    })),
    bridgeTimings: report.trace.bridges.map((b) => ({
      bridgeName: b.bridgeName,
      durationMs: b.durationMs,
      status: b.status,
    })),
    providerTimings: {
      totalMs: a.runtime?.statistics.totalMs ?? 0,
      executionMs: a.runtime?.statistics.executionMs ?? 0,
      retries: a.runtime?.statistics.retries ?? 0,
    },
    artifactKeys: artifactKeys.map(String),
    evaluationSummary: a.evaluation
      ? {
          overallScore: a.evaluation.report.summary.overallScore,
          passed: a.evaluation.report.summary.passed,
          confidence: a.evaluation.confidence.confidenceScore,
        }
      : undefined,
    experienceSummary: a.experienceIntelligence
      ? { present: true }
      : a.experienceInjection
        ? { injectionPresent: true }
        : undefined,
    learningSummary: a.learning ? { present: true } : undefined,
    capturedAt: nowIso(),
  };
}
