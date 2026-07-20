/**
 * Distributed Execution enumerations.
 */

export type JobStatus =
  | "queued"
  | "reserved"
  | "running"
  | "paused"
  | "cancel_requested"
  | "cancel_in_progress"
  | "cancelled"
  | "retrying"
  | "completed"
  | "failed"
  | "dead_letter"
  | "archived";

export type QueueKind =
  | "immediate"
  | "scheduled"
  | "priority"
  | "streaming"
  | "long_running"
  | "retry"
  | "dead_letter"
  | "batch";

export type WorkerKind =
  | "execution"
  | "streaming"
  | "background"
  | "retry"
  | "recovery";

export type JobPriority = "critical" | "high" | "normal" | "low" | "bulk";

export type RetryStrategy = "immediate" | "linear" | "exponential";

export type CancellationPhase =
  | "requested"
  | "in_progress"
  | "cancelled"
  | "compensation";

export type BatchMode = "parallel" | "sequential";

export type BackoffFailureClass =
  | "transient"
  | "timeout"
  | "provider"
  | "validation"
  | "fatal";
