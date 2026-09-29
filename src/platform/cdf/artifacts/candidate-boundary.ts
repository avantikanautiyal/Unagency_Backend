/**
 * Candidate → Canonical Artifact boundary (M3A).
 * Structural validation only — semantic creative validation is M4.
 */

import { createArtifact, createVersion, getArtifact } from "./repository";
import { assertCdfArtifactId } from "./ids";
import { artifactError } from "./errors";
import type {
  ArtifactCandidateInput,
  CdfCanonicalArtifact,
  CdfArtifactVersionRecord,
} from "./types";

export function createArtifactFromCandidate(
  candidate: ArtifactCandidateInput,
): { artifact: CdfCanonicalArtifact; version: CdfArtifactVersionRecord } {
  const provenance = {
    sourceInputIds: candidate.sourceInputIds,
    activeBriefId: candidate.activeBriefId,
    activeBriefVersion: candidate.activeBriefVersion,
    contextId: candidate.contextId,
    contextHash: candidate.contextHash,
    sessionVersion: candidate.sessionVersion,
    executionId: candidate.executionId,
    candidateRequestId: candidate.requestId,
  };

  if (candidate.parentArtifactId) {
    assertCdfArtifactId(candidate.parentArtifactId);
    const parent = getArtifact(candidate.parentArtifactId, {
      organizationId: candidate.organizationId,
      projectId: candidate.projectId,
    });
    if (
      candidate.parentVersion != null &&
      candidate.parentVersion !== parent.latestVersion
    ) {
      throw artifactError(
        "ARTIFACT_VERSION_CONFLICT",
        `parentVersion ${candidate.parentVersion} is not latest (${parent.latestVersion}); create from latest`,
        {
          parentArtifactId: candidate.parentArtifactId,
          parentVersion: candidate.parentVersion,
          latestVersion: parent.latestVersion,
        },
      );
    }
    return createVersion({
      artifactId: candidate.parentArtifactId,
      expectedLatestVersion: parent.latestVersion,
      data: candidate.data,
      schemaVersion: candidate.schemaVersion,
      provenance,
      sourceArtifacts: candidate.sourceArtifacts,
      userId: candidate.userId,
      requestId: candidate.requestId,
      organizationId: candidate.organizationId,
      projectId: candidate.projectId,
    });
  }

  return createArtifact({
    sessionId: candidate.sessionId,
    serviceId: candidate.serviceId,
    phaseId: candidate.phaseId,
    projectId: candidate.projectId,
    organizationId: candidate.organizationId,
    workspaceId: candidate.workspaceId,
    userId: candidate.userId,
    artifactKey: candidate.artifactKey,
    artifactType: candidate.artifactType,
    schemaVersion: candidate.schemaVersion,
    data: candidate.data,
    provenance,
    sourceArtifacts: candidate.sourceArtifacts,
    requestId: candidate.requestId,
  });
}
