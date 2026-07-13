/**
 * Scheduler ports.
 * Architecture only — no implementation.
 *
 * No BullMQ/Kafka/Redis dependency in foundation phase.
 */

export type ScheduleKind =
  | "delayed"
  | "retry"
  | "cron"
  | "workflow_resume"
  | "long_running"
  | "timeout";

export interface ScheduleRequest {
  readonly kind: ScheduleKind;
  readonly runAt?: string;
  readonly cronExpression?: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly correlationId?: string;
}

export interface ScheduleHandle {
  readonly scheduleId: string;
  readonly kind: ScheduleKind;
  readonly status: "scheduled" | "cancelled" | "fired" | "failed";
}

export interface IScheduler {
  schedule(request: ScheduleRequest): Promise<ScheduleHandle>;
  cancel(scheduleId: string): Promise<void>;
  get(scheduleId: string): Promise<ScheduleHandle | undefined>;
}
