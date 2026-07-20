/** Telemetry — stage timing aggregation from diagnostics. */
import type { PipelineDiagnostics } from "../contracts/diagnostics";

export interface PipelineTelemetry {
  readonly totalDurationMs: number;
  readonly stageCount: number;
  readonly slowestStage: string | undefined;
}

export function aggregateTelemetry(diagnostics: PipelineDiagnostics): PipelineTelemetry {
  const timings = diagnostics.stageTimings;
  const slowest = timings.reduce(
    (best, t) => (!best || t.durationMs > best.durationMs ? t : best),
    timings[0]
  );
  return {
    totalDurationMs: timings.reduce((sum, t) => sum + t.durationMs, 0),
    stageCount: timings.length,
    slowestStage: slowest?.stage,
  };
}
