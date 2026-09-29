/**
 * Explicit artifact lifecycle transitions (M3A).
 * Selection does not imply approval.
 */

import type { CdfCanonicalArtifactStatus } from "./types";
import { artifactError } from "./errors";

const ALLOWED: Record<
  CdfCanonicalArtifactStatus,
  readonly CdfCanonicalArtifactStatus[]
> = {
  candidate: ["validated", "selected", "approved", "rejected", "archived", "superseded"],
  validated: ["selected", "approved", "rejected", "archived", "superseded", "candidate"],
  selected: ["approved", "superseded", "rejected", "archived", "candidate", "validated"],
  approved: ["superseded", "archived"],
  superseded: ["archived"],
  rejected: ["archived", "candidate"],
  archived: [],
};

export function assertArtifactTransition(
  from: CdfCanonicalArtifactStatus,
  to: CdfCanonicalArtifactStatus,
): void {
  if (from === to) return;
  const allowed = ALLOWED[from] ?? [];
  if (!allowed.includes(to)) {
    throw artifactError(
      "ARTIFACT_INVALID_TRANSITION",
      `Invalid artifact status transition ${from} → ${to}`,
      { from, to },
    );
  }
}

export function canTransitionArtifactStatus(
  from: CdfCanonicalArtifactStatus,
  to: CdfCanonicalArtifactStatus,
): boolean {
  try {
    assertArtifactTransition(from, to);
    return true;
  } catch {
    return false;
  }
}
