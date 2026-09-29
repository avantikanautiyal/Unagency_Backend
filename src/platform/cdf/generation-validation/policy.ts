/**
 * Aggregate check results into ValidationResult status (M4 policy).
 */

import type {
  CdfValidationCheck,
  CdfValidationStatus,
} from "./types";

/**
 * PASS: no blocking fails; machine-verifiable required checks all pass.
 * FAIL: ≥1 blocking machine-verifiable fail.
 * REQUIRES_CLARIFICATION: blocking unable_to_verify on required constraints.
 * REVIEW_REQUIRED: no blocking fails, but semantic_review_required checks exist.
 */
export function aggregateValidationStatus(
  checks: CdfValidationCheck[],
): CdfValidationStatus {
  const blockingFails = checks.filter(
    (c) => c.severity === "blocking" && c.status === "fail",
  );
  if (blockingFails.length) return "failed";

  const blockingUnable = checks.filter(
    (c) =>
      c.severity === "blocking" &&
      (c.status === "unable_to_verify" || c.status === "not_applicable") &&
      c.capability !== "semantic_review_required",
  );
  // Only treat unable_to_verify as clarification when it's a required machine field
  // that we expected to observe (count/dimensions missing on wrong artifact type).
  if (
    blockingUnable.some(
      (c) =>
        c.verificationType === "count" ||
        c.verificationType === "dimensions" ||
        c.verificationType === "exact_match",
    )
  ) {
    return "requires_clarification";
  }

  const semantic = checks.filter(
    (c) => c.status === "semantic_review_required",
  );
  if (semantic.length) return "review_required";

  return "passed";
}

export function summarizeValidation(
  status: CdfValidationStatus,
  checks: CdfValidationCheck[],
): string {
  const fails = checks.filter((c) => c.status === "fail").length;
  const passes = checks.filter((c) => c.status === "pass").length;
  const review = checks.filter(
    (c) => c.status === "semantic_review_required",
  ).length;
  return `status=${status}; pass=${passes}; fail=${fails}; semantic_review=${review}; total=${checks.length}`;
}
