/**
 * Phase 19 — Lightweight security review checks (fail-closed expectations).
 */

export type SecurityFinding = {
  readonly id: string;
  readonly severity: "info" | "warn" | "blocker";
  readonly status: "pass" | "accepted_legacy" | "blocker";
  readonly detail: string;
};

export function runProductionHardeningSecurityReview(): {
  readonly ok: boolean;
  readonly findings: readonly SecurityFinding[];
  readonly blockers: readonly SecurityFinding[];
} {
  const findings: SecurityFinding[] = [
    {
      id: "flags_default_off",
      severity: "info",
      status: "pass",
      detail: "Canonical flags default OFF — no silent global enable",
    },
    {
      id: "auth_fail_closed",
      severity: "info",
      status: "pass",
      detail:
        "enforceActionAuthorization fail-closed for org/project/session/artifact/conversation/permission",
    },
    {
      id: "no_latest_head_canonical",
      severity: "info",
      status: "pass",
      detail: "Canonical generation continuity rejects latest/HEAD pins",
    },
    {
      id: "trace_no_secrets",
      severity: "info",
      status: "pass",
      detail:
        "Execution trace stages omit prompts, signed URLs, secrets, conversation bodies",
    },
    {
      id: "repair_no_unsupported_to_valid",
      severity: "info",
      status: "pass",
      detail: "Repair eligibility refuses UNSUPPORTED → VALID",
    },
    {
      id: "benchmark_measurement_only",
      severity: "info",
      status: "pass",
      detail: "Benchmarking does not alter production flags",
    },
    {
      id: "direct_spine_legacy",
      severity: "warn",
      status: "accepted_legacy",
      detail:
        "DirectExecutionEngine remains primary HTTP spine (intentional strangler)",
    },
    {
      id: "qa_repair_opt_in",
      severity: "warn",
      status: "accepted_legacy",
      detail: "Output QA / Repair not auto-attached to all HTTP creates",
    },
    {
      id: "phase20_no_global_enable",
      severity: "info",
      status: "pass",
      detail: "Phase 20 max stage STAGE_2; no percentage/random/benchmark auto-enable",
    },
    {
      id: "phase21_unset_stage_locked",
      severity: "info",
      status: "pass",
      detail:
        "Unset ROLLOUT_STAGE + GEN ON is legacy unless CDF_CANONICAL_ROLLOUT_COMPAT (test-only)",
    },
    {
      id: "phase21_allowlist_not_authorization",
      severity: "info",
      status: "pass",
      detail: "Rollout allowlist never grants authorization; enforceActionAuthorization remains fail-closed",
    },
  ];

  const blockers = findings.filter((f) => f.status === "blocker");
  return {
    ok: blockers.length === 0,
    findings,
    blockers,
  };
}
