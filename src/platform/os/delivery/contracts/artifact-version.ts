/**
 * Phase 7 — Versioned OS artifacts (immutable historical versions).
 */

export const OS_ARTIFACT_RUNTIME_VERSION = "phase7.1" as const;

export type ArtifactApprovalState =
  | "UNAPPROVED"
  | "APPROVED"
  | "REVOKED"
  | "SUPERSEDED";

export interface OsArtifactVersion {
  readonly artifactId: string;
  readonly version: number;
  readonly organizationId: string;
  readonly executionId: string;
  readonly planId?: string;
  readonly planVersion?: number;
  readonly refinementId?: string;
  readonly refinementVersion?: number;
  readonly sourceArtifactId?: string;
  readonly sourceVersion?: number;
  readonly outputContractId?: string;
  readonly preview?: string;
  readonly checksum: string;
  readonly approvalState: ArtifactApprovalState;
  readonly approvalReference?: string;
  readonly createdAt: string;
  readonly approvedAt?: string;
  readonly revokedAt?: string;
}

export interface OsArtifactManifestEntry {
  readonly artifactId: string;
  readonly version: number;
  readonly role?: string;
}

export interface OsArtifactManifest {
  readonly manifestId: string;
  readonly organizationId: string;
  readonly executionId: string;
  readonly planVersion?: number;
  readonly refinementVersion?: number;
  readonly version: number;
  readonly entries: readonly OsArtifactManifestEntry[];
  readonly createdAt: string;
}

export function checksumPreview(preview: string): string {
  // Deterministic non-crypto fingerprint for tests/audit (not a security hash).
  let h = 0;
  for (let i = 0; i < preview.length; i++) {
    h = (h * 31 + preview.charCodeAt(i)) >>> 0;
  }
  return `fp_${h.toString(16)}_${preview.length}`;
}
