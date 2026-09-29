/**
 * Generic exact-version generatedArtifacts bind (CAS).
 *
 * Authoritative for every CDF service: Social Media, Packaging, Presentation, …
 * Never resolves "latest". Never stores payloads. Never service-branches.
 */

import { getArtifact, getArtifactVersion } from "./repository";
import { CdfArtifactError } from "./errors";
import { upsertSessionArtifactRef } from "./session-adapter";
import type { CdfSessionArtifactRef, CdfSessionState } from "../types";
import {
  compareAndSwapCdfSession,
  getCdfSession,
  persistCdfSession,
} from "../session-store";

export type BindGeneratedArtifactResult =
  | {
      ok: true;
      session: CdfSessionState;
      idempotentReplay?: boolean;
    }
  | {
      ok: false;
      code:
        | "SESSION_NOT_FOUND"
        | "SESSION_VERSION_CONFLICT"
        | "FANOUT_TARGET_ID_REQUIRED"
        | "FANOUT_TARGET_ID_DUPLICATE";
      message: string;
      currentVersion?: number;
      expectedVersion?: number;
    };

/**
 * Persist exact generated ref on session via M1B optimistic concurrency.
 *
 * expectedVersion → validate exact ArtifactVersion → upsert generatedArtifacts
 * → compareAndSwapCdfSession → sessionVersion + 1
 */
export function bindGeneratedArtifactToSession(input: {
  sessionId: string;
  phaseId: string;
  artifactId: string;
  version: number;
  artifactKey: string;
  organizationId?: string;
  projectId?: string;
  expectedVersion?: number;
  /** Intentional fanout leaf scope — optional; scopes generated pin identity. */
  generationFanoutGroupId?: string;
  generationFanoutTargetId?: string;
  generationExecutionId?: string;
  /** Explicit leaf claim — require generationFanoutTargetId when true. */
  generationFanoutLeaf?: boolean;
}): BindGeneratedArtifactResult {
  const session = getCdfSession(input.sessionId);
  if (!session) {
    return {
      ok: false,
      code: "SESSION_NOT_FOUND",
      message: `CDF session not found: ${input.sessionId}`,
    };
  }

  if (
    typeof input.version !== "number" ||
    !Number.isInteger(input.version) ||
    input.version < 1
  ) {
    throw new CdfArtifactError(
      "ARTIFACT_VERSION_NOT_FOUND",
      `Invalid generated version: ${String(input.version)}`,
    );
  }

  const ownership = {
    organizationId: input.organizationId ?? session.organizationId,
    projectId: input.projectId ?? session.projectId,
  };

  const artifact = getArtifact(input.artifactId, ownership);
  const exact = getArtifactVersion(input.artifactId, input.version, ownership);

  if (artifact.sessionId && artifact.sessionId !== input.sessionId) {
    throw new CdfArtifactError(
      "ARTIFACT_OWNERSHIP_INVALID",
      "Artifact does not belong to this CDF session",
      { artifactId: input.artifactId, sessionId: input.sessionId },
    );
  }

  if (artifact.artifactKey !== input.artifactKey) {
    throw new CdfArtifactError(
      "ARTIFACT_REFERENCE_INVALID",
      `artifactKey mismatch: session expects ${input.artifactKey}, artifact has ${artifact.artifactKey}`,
    );
  }

  if (artifact.phaseId && artifact.phaseId !== input.phaseId) {
    throw new CdfArtifactError(
      "ARTIFACT_REFERENCE_INVALID",
      `phaseId mismatch: session expects ${input.phaseId}, artifact has ${artifact.phaseId}`,
    );
  }

  if (exact.version !== input.version) {
    throw new CdfArtifactError(
      "ARTIFACT_VERSION_NOT_FOUND",
      "Exact version mismatch — refusing silent substitution",
    );
  }

  const fanoutTarget =
    typeof input.generationFanoutTargetId === "string"
      ? input.generationFanoutTargetId.trim()
      : "";
  const fanoutGroup =
    typeof input.generationFanoutGroupId === "string"
      ? input.generationFanoutGroupId.trim()
      : "";
  const generationExecutionId =
    typeof input.generationExecutionId === "string"
      ? input.generationExecutionId.trim()
      : "";
  const claimsFanoutLeaf =
    input.generationFanoutLeaf === true || fanoutGroup.length > 0;

  // C6: fanout-claimed binds must carry leaf targetId — never fall back to
  // first/global unscoped pin (sibling overwrite / first-match).
  if (claimsFanoutLeaf && !fanoutTarget) {
    return {
      ok: false,
      code: "FANOUT_TARGET_ID_REQUIRED",
      message:
        "Fanout leaf bind requires generationFanoutTargetId — refusing unscoped session pin",
      currentVersion: session.sessionVersion,
      expectedVersion: session.sessionVersion,
    };
  }

  if (fanoutTarget) {
    const duplicateTarget = session.generatedArtifacts?.find(
      (r) =>
        r.artifactKey === input.artifactKey &&
        r.phaseId === input.phaseId &&
        r.generationFanoutTargetId === fanoutTarget &&
        (r.artifactId !== input.artifactId || r.version !== input.version),
    );
    if (duplicateTarget) {
      return {
        ok: false,
        code: "FANOUT_TARGET_ID_DUPLICATE",
        message: `generationFanoutTargetId "${fanoutTarget}" already bound to ${duplicateTarget.artifactId}@${duplicateTarget.version}`,
        currentVersion: session.sessionVersion,
        expectedVersion: session.sessionVersion,
      };
    }
  }

  const existing = session.generatedArtifacts?.find((r) => {
    if (
      r.artifactKey !== input.artifactKey ||
      r.phaseId !== input.phaseId ||
      r.artifactId !== input.artifactId ||
      r.version !== input.version
    ) {
      return false;
    }
    if (fanoutTarget) {
      return r.generationFanoutTargetId === fanoutTarget;
    }
    if (generationExecutionId) {
      return r.generationExecutionId === generationExecutionId;
    }
    return !r.generationFanoutTargetId && !r.generationExecutionId;
  });
  if (existing) {
    return { ok: true, session, idempotentReplay: true };
  }

  const expectedVersion =
    typeof input.expectedVersion === "number"
      ? input.expectedVersion
      : session.sessionVersion;

  if (expectedVersion !== session.sessionVersion) {
    return {
      ok: false,
      code: "SESSION_VERSION_CONFLICT",
      message: `Session version conflict: expected ${expectedVersion}, current ${session.sessionVersion}`,
      expectedVersion,
      currentVersion: session.sessionVersion,
    };
  }

  const ref: CdfSessionArtifactRef = {
    artifactId: input.artifactId,
    version: input.version,
    phaseId: input.phaseId,
    artifactKey: input.artifactKey,
    role: "generated",
    ...(fanoutGroup ? { generationFanoutGroupId: fanoutGroup } : {}),
    ...(fanoutTarget ? { generationFanoutTargetId: fanoutTarget } : {}),
    ...(generationExecutionId
      ? { generationExecutionId }
      : {}),
  };
  const next = upsertSessionArtifactRef(session, ref);
  const swapped = compareAndSwapCdfSession(input.sessionId, expectedVersion, {
    ...next,
    updatedAt: new Date().toISOString(),
  });
  if (!swapped) {
    const live = getCdfSession(input.sessionId);
    return {
      ok: false,
      code: "SESSION_VERSION_CONFLICT",
      message: `Session version conflict during generatedArtifacts bind (expected ${expectedVersion})`,
      expectedVersion,
      currentVersion: live?.sessionVersion,
    };
  }

  try {
    console.info(
      JSON.stringify({
        scope: "cdf.artifacts",
        event: "generated_artifacts_pinned",
        sessionId: input.sessionId,
        sessionVersion: swapped.sessionVersion,
        phaseId: input.phaseId,
        artifactKey: input.artifactKey,
        artifactId: input.artifactId,
        artifactVersion: input.version,
        ...(fanoutGroup ? { generationFanoutGroupId: fanoutGroup } : {}),
        ...(fanoutTarget ? { generationFanoutTargetId: fanoutTarget } : {}),
        ...(generationExecutionId
          ? { generationExecutionId }
          : {}),
        ts: new Date().toISOString(),
      }),
    );
  } catch {
    // ignore
  }

  void persistCdfSession(swapped).catch(() => undefined);
  return { ok: true, session: swapped };
}
