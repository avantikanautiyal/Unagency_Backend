/**
 * Phase 18 — Safe benchmark observability via existing execution-trace.
 */

import { recordExecutionTraceStage } from "../../os/observability/execution-trace";
import type { BenchmarkResult } from "./types";

export function emitBenchmarkTrace(result: BenchmarkResult): void {
  const executionId =
    result.run.executionId ?? `benchmark_${result.run.runId}`;
  recordExecutionTraceStage({
    executionId,
    stage: "canonical_benchmark",
    status:
      result.status === "PASS"
        ? "COMPLETED"
        : result.status === "SKIPPED" || result.status === "UNSUPPORTED"
          ? "SKIPPED"
          : "FAILED",
    error: result.status === "FAIL" || result.status === "ERROR" ? result.status : undefined,
    details: {
      caseId: result.run.caseId,
      scenario: result.run.scenario,
      actionId: result.run.actionId,
      actionVersion: result.run.actionVersion,
      serviceId: result.run.serviceId,
      phaseId: result.run.phaseId,
      status: result.status,
      qaStatus: result.outputQa.status,
      qaCodeCount: result.outputQa.codes.length,
      repairApplicable: result.repair.applicable,
      repairInvalidToValid: result.repair.invalidToValid ?? false,
      isolationHonored: result.isolationHonored,
      subjectiveScoreUsed: false,
      autoEnabledFlags: false,
      harnessVersion: result.run.harnessVersion,
      featureFlags: result.run.featureFlags,
      // Never include prompts, bodies, secrets, URLs, payloads
      sensitiveBodiesOmitted: true,
    },
  });
}
