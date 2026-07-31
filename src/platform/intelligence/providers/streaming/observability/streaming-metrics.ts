/**
 * M9.5O1 — Bounded streaming metrics (no content / tenant / execution labels).
 */

export interface StreamingMetricsSnapshot {
  readonly active_streams: number;
  readonly streams_started: number;
  readonly streams_completed: number;
  readonly streams_failed: number;
  readonly streams_cancelled: number;
  readonly stream_precommit_failovers: number;
  readonly stream_committed_failures: number;
  readonly stream_events: number;
  readonly stream_bytes: number;
  readonly time_to_first_output_ms_sum: number;
  readonly time_to_first_output_ms_count: number;
  readonly stream_duration_ms_sum: number;
  readonly stream_duration_ms_count: number;
}

export class StreamingMetrics {
  private active = 0;
  private started = 0;
  private completed = 0;
  private failed = 0;
  private cancelled = 0;
  private precommitFailovers = 0;
  private committedFailures = 0;
  private events = 0;
  private bytes = 0;
  private ttftSum = 0;
  private ttftCount = 0;
  private durationSum = 0;
  private durationCount = 0;

  onStart(): void {
    this.active += 1;
    this.started += 1;
  }

  onEnd(input: {
    readonly outcome: "completed" | "failed" | "cancelled";
    readonly committedFailure?: boolean;
    readonly precommitFailover?: boolean;
    readonly ttftMs?: number;
    readonly durationMs?: number;
    readonly eventCount?: number;
    readonly bytesEmitted?: number;
  }): void {
    this.active = Math.max(0, this.active - 1);
    if (input.outcome === "completed") this.completed += 1;
    if (input.outcome === "failed") this.failed += 1;
    if (input.outcome === "cancelled") this.cancelled += 1;
    if (input.committedFailure) this.committedFailures += 1;
    if (input.precommitFailover) this.precommitFailovers += 1;
    if (input.ttftMs != null) {
      this.ttftSum += input.ttftMs;
      this.ttftCount += 1;
    }
    if (input.durationMs != null) {
      this.durationSum += input.durationMs;
      this.durationCount += 1;
    }
    if (input.eventCount) this.events += input.eventCount;
    if (input.bytesEmitted) this.bytes += input.bytesEmitted;
  }

  snapshot(): StreamingMetricsSnapshot {
    return {
      active_streams: this.active,
      streams_started: this.started,
      streams_completed: this.completed,
      streams_failed: this.failed,
      streams_cancelled: this.cancelled,
      stream_precommit_failovers: this.precommitFailovers,
      stream_committed_failures: this.committedFailures,
      stream_events: this.events,
      stream_bytes: this.bytes,
      time_to_first_output_ms_sum: this.ttftSum,
      time_to_first_output_ms_count: this.ttftCount,
      stream_duration_ms_sum: this.durationSum,
      stream_duration_ms_count: this.durationCount,
    };
  }
}
