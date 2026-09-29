/**
 * On packaging dieline config select_route: materialize packaging.dieline
 * ArtifactVersion from the selected path label (pathKind).
 *
 * Config modality is none — without this pin, packaging.3d-direction cannot
 * resolve dielineRef for canonical ingest. Selection ≠ approval.
 */

import {
  applyArtifactEngineOnSelect,
  upsertSessionArtifactRef,
} from "../artifacts";
import { PACKAGING_ARTIFACT_KEYS } from "../artifacts/packaging/keys";
import { ingestGenerationCompletion } from "../generation-artifact";
import type { CdfSessionState } from "../types";

export type EnsurePackagingDielineOnSelectInput = {
  session: CdfSessionState;
  phaseId: string;
  routeIndex: number;
  routeTitle: string;
  routeDesc?: string;
  routeLabel?: string;
  artifactId?: string;
  artifactVersion?: number;
  organizationId?: string;
  projectId?: string;
  workspaceId?: string;
  userId?: string;
};

export type EnsurePackagingDielineOnSelectResult = {
  session: CdfSessionState;
  dielineRef: { artifactId: string; version: number };
  idempotent: boolean;
};

function pathKindFromLabel(label: string): "upload_dieline" | "none" | "existing_pack" {
  const lower = label.toLowerCase();
  if (lower.includes("existing")) return "existing_pack";
  if (
    lower.includes("don't") ||
    lower.includes("dont") ||
    lower.includes("don't have") ||
    lower === "none"
  ) {
    return "none";
  }
  if (lower.includes("upload") || lower.includes("dieline")) {
    return "upload_dieline";
  }
  return "none";
}

/**
 * Materialize packaging.dieline from explicit config selection.
 */
export function ensurePackagingDielineOnSelect(
  input: EnsurePackagingDielineOnSelectInput,
): EnsurePackagingDielineOnSelectResult {
  const session = input.session;
  const org = input.organizationId ?? session.organizationId;
  const projectId = input.projectId ?? session.projectId;

  const existing = session.selectedArtifacts?.find(
    (r) =>
      r.artifactKey === PACKAGING_ARTIFACT_KEYS.dieline &&
      r.phaseId === input.phaseId,
  ) ??
    session.generatedArtifacts?.find(
      (r) =>
        r.artifactKey === PACKAGING_ARTIFACT_KEYS.dieline &&
        r.phaseId === input.phaseId,
    );

  if (
    existing &&
    input.artifactId &&
    input.artifactVersion != null &&
    existing.artifactId === input.artifactId &&
    existing.version === input.artifactVersion
  ) {
    return {
      session,
      dielineRef: {
        artifactId: existing.artifactId,
        version: existing.version,
      },
      idempotent: true,
    };
  }
  // Same route re-clicked (no explicit handle, but this is the exact
  // routeIndex that produced the existing pin) is a true no-op. A missing
  // selectionRouteIndex (pin predates this field, or a genuinely different
  // route) falls through and re-materializes below rather than assuming
  // identity.
  if (
    existing &&
    !input.artifactId &&
    existing.selectionRouteIndex === input.routeIndex
  ) {
    return {
      session,
      dielineRef: {
        artifactId: existing.artifactId,
        version: existing.version,
      },
      idempotent: true,
    };
  }

  const label =
    input.routeLabel?.trim() ||
    input.routeTitle?.trim() ||
    `Dieline ${input.routeIndex + 1}`;
  const pathKind = pathKindFromLabel(label);

  const ingest = ingestGenerationCompletion({
    sessionId: session.sessionId,
    serviceId: "packaging",
    phaseId: input.phaseId,
    organizationId: org,
    projectId,
    workspaceId: input.workspaceId ?? session.workspaceId,
    userId: input.userId ?? session.userId,
    executionId: `dieline_select_${session.sessionId}_${input.routeIndex}`,
    rawOutput: {
      pathKind,
      label,
      title: input.routeTitle || label,
      description: input.routeDesc,
    },
    activeBriefId: session.activeBriefId,
    activeBriefVersion: session.activeBriefVersion,
    // Session CAS bump may not be persisted yet during select_route — skip stale pin.
    requestId: `pack_dieline_select_${session.sessionId}_${input.routeIndex}`,
    requireAcceptanceGate: true,
  });

  let next = upsertSessionArtifactRef(session, {
    artifactId: ingest.artifactId,
    version: ingest.artifactVersion,
    phaseId: input.phaseId,
    artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
    role: "generated",
    selectionRouteIndex: input.routeIndex,
  });
  next = applyArtifactEngineOnSelect({
    session: next,
    phaseId: input.phaseId,
    artifactId: ingest.artifactId,
    artifactVersion: ingest.artifactVersion,
    artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
    organizationId: org,
    projectId,
    selectionRouteIndex: input.routeIndex,
  });

  return {
    session: next,
    dielineRef: {
      artifactId: ingest.artifactId,
      version: ingest.artifactVersion,
    },
    idempotent: false,
  };
}
