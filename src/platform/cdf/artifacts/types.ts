/**
 * CDF 2.0 M3A — Canonical Artifact Engine types.
 *
 * Artifact ≠ execution ≠ vault asset ≠ preview ≠ file ≠ chat.
 * Identity prefix `cdfart_` is intentionally not a 24-hex ObjectId and not `exec_`/`art_`.
 */

import type { CdfArtifactType } from "../canonical";

export type { CdfArtifactType };

/** M3A lifecycle — selection ≠ approval. */
export type CdfCanonicalArtifactStatus =
  | "candidate"
  | "validated"
  | "selected"
  | "approved"
  | "superseded"
  | "rejected"
  | "archived";

export type CdfArtifactReference = {
  artifactId: string;
  version: number;
  artifactKey: string;
  relationship: "uses" | "derived_from" | "refines" | "includes";
};

export type CdfArtifactProvenance = {
  sourceInputIds?: string[];
  activeBriefId?: string;
  activeBriefVersion?: number;
  contextId?: string;
  contextHash?: string;
  sessionVersion?: number;
  /** Provenance only — never artifact identity. */
  executionId?: string;
  /** Optional vault asset linkage — never confused with artifactId. */
  vaultAssetIds?: string[];
  candidateRequestId?: string;
};

export type CdfArtifactLineage = {
  parentArtifactId?: string;
  parentVersion?: number;
  sourceArtifacts: CdfArtifactReference[];
};

/**
 * Immutable creative payload for one version.
 * Once persisted, `data` must never mutate.
 */
export type CdfArtifactVersionRecord = {
  artifactId: string;
  version: number;
  artifactType: CdfArtifactType;
  artifactKey: string;
  schemaVersion: string;
  status: CdfCanonicalArtifactStatus;
  data: Record<string, unknown>;
  lineage: CdfArtifactLineage;
  provenance: CdfArtifactProvenance;
  createdBy?: string;
  createdAt: string;
  /** Set when status becomes approved/selected — informational. */
  selectedAt?: string;
  approvedAt?: string;
};

/** Logical artifact head — points at latest version number. */
export type CdfCanonicalArtifact = {
  artifactId: string;
  projectId?: string;
  organizationId?: string;
  workspaceId?: string;
  sessionId: string;
  serviceId: string;
  phaseId: string;
  artifactKey: string;
  artifactType: CdfArtifactType;
  schemaVersion: string;
  /** Latest version number (monotonic). */
  latestVersion: number;
  /** Exact approved version if any. */
  approvedVersion?: number;
  /** Exact selected version if any. */
  selectedVersion?: number;
  status: CdfCanonicalArtifactStatus;
  createdAt: string;
  updatedAt: string;
};

export type CdfArtifactSessionRef = {
  artifactId: string;
  version: number;
  phaseId: string;
  artifactKey: string;
  role: "generated" | "selected" | "approved";
  /** Intentional fanout leaf scope — see CdfSessionArtifactRef. */
  generationFanoutGroupId?: string;
  generationFanoutTargetId?: string;
  generationExecutionId?: string;
  /** routeIndex identity for select_route idempotency — see CdfSessionArtifactRef. */
  selectionRouteIndex?: number;
};

export type CreateArtifactInput = {
  sessionId: string;
  serviceId: string;
  phaseId: string;
  projectId?: string;
  organizationId?: string;
  workspaceId?: string;
  userId?: string;
  artifactKey: string;
  artifactType: CdfArtifactType;
  schemaVersion?: string;
  data: Record<string, unknown>;
  provenance?: CdfArtifactProvenance;
  sourceArtifacts?: CdfArtifactReference[];
  /** Idempotency key for duplicate create protection. */
  requestId?: string;
};

export type CreateArtifactVersionInput = {
  artifactId: string;
  /** Must match current latestVersion for CAS. */
  expectedLatestVersion: number;
  data: Record<string, unknown>;
  schemaVersion?: string;
  provenance?: CdfArtifactProvenance;
  sourceArtifacts?: CdfArtifactReference[];
  /**
   * Creative lineage parent version (e.g. refinement source).
   * Distinct from allocated version number (= expectedLatestVersion + 1).
   * Defaults to previous HEAD (expectedLatestVersion).
   */
  lineageParentVersion?: number;
  userId?: string;
  requestId?: string;
  organizationId?: string;
  projectId?: string;
};

export type ArtifactCandidateInput = {
  executionId?: string;
  contextId?: string;
  contextHash?: string;
  activeBriefId?: string;
  activeBriefVersion?: number;
  sessionVersion?: number;
  sessionId: string;
  serviceId: string;
  phaseId: string;
  projectId?: string;
  organizationId?: string;
  workspaceId?: string;
  userId?: string;
  artifactKey: string;
  artifactType: CdfArtifactType;
  schemaVersion?: string;
  data: Record<string, unknown>;
  sourceInputIds?: string[];
  sourceArtifacts?: CdfArtifactReference[];
  parentArtifactId?: string;
  parentVersion?: number;
  requestId?: string;
};

export type CdfArtifactErrorCode =
  | "ARTIFACT_NOT_FOUND"
  | "ARTIFACT_VERSION_NOT_FOUND"
  | "ARTIFACT_SCHEMA_NOT_FOUND"
  | "ARTIFACT_SCHEMA_INVALID"
  | "ARTIFACT_VERSION_IMMUTABLE"
  | "ARTIFACT_VERSION_CONFLICT"
  | "ARTIFACT_ALREADY_APPROVED"
  | "ARTIFACT_INVALID_TRANSITION"
  | "ARTIFACT_REFERENCE_INVALID"
  | "ARTIFACT_OWNERSHIP_INVALID"
  | "ARTIFACT_IDEMPOTENCY_CONFLICT"
  | "ARTIFACT_IDENTITY_COLLISION";
