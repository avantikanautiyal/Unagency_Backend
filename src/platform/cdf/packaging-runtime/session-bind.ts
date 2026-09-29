/**
 * Packaging session ref helpers (exact artifactId@version).
 *
 * generatedArtifacts binding uses the generic CAS primitive — same as all services.
 */

import {
  PACKAGING_ARTIFACT_KEYS,
  type PackagingArtifactKey,
} from "../artifacts/packaging/keys";
import {
  bindGeneratedArtifactToSession,
  type BindGeneratedArtifactResult,
} from "../artifacts/generated-bind";
import type { CdfSessionState } from "../types";

export function findPackagingExactRef(
  session: CdfSessionState,
  artifactKey: PackagingArtifactKey,
): { artifactId: string; version: number } | undefined {
  const fromApproved = session.approvedArtifacts?.find(
    (r) => r.artifactKey === artifactKey,
  );
  if (fromApproved) {
    return { artifactId: fromApproved.artifactId, version: fromApproved.version };
  }
  const fromSelected = session.selectedArtifacts?.find(
    (r) => r.artifactKey === artifactKey,
  );
  if (fromSelected) {
    return { artifactId: fromSelected.artifactId, version: fromSelected.version };
  }
  const fromGenerated = session.generatedArtifacts?.find(
    (r) => r.artifactKey === artifactKey,
  );
  if (fromGenerated) {
    return {
      artifactId: fromGenerated.artifactId,
      version: fromGenerated.version,
    };
  }
  return undefined;
}

/**
 * After successful packaging ingest: persist exact generated ref via CAS.
 * Returns BindGeneratedArtifactResult (fail-closed on conflict / missing session).
 */
export function bindGeneratedPackagingArtifactToSession(input: {
  sessionId: string;
  phaseId: string;
  artifactId: string;
  version: number;
  artifactKey: string;
  organizationId?: string;
  projectId?: string;
  expectedVersion?: number;
  /** Fanout leaf scope — required when phase uses model generation fanout. */
  generationFanoutGroupId?: string;
  generationFanoutTargetId?: string;
  generationExecutionId?: string;
  generationFanoutLeaf?: boolean;
}): BindGeneratedArtifactResult {
  return bindGeneratedArtifactToSession(input);
}

export function sessionHasPackagingCanonicalRefs(
  session: CdfSessionState,
): boolean {
  const keys = new Set(Object.values(PACKAGING_ARTIFACT_KEYS));
  const lists = [
    session.approvedArtifacts,
    session.selectedArtifacts,
    session.generatedArtifacts,
  ];
  for (const list of lists) {
    for (const r of list ?? []) {
      if (keys.has(r.artifactKey as PackagingArtifactKey)) return true;
    }
  }
  return false;
}

export function packagingDependencySatisfied(
  session: CdfSessionState,
  dependencyPhaseId: string,
): { ok: true } | { ok: false; reason: "missing" | "not_approved" } {
  const { cdfDependencySatisfied } =
    require("../lifecycle/dependency-satisfaction") as typeof import("../lifecycle/dependency-satisfaction");
  const sat = cdfDependencySatisfied(session, dependencyPhaseId, {
    serviceId: session.serviceId,
    dependingPhaseId: session.phaseId ?? undefined,
  });
  if (sat.ok) return { ok: true };
  return {
    ok: false,
    reason:
      sat.reason === "not_approved" || sat.reason === "not_selected"
        ? "not_approved"
        : "missing",
  };
}
