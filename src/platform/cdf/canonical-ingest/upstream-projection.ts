/**
 * Completion provenance is a projection of the target phase's declared
 * dependencies. It must not become a snapshot of unrelated session state.
 */

import {
  resolveCdfCanonicalService,
  tryResolveCdfPhaseDependencies,
} from "../canonical";
import { getCdfSession } from "../session-store";
import type { CdfSessionArtifactRef } from "../types";

export type CanonicalUpstreamArtifactRef = {
  artifactId: string;
  version: number;
  artifactKey: string;
};

function refsForRole(input: {
  readonly sessionId: string;
  readonly serviceId: string;
  readonly phaseId: string;
}): Array<{ ref: CdfSessionArtifactRef; artifactKey: string }> {
  const session = getCdfSession(input.sessionId);
  const service = resolveCdfCanonicalService(input.serviceId);
  const phase = service?.phases.find((p) => p.phaseId === input.phaseId);
  if (!session || !service || !phase) return [];

  const resolved = tryResolveCdfPhaseDependencies(
    service.serviceId,
    phase.phaseId,
    phase,
  );
  if (!resolved.ok) return [];

  const refs: Array<{ ref: CdfSessionArtifactRef; artifactKey: string }> = [];
  for (const dependency of resolved.dependencies) {
    const upstream = service.phases.find(
      (candidate) => candidate.phaseId === dependency.phaseId,
    );
    const artifactKey = dependency.artifactKey ?? upstream?.artifact.artifactKey;
    if (!artifactKey) continue;

    const candidates =
      dependency.requiredRole === "approved"
        ? [session.approvedArtifacts]
        : dependency.requiredRole === "selected"
          ? [session.approvedArtifacts, session.selectedArtifacts]
          : [session.generatedArtifacts];
    for (const list of candidates) {
      for (const ref of list ?? []) {
        if (
          ref.phaseId === dependency.phaseId &&
          ref.artifactKey === artifactKey
        ) {
          refs.push({ ref, artifactKey });
        }
      }
    }
  }
  return refs;
}

/**
 * Exact ArtifactVersions allowed by the target phase dependency contract.
 * `artifactProjectionMode` controls provider payload shape upstream; this
 * function preserves the same exact identities for completion provenance.
 */
export function collectContractUpstreamRefs(input: {
  readonly sessionId: string;
  readonly serviceId: string;
  readonly phaseId: string;
}): CanonicalUpstreamArtifactRef[] {
  const seen = new Set<string>();
  const refs: CanonicalUpstreamArtifactRef[] = [];
  for (const { ref, artifactKey } of refsForRole(input)) {
    const exact = `${ref.artifactId}@${ref.version}`;
    if (seen.has(exact)) continue;
    seen.add(exact);
    refs.push({
      artifactId: ref.artifactId,
      version: ref.version,
      artifactKey,
    });
  }
  return refs;
}
