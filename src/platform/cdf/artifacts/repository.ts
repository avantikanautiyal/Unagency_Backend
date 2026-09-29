/**
 * CDF Canonical Artifact Repository / Engine (M3A).
 *
 * Owns: identity, versions, lineage, lifecycle, persistence.
 * Does NOT: advance CDF phases, render files, mutate approved creative data.
 */

import {
  createCdfArtifactId,
  assertCdfArtifactId,
  isExecutionIdShape,
  isVaultAssetObjectIdShape,
} from "./ids";
import { validateArtifactData, getArtifactSchema } from "./schema-registry";
import { assertArtifactTransition } from "./lifecycle";
import { artifactError, CdfArtifactError } from "./errors";
import {
  storeGetArtifact,
  storeInsertArtifact,
  storeReplaceArtifact,
  storeGetVersion,
  storeInsertVersion,
  storeListVersions,
  storeGetIdempotency,
  storePutIdempotency,
  storePatchVersionStatus,
  storeAllocateNextVersion,
} from "./store";
import type {
  CdfCanonicalArtifact,
  CdfArtifactVersionRecord,
  CreateArtifactInput,
  CreateArtifactVersionInput,
  CdfArtifactReference,
  CdfCanonicalArtifactStatus,
} from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

function assertOwnership(
  artifact: CdfCanonicalArtifact,
  opts?: { organizationId?: string; projectId?: string },
): void {
  if (
    opts?.organizationId &&
    artifact.organizationId &&
    artifact.organizationId !== opts.organizationId
  ) {
    throw artifactError(
      "ARTIFACT_OWNERSHIP_INVALID",
      "Artifact does not belong to this organization",
      { artifactId: artifact.artifactId },
    );
  }
  if (
    opts?.projectId &&
    artifact.projectId &&
    artifact.projectId !== opts.projectId
  ) {
    throw artifactError(
      "ARTIFACT_OWNERSHIP_INVALID",
      "Artifact does not belong to this project",
      { artifactId: artifact.artifactId },
    );
  }
}

function assertRefs(refs: CdfArtifactReference[] | undefined): void {
  if (!refs) return;
  for (const r of refs) {
    assertCdfArtifactId(r.artifactId);
    if (!Number.isInteger(r.version) || r.version < 1) {
      throw artifactError(
        "ARTIFACT_REFERENCE_INVALID",
        "Cross-artifact reference must include exact version >= 1",
        { ref: r },
      );
    }
  }
}

function assertSourceVersionsExist(
  refs: CdfArtifactReference[] | undefined,
): void {
  if (!refs) return;
  for (const r of refs) {
    const v = storeGetVersion(r.artifactId, r.version);
    if (!v) {
      throw artifactError(
        "ARTIFACT_REFERENCE_INVALID",
        `Referenced artifact version not found: ${r.artifactId}@${r.version}`,
        { ref: r },
      );
    }
  }
}

export function createArtifact(
  input: CreateArtifactInput,
): { artifact: CdfCanonicalArtifact; version: CdfArtifactVersionRecord } {
  if (input.requestId) {
    const existing = storeGetIdempotency(input.requestId);
    if (existing) {
      const artifact = storeGetArtifact(existing.artifactId);
      const version = storeGetVersion(existing.artifactId, existing.version);
      if (artifact && version) {
        return { artifact, version };
      }
      throw artifactError(
        "ARTIFACT_IDEMPOTENCY_CONFLICT",
        "Idempotency key exists but artifact missing",
        { requestId: input.requestId },
      );
    }
  }

  const schemaVersion = input.schemaVersion ?? "1";
  validateArtifactData({
    artifactType: input.artifactType,
    schemaVersion,
    data: input.data,
    artifactKey: input.artifactKey,
  });
  assertRefs(input.sourceArtifacts);
  assertSourceVersionsExist(input.sourceArtifacts);

  const artifactId = createCdfArtifactId(input.artifactKey);
  assertCdfArtifactId(artifactId);
  if (input.provenance?.executionId === artifactId) {
    throw artifactError(
      "ARTIFACT_IDENTITY_COLLISION",
      "executionId must not equal artifactId",
    );
  }
  if (input.provenance?.vaultAssetIds?.some((id) => id === artifactId)) {
    throw artifactError(
      "ARTIFACT_IDENTITY_COLLISION",
      "vaultAssetId must not equal artifactId",
    );
  }

  const createdAt = nowIso();
  const versionRecord: CdfArtifactVersionRecord = {
    artifactId,
    version: 1,
    artifactType: input.artifactType,
    artifactKey: input.artifactKey,
    schemaVersion,
    status: "candidate",
    data: structuredClone(input.data),
    lineage: {
      sourceArtifacts: input.sourceArtifacts ?? [],
    },
    provenance: {
      ...(input.provenance ?? {}),
      candidateRequestId: input.requestId,
    },
    createdBy: input.userId,
    createdAt,
  };

  const artifact: CdfCanonicalArtifact = {
    artifactId,
    projectId: input.projectId,
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    serviceId: input.serviceId,
    phaseId: input.phaseId,
    artifactKey: input.artifactKey,
    artifactType: input.artifactType,
    schemaVersion,
    latestVersion: 1,
    status: "candidate",
    createdAt,
    updatedAt: createdAt,
  };

  const insertV = storeInsertVersion(versionRecord);
  if (insertV === "duplicate") {
    throw artifactError("ARTIFACT_VERSION_CONFLICT", "Version 1 already exists", {
      artifactId,
    });
  }
  storeInsertArtifact(artifact);

  if (input.requestId) {
    const idem = storePutIdempotency({
      requestId: input.requestId,
      artifactId,
      version: 1,
      createdAt,
    });
    if (idem === "conflict") {
      throw artifactError(
        "ARTIFACT_IDEMPOTENCY_CONFLICT",
        "Duplicate requestId mapped to different artifact",
        { requestId: input.requestId },
      );
    }
  }

  return {
    artifact: structuredClone(artifact),
    version: structuredClone(versionRecord),
  };
}

export function createVersion(
  input: CreateArtifactVersionInput,
): { artifact: CdfCanonicalArtifact; version: CdfArtifactVersionRecord } {
  if (input.requestId) {
    const existing = storeGetIdempotency(input.requestId);
    if (existing) {
      const artifact = storeGetArtifact(existing.artifactId);
      const version = storeGetVersion(existing.artifactId, existing.version);
      if (artifact && version) {
        assertOwnership(artifact, {
          organizationId: input.organizationId,
          projectId: input.projectId,
        });
        return { artifact, version };
      }
    }
  }

  assertCdfArtifactId(input.artifactId);
  const head = storeGetArtifact(input.artifactId);
  if (!head) {
    throw artifactError("ARTIFACT_NOT_FOUND", `Artifact not found: ${input.artifactId}`);
  }
  assertOwnership(head, {
    organizationId: input.organizationId,
    projectId: input.projectId,
  });

  if (head.latestVersion !== input.expectedLatestVersion) {
    throw artifactError(
      "ARTIFACT_VERSION_CONFLICT",
      `expectedLatestVersion ${input.expectedLatestVersion} but latest is ${head.latestVersion}`,
      {
        artifactId: input.artifactId,
        expectedLatestVersion: input.expectedLatestVersion,
        latestVersion: head.latestVersion,
      },
    );
  }

  const headVersion = storeGetVersion(input.artifactId, head.latestVersion);
  if (!headVersion) {
    throw artifactError(
      "ARTIFACT_VERSION_NOT_FOUND",
      `Head version ${head.latestVersion} missing`,
    );
  }

  const lineageParentVersion =
    input.lineageParentVersion ?? head.latestVersion;
  if (lineageParentVersion !== head.latestVersion) {
    const source = storeGetVersion(input.artifactId, lineageParentVersion);
    if (!source) {
      throw artifactError(
        "ARTIFACT_VERSION_NOT_FOUND",
        `lineageParentVersion ${lineageParentVersion} not found`,
        { artifactId: input.artifactId, lineageParentVersion },
      );
    }
  }

  const schemaVersion = input.schemaVersion ?? head.schemaVersion;
  validateArtifactData({
    artifactType: head.artifactType,
    schemaVersion,
    data: input.data,
    artifactKey: head.artifactKey,
  });
  assertRefs(input.sourceArtifacts);
  assertSourceVersionsExist(input.sourceArtifacts);

  // Supersede current HEAD (not necessarily the creative source).
  if (headVersion.status !== "superseded" && headVersion.status !== "archived") {
    assertArtifactTransition(headVersion.status, "superseded");
    storePatchVersionStatus(input.artifactId, headVersion.version, {
      status: "superseded",
    });
  }

  const allocated = storeAllocateNextVersion({
    artifactId: input.artifactId,
    expectedLatestVersion: input.expectedLatestVersion,
    buildVersion: (nextVersion, liveHead) => ({
      artifactId: input.artifactId,
      version: nextVersion,
      artifactType: liveHead.artifactType,
      artifactKey: liveHead.artifactKey,
      schemaVersion,
      status: "candidate",
      data: structuredClone(input.data),
      lineage: {
        parentArtifactId: input.artifactId,
        parentVersion: lineageParentVersion,
        sourceArtifacts:
          input.sourceArtifacts ?? headVersion.lineage.sourceArtifacts ?? [],
      },
      provenance: {
        ...(input.provenance ?? {}),
        candidateRequestId: input.requestId,
      },
      createdBy: input.userId,
      createdAt: nowIso(),
    }),
    patchHead: (liveHead, nextVersion, createdAt) => ({
      ...liveHead,
      schemaVersion,
      latestVersion: nextVersion,
      status: "candidate",
      updatedAt: createdAt,
    }),
  });

  if (!allocated.ok) {
    if (allocated.reason === "not_found") {
      throw artifactError(
        "ARTIFACT_NOT_FOUND",
        `Artifact not found: ${input.artifactId}`,
      );
    }
    throw artifactError(
      "ARTIFACT_VERSION_CONFLICT",
      allocated.reason === "duplicate"
        ? `Version already exists (concurrent allocate)`
        : "Concurrent version creation lost CAS race",
      {
        artifactId: input.artifactId,
        expectedLatestVersion: input.expectedLatestVersion,
      },
    );
  }

  if (input.requestId) {
    const idem = storePutIdempotency({
      requestId: input.requestId,
      artifactId: input.artifactId,
      version: allocated.version.version,
      createdAt: allocated.version.createdAt,
    });
    if (idem === "conflict") {
      throw artifactError(
        "ARTIFACT_IDEMPOTENCY_CONFLICT",
        "Duplicate requestId mapped to different version",
        { requestId: input.requestId },
      );
    }
  }

  return {
    artifact: allocated.artifact,
    version: allocated.version,
  };
}

/**
 * createVersion with CAS retry — refreshes expectedLatestVersion on conflict.
 * Used by M6 so concurrent refinements get unique version numbers (v5, v6, …)
 * rather than duplicate allocation. Does not change creative source selection.
 */
export function createVersionWithCasRetry(
  input: Omit<CreateArtifactVersionInput, "expectedLatestVersion"> & {
    expectedLatestVersion?: number;
    maxRetries?: number;
  },
): { artifact: CdfCanonicalArtifact; version: CdfArtifactVersionRecord } {
  const maxRetries = input.maxRetries ?? 8;
  let expected =
    input.expectedLatestVersion ??
    storeGetArtifact(input.artifactId)?.latestVersion;
  if (expected == null) {
    throw artifactError(
      "ARTIFACT_NOT_FOUND",
      `Artifact not found: ${input.artifactId}`,
    );
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return createVersion({
        ...input,
        expectedLatestVersion: expected,
      });
    } catch (err) {
      lastErr = err;
      if (
        err instanceof CdfArtifactError &&
        err.artifactCode === "ARTIFACT_VERSION_CONFLICT"
      ) {
        const live = storeGetArtifact(input.artifactId);
        if (!live) throw err;
        expected = live.latestVersion;
        continue;
      }
      throw err;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : artifactError(
        "ARTIFACT_VERSION_CONFLICT",
        `createVersion CAS retries exhausted after ${maxRetries}`,
      );
}

/** Creative data mutation is forbidden — always throw. */
export function rejectMutableUpdate(): never {
  throw artifactError(
    "ARTIFACT_VERSION_IMMUTABLE",
    "Artifact version creative data is immutable; create a new version instead",
  );
}

export function getArtifact(
  artifactId: string,
  ownership?: { organizationId?: string; projectId?: string },
): CdfCanonicalArtifact {
  assertCdfArtifactId(artifactId);
  const a = storeGetArtifact(artifactId);
  if (!a) {
    throw artifactError("ARTIFACT_NOT_FOUND", `Artifact not found: ${artifactId}`);
  }
  assertOwnership(a, ownership);
  return structuredClone(a);
}

export function getArtifactVersion(
  artifactId: string,
  version: number,
  ownership?: { organizationId?: string; projectId?: string },
): CdfArtifactVersionRecord {
  getArtifact(artifactId, ownership);
  const v = storeGetVersion(artifactId, version);
  if (!v) {
    throw artifactError(
      "ARTIFACT_VERSION_NOT_FOUND",
      `Version ${version} not found for ${artifactId}`,
    );
  }
  return structuredClone(v);
}

export function getLatestArtifactVersion(
  artifactId: string,
  ownership?: { organizationId?: string; projectId?: string },
): CdfArtifactVersionRecord {
  const head = getArtifact(artifactId, ownership);
  return getArtifactVersion(artifactId, head.latestVersion, ownership);
}

export function getApprovedArtifactVersion(
  artifactId: string,
  ownership?: { organizationId?: string; projectId?: string },
): CdfArtifactVersionRecord | null {
  const head = getArtifact(artifactId, ownership);
  if (head.approvedVersion == null) return null;
  return getArtifactVersion(artifactId, head.approvedVersion, ownership);
}

export function getSelectedArtifactVersion(
  artifactId: string,
  ownership?: { organizationId?: string; projectId?: string },
): CdfArtifactVersionRecord | null {
  const head = getArtifact(artifactId, ownership);
  if (head.selectedVersion == null) return null;
  return getArtifactVersion(artifactId, head.selectedVersion, ownership);
}

export function listArtifactVersions(
  artifactId: string,
  ownership?: { organizationId?: string; projectId?: string },
): CdfArtifactVersionRecord[] {
  getArtifact(artifactId, ownership);
  return storeListVersions(artifactId);
}

export function getArtifactLineage(
  artifactId: string,
  ownership?: { organizationId?: string; projectId?: string },
): {
  artifact: CdfCanonicalArtifact;
  versions: CdfArtifactVersionRecord[];
} {
  const artifact = getArtifact(artifactId, ownership);
  const versions = storeListVersions(artifactId);
  return { artifact, versions };
}

function setVersionStatus(
  artifactId: string,
  version: number,
  to: CdfCanonicalArtifactStatus,
  ownership?: { organizationId?: string; projectId?: string },
  extras?: Partial<Pick<CdfArtifactVersionRecord, "selectedAt" | "approvedAt">>,
): { artifact: CdfCanonicalArtifact; version: CdfArtifactVersionRecord } {
  const head = getArtifact(artifactId, ownership);
  const cur = storeGetVersion(artifactId, version);
  if (!cur) {
    throw artifactError(
      "ARTIFACT_VERSION_NOT_FOUND",
      `Version ${version} not found`,
    );
  }
  assertArtifactTransition(cur.status, to);
  const updatedV = storePatchVersionStatus(artifactId, version, {
    status: to,
    ...extras,
  });
  if (!updatedV) {
    throw artifactError("ARTIFACT_VERSION_NOT_FOUND", "Patch failed");
  }

  const updatedHead: CdfCanonicalArtifact = {
    ...head,
    status: version === head.latestVersion ? to : head.status,
    selectedVersion: to === "selected" ? version : head.selectedVersion,
    approvedVersion: to === "approved" ? version : head.approvedVersion,
    updatedAt: nowIso(),
  };
  const ok = storeReplaceArtifact(updatedHead, head.latestVersion);
  if (!ok) {
    const fresh = getArtifact(artifactId, ownership);
    const retry: CdfCanonicalArtifact = {
      ...fresh,
      status: version === fresh.latestVersion ? to : fresh.status,
      selectedVersion: to === "selected" ? version : fresh.selectedVersion,
      approvedVersion: to === "approved" ? version : fresh.approvedVersion,
      updatedAt: nowIso(),
    };
    const ok2 = storeReplaceArtifact(retry, fresh.latestVersion);
    if (!ok2) {
      throw artifactError(
        "ARTIFACT_VERSION_CONFLICT",
        "Failed to update artifact head after status change",
      );
    }
    return { artifact: retry, version: updatedV };
  }
  return { artifact: updatedHead, version: updatedV };
}

export function markSelected(
  artifactId: string,
  version: number,
  ownership?: { organizationId?: string; projectId?: string },
): { artifact: CdfCanonicalArtifact; version: CdfArtifactVersionRecord } {
  return setVersionStatus(artifactId, version, "selected", ownership, {
    selectedAt: nowIso(),
  });
}

export function markApproved(
  artifactId: string,
  version: number,
  ownership?: { organizationId?: string; projectId?: string },
): { artifact: CdfCanonicalArtifact; version: CdfArtifactVersionRecord } {
  return setVersionStatus(artifactId, version, "approved", ownership, {
    approvedAt: nowIso(),
  });
}

export function supersede(
  artifactId: string,
  version: number,
  ownership?: { organizationId?: string; projectId?: string },
): { artifact: CdfCanonicalArtifact; version: CdfArtifactVersionRecord } {
  return setVersionStatus(artifactId, version, "superseded", ownership);
}

export function archive(
  artifactId: string,
  version: number,
  ownership?: { organizationId?: string; projectId?: string },
): { artifact: CdfCanonicalArtifact; version: CdfArtifactVersionRecord } {
  return setVersionStatus(artifactId, version, "archived", ownership);
}

export function markValidated(
  artifactId: string,
  version: number,
  ownership?: { organizationId?: string; projectId?: string },
): { artifact: CdfCanonicalArtifact; version: CdfArtifactVersionRecord } {
  return setVersionStatus(artifactId, version, "validated", ownership);
}

export function markRejected(
  artifactId: string,
  version: number,
  ownership?: { organizationId?: string; projectId?: string },
): { artifact: CdfCanonicalArtifact; version: CdfArtifactVersionRecord } {
  return setVersionStatus(artifactId, version, "rejected", ownership);
}

export function getSupportedRepresentations(
  artifactType: CdfCanonicalArtifact["artifactType"],
  schemaVersion: string,
): readonly string[] {
  return getArtifactSchema(artifactType, schemaVersion)?.supportedRepresentations ?? [];
}

export function assertExecutionIsNotArtifactId(
  executionId: string,
  artifactId: string,
): void {
  if (executionId === artifactId) {
    throw artifactError(
      "ARTIFACT_IDENTITY_COLLISION",
      "executionId cannot be used as artifactId",
    );
  }
  if (isExecutionIdShape(artifactId)) {
    throw artifactError(
      "ARTIFACT_IDENTITY_COLLISION",
      "artifactId must not look like an execution id",
    );
  }
}

export function assertArtifactIdIsNotVaultAsset(artifactId: string): void {
  if (isVaultAssetObjectIdShape(artifactId)) {
    throw artifactError(
      "ARTIFACT_IDENTITY_COLLISION",
      "artifactId must not be a Vault ObjectId",
    );
  }
  assertCdfArtifactId(artifactId);
}
