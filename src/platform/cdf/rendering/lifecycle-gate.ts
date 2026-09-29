/**
 * Lifecycle gate — preview vs final deliverable (M5).
 *
 * Preview: validated / selected / approved, or the exact selected/approved version
 *          even if a later candidate superseded the status field.
 * Final: approved only (exact version must be the approved creative version).
 */

import type {
  CdfCanonicalArtifact,
  CdfCanonicalArtifactStatus,
} from "../artifacts/types";
import { renderError } from "./errors";
import type { CdfRenderPurpose } from "./types";

const PREVIEW_ALLOWED: ReadonlySet<CdfCanonicalArtifactStatus> = new Set([
  "validated",
  "selected",
  "approved",
]);

const FINAL_ALLOWED: ReadonlySet<CdfCanonicalArtifactStatus> = new Set([
  "approved",
]);

export function allowedStatusesForPurpose(
  purpose: CdfRenderPurpose,
): readonly CdfCanonicalArtifactStatus[] {
  return purpose === "final"
    ? (["approved"] as const)
    : (["validated", "selected", "approved"] as const);
}

/**
 * A version remains renderable as final if:
 * - status is approved, OR
 * - it is still head.approvedVersion, OR
 * - it was previously approved (approvedAt set) then superseded by a newer draft/candidate.
 */
export function isVersionRenderable(input: {
  purpose: CdfRenderPurpose;
  status: CdfCanonicalArtifactStatus;
  version: number;
  head: Pick<CdfCanonicalArtifact, "approvedVersion" | "selectedVersion">;
  /** When set, allows re-rendering historically approved versions after supersession. */
  approvedAt?: string;
  selectedAt?: string;
}): boolean {
  if (input.purpose === "final") {
    if (FINAL_ALLOWED.has(input.status)) return true;
    if (input.head.approvedVersion === input.version) return true;
    if (input.status === "superseded" && input.approvedAt) return true;
    return false;
  }
  if (PREVIEW_ALLOWED.has(input.status)) return true;
  if (input.head.approvedVersion === input.version) return true;
  if (input.head.selectedVersion === input.version) return true;
  if (input.status === "superseded" && (input.approvedAt || input.selectedAt)) {
    return true;
  }
  return false;
}

export function assertLifecycleAllowsRender(input: {
  purpose: CdfRenderPurpose;
  status: CdfCanonicalArtifactStatus;
  artifactId: string;
  artifactVersion: number;
  head: Pick<CdfCanonicalArtifact, "approvedVersion" | "selectedVersion">;
  approvedAt?: string;
  selectedAt?: string;
}): void {
  if (
    isVersionRenderable({
      purpose: input.purpose,
      status: input.status,
      version: input.artifactVersion,
      head: input.head,
      approvedAt: input.approvedAt,
      selectedAt: input.selectedAt,
    })
  ) {
    return;
  }
  const allowed = allowedStatusesForPurpose(input.purpose);
  throw renderError(
    "ARTIFACT_LIFECYCLE_NOT_ALLOWED",
    `Cannot render ${input.purpose} for artifact ${input.artifactId}@v${input.artifactVersion} in status "${input.status}". Allowed statuses: ${allowed.join(", ")} (or exact approved/selected head pin / historically approved).`,
    {
      purpose: input.purpose,
      status: input.status,
      artifactId: input.artifactId,
      artifactVersion: input.artifactVersion,
      approvedVersion: input.head.approvedVersion,
      selectedVersion: input.head.selectedVersion,
      allowed: [...allowed],
    },
  );
}

/**
 * Policy documentation constant — keep in sync with isVersionRenderable.
 */
export const CDF_RENDER_LIFECYCLE_POLICY = {
  preview: {
    allowedStatuses: ["validated", "selected", "approved"] as const,
    alsoAllows: "exact head.selectedVersion / head.approvedVersion after supersession",
    note: "Preview is for review/representation only — not a final deliverable.",
  },
  final: {
    allowedStatuses: ["approved"] as const,
    alsoAllows: "exact head.approvedVersion after a newer candidate supersedes status",
    note: "Final PPTX/PDF/downloadable representations require an approved exact version.",
  },
} as const;
