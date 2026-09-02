/**
 * Job lifecycle transitions.
 */

import type { JobStatus } from "../contracts/enums";
import { failure, success, type Result } from "../../../core/result";
import { ValidationError } from "../../../core/errors";

const ALLOWED: Record<JobStatus, readonly JobStatus[]> = {
  queued: ["reserved", "cancelled", "dead_letter"],
  reserved: ["running", "queued", "cancelled"],
  running: [
    "completed",
    "failed",
    "retrying",
    "paused",
    "cancel_requested",
    "cancel_in_progress",
    "cancelled",
  ],
  paused: ["queued", "running", "cancelled"],
  cancel_requested: ["cancel_in_progress", "cancelled"],
  cancel_in_progress: ["cancelled"],
  cancelled: ["archived"],
  retrying: ["queued", "dead_letter", "cancelled"],
  completed: ["archived"],
  failed: ["retrying", "dead_letter", "archived", "queued"],
  dead_letter: ["queued", "archived"],
  archived: [],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export function transitionJob(
  from: JobStatus,
  to: JobStatus
): Result<JobStatus> {
  if (from === to) return success(to);
  if (!canTransition(from, to)) {
    return failure(new ValidationError(`invalid job transition ${from} → ${to}`));
  }
  return success(to);
}
