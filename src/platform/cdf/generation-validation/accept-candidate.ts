/**
 * Shared M4 pre-persist acceptance gate (M6 + M3C/M7).
 *
 * GeneratedCandidate / patched data
 *   → validateCanonicalArtifact({ candidateData })
 *   → ACCEPT only passed | review_required
 *   → then persist ArtifactVersion
 *
 * FAILED / requires_clarification → NO canonical ArtifactVersion.
 */

import {
  isM4AcceptanceStatus,
  validateCanonicalArtifact,
} from "./service";
import type { CdfValidationResult, ValidateArtifactInput } from "./types";

export type CandidateAcceptanceOk = {
  accepted: true;
  validation: CdfValidationResult;
};

export type CandidateAcceptanceReject = {
  accepted: false;
  status: "validation_failed" | "requires_clarification";
  validation: CdfValidationResult;
};

export type CandidateAcceptanceResult =
  | CandidateAcceptanceOk
  | CandidateAcceptanceReject;

/**
 * Run M4 against in-memory candidate data. Never creates ArtifactVersions.
 *
 * For first-create (no existing artifact head), pass:
 *   artifactId omitted / empty, candidateData + artifactKey + sessionId
 *
 * For refine (existing head), pass exact artifactId + source artifactVersion.
 */
export function acceptCandidatePayload(
  input: Omit<ValidateArtifactInput, "applyLifecycle"> & {
    candidateData: Record<string, unknown>;
    artifactKey: string;
    sessionId: string;
  },
): CandidateAcceptanceResult {
  const validation = validateCanonicalArtifact({
    ...input,
    artifactId: input.artifactId?.trim() || "__candidate_gate__",
    candidateData: input.candidateData,
    artifactKey: input.artifactKey,
    sessionId: input.sessionId,
    applyLifecycle: false,
  });

  if (isM4AcceptanceStatus(validation.status)) {
    return { accepted: true, validation };
  }

  if (validation.status === "requires_clarification") {
    return {
      accepted: false,
      status: "requires_clarification",
      validation,
    };
  }

  return {
    accepted: false,
    status: "validation_failed",
    validation,
  };
}
