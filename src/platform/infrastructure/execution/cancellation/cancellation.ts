/**
 * Cancellation helpers.
 */

import type { ExecutionJob } from "../contracts/job";
import { transitionJob } from "../lifecycle/job-lifecycle";
import { failure, success, type Result } from "../../../intelligence/shared/result";
import { ValidationError } from "../../../intelligence/shared/errors";

export function requestCancellation(
  job: ExecutionJob,
  nowIso: string
): Result<ExecutionJob> {
  if (
    job.status === "completed" ||
    job.status === "cancelled" ||
    job.status === "dead_letter" ||
    job.status === "archived"
  ) {
    return failure(new ValidationError(`cannot cancel job in state ${job.status}`));
  }

  if (job.status === "queued" || job.status === "reserved" || job.status === "retrying") {
    const t = transitionJob(job.status === "retrying" ? "retrying" : job.status, "cancelled");
    if (!t.ok) return t;
    return success({
      ...job,
      status: "cancelled",
      cancelRequested: true,
      updatedAt: nowIso,
      completedAt: nowIso,
    });
  }

  const requested = transitionJob(job.status, "cancel_requested");
  if (!requested.ok) {
    // running → cancel_requested
    return failure(requested.error);
  }
  return success({
    ...job,
    status: "cancel_requested",
    cancelRequested: true,
    updatedAt: nowIso,
  });
}

export function advanceCancellation(
  job: ExecutionJob,
  nowIso: string
): Result<ExecutionJob> {
  if (job.status === "cancel_requested") {
    const mid = transitionJob("cancel_requested", "cancel_in_progress");
    if (!mid.ok) return mid;
    return success({
      ...job,
      status: "cancel_in_progress",
      updatedAt: nowIso,
    });
  }
  if (job.status === "cancel_in_progress" || job.cancelRequested) {
    const done = transitionJob(
      job.status === "cancel_in_progress" ? "cancel_in_progress" : "running",
      "cancelled"
    );
    if (!done.ok && job.status === "running") {
      return success({
        ...job,
        status: "cancelled",
        updatedAt: nowIso,
        completedAt: nowIso,
      });
    }
    if (!done.ok) return done;
    return success({
      ...job,
      status: "cancelled",
      updatedAt: nowIso,
      completedAt: nowIso,
    });
  }
  return success(job);
}
