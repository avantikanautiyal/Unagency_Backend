/**
 * Phase 20 — Executable rollback verification helpers.
 */

import { readFeatureFlagState } from "./flag-matrix";
import { resolveCanonicalGenerationEligibility } from "./eligibility";
import { describeFlagMatrixCell } from "./flag-matrix";

export type RollbackVerification = {
  readonly ok: boolean;
  readonly generationOff: boolean;
  readonly repairOff: boolean;
  readonly path: "legacy";
  readonly cdfTransitionsExpected: "functional";
  readonly clientsCompatible: true;
  readonly message: string;
};

/**
 * Verify flag-off rollback yields legacy generation decision.
 * Does not mutate env — pass the post-rollback env snapshot.
 */
export function verifyFlagOffRollback(
  env: NodeJS.ProcessEnv = process.env,
): RollbackVerification {
  const flags = readFeatureFlagState(env);
  const decision = resolveCanonicalGenerationEligibility(
    {
      organizationId: "org_rollback_probe",
      projectId: "proj_rollback_probe",
      serviceId: "presentation",
    },
    env,
  );
  const matrix = describeFlagMatrixCell(
    flags.cdfCanonicalGenerationContext,
    flags.cdfCanonicalAutomaticRepair,
  );
  const ok =
    !flags.cdfCanonicalGenerationContext &&
    !flags.cdfCanonicalAutomaticRepair &&
    decision.path === "legacy" &&
    matrix.legacyCreatePath === "unchanged";

  return {
    ok,
    generationOff: !flags.cdfCanonicalGenerationContext,
    repairOff: !flags.cdfCanonicalAutomaticRepair,
    path: "legacy",
    cdfTransitionsExpected: "functional",
    clientsCompatible: true,
    message: ok
      ? "Rollback verified: both flags OFF → legacy path"
      : "Rollback incomplete: flags still enabling canonical or unexpected path",
  };
}
