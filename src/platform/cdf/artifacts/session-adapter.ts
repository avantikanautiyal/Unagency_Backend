/**
 * Session ↔ Artifact Engine adapter (M3A / M8C).
 * Session stores references only — never full artifact payloads.
 */

import type { CdfSessionState } from "../types";
import type { CdfArtifactSessionRef } from "./types";
import { isCdfCanonicalArtifactId } from "./ids";
import { markApproved, markSelected } from "./repository";
import { CdfArtifactError } from "./errors";

export function upsertSessionArtifactRef(
  session: CdfSessionState,
  ref: CdfArtifactSessionRef,
): CdfSessionState {
  const approvedArtifacts = [...(session.approvedArtifacts ?? [])];
  const selectedArtifacts = [...(session.selectedArtifacts ?? [])];
  const generatedArtifacts = [...(session.generatedArtifacts ?? [])];

  const upsertInto = (list: CdfArtifactSessionRef[]): void => {
    const i = list.findIndex((r) => {
      if (r.artifactKey !== ref.artifactKey || r.phaseId !== ref.phaseId) {
        return false;
      }
      // Generated fanout leaves: one pin per leaf target (same artifactKey/phase OK).
      if (ref.role === "generated" && ref.generationFanoutTargetId) {
        return r.generationFanoutTargetId === ref.generationFanoutTargetId;
      }
      if (ref.role === "generated" && ref.generationExecutionId) {
        return r.generationExecutionId === ref.generationExecutionId;
      }
      // Non-fanout generated / selected / approved: preserve prior keying.
      // Do not collide with fanout-scoped generated pins.
      if (ref.role === "generated") {
        return !r.generationFanoutTargetId && !r.generationExecutionId;
      }
      return true;
    });
    if (i >= 0) list[i] = ref;
    else list.push(ref);
  };

  if (ref.role === "approved") {
    upsertInto(approvedArtifacts);
  } else if (ref.role === "generated") {
    upsertInto(generatedArtifacts);
  } else {
    upsertInto(selectedArtifacts);
  }

  return {
    ...session,
    approvedArtifacts,
    selectedArtifacts,
    generatedArtifacts,
  };
}

/**
 * When transition carries a CDF canonical artifact id + version,
 * update Artifact Engine lifecycle and session refs.
 * Legacy opaque artifactId strings are left alone.
 *
 * Selection does NOT call markApproved — legacy approved[] dual-write stays separate.
 */
export function applyArtifactEngineOnApprove(input: {
  session: CdfSessionState;
  phaseId: string;
  artifactId?: string;
  artifactVersion?: number;
  artifactKey?: string;
  organizationId?: string;
  projectId?: string;
  /** Exact fanout leaf identity when approving a model-generation fanout pin. */
  generationFanoutTargetId?: string;
  generationFanoutGroupId?: string;
  generationExecutionId?: string;
}): CdfSessionState {
  const { artifactId, artifactVersion } = input;
  if (!artifactId || artifactVersion == null) return input.session;
  if (!isCdfCanonicalArtifactId(artifactId)) return input.session;

  try {
    markApproved(artifactId, artifactVersion, {
      organizationId: input.organizationId ?? input.session.organizationId,
      projectId: input.projectId ?? input.session.projectId,
    });
  } catch (err) {
    if (err instanceof CdfArtifactError) throw err;
    throw err;
  }

  const fanoutTarget = input.generationFanoutTargetId?.trim() || "";
  const fanoutGroup = input.generationFanoutGroupId?.trim() || "";
  const fanoutExec = input.generationExecutionId?.trim() || "";

  return upsertSessionArtifactRef(input.session, {
    artifactId,
    version: artifactVersion,
    phaseId: input.phaseId,
    artifactKey: input.artifactKey ?? "unknown",
    role: "approved",
    ...(fanoutTarget ? { generationFanoutTargetId: fanoutTarget } : {}),
    ...(fanoutGroup ? { generationFanoutGroupId: fanoutGroup } : {}),
    ...(fanoutExec ? { generationExecutionId: fanoutExec } : {}),
  });
}

export function applyArtifactEngineOnSelect(input: {
  session: CdfSessionState;
  phaseId: string;
  artifactId?: string;
  artifactVersion?: number;
  artifactKey?: string;
  organizationId?: string;
  projectId?: string;
  /** Forwarded onto the written "selected" ref — see CdfSessionArtifactRef. */
  selectionRouteIndex?: number;
}): CdfSessionState {
  const { artifactId, artifactVersion } = input;
  if (!artifactId || artifactVersion == null) return input.session;
  if (!isCdfCanonicalArtifactId(artifactId)) return input.session;

  markSelected(artifactId, artifactVersion, {
    organizationId: input.organizationId ?? input.session.organizationId,
    projectId: input.projectId ?? input.session.projectId,
  });

  return upsertSessionArtifactRef(input.session, {
    artifactId,
    version: artifactVersion,
    phaseId: input.phaseId,
    artifactKey: input.artifactKey ?? "unknown",
    role: "selected",
    ...(input.selectionRouteIndex != null
      ? { selectionRouteIndex: input.selectionRouteIndex }
      : {}),
  });
}
