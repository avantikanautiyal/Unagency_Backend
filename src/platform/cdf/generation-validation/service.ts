/**
 * M4 — Validate canonical artifacts against ActiveBrief requirements.
 * Does not mutate creative data. Does not render. Does not fix failures.
 */

import {
  getArtifact,
  getArtifactVersion,
  markRejected,
  markValidated,
} from "../artifacts";
import { getCdfSession } from "../session-store";
import {
  getLatestActiveBrief,
  listRequirements,
} from "../requirements";
import type { CdfRequirement } from "../requirements/types";
import { runDependencyChecks, runRequirementCheck } from "./checks";
import { applyRequirementCheckLeniency } from "./leniency";
import { observePresentationArtifact } from "./observe";
import {
  isPackagingValidationKey,
  observePackagingArtifact,
} from "./packaging-observe";
import {
  runPackagingDependencyChecks,
  runPackagingStructuralChecks,
} from "./packaging-checks";
import { aggregateValidationStatus, summarizeValidation } from "./policy";
import { saveValidationResult } from "./store";
import {
  CDF_VALIDATOR_VERSION,
  type CdfValidationResult,
  type ValidateArtifactInput,
} from "./types";
import { generationArtifactError } from "../generation-artifact/errors";

function nowIso(): string {
  return new Date().toISOString();
}

function createValidationId(): string {
  return `val_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function activeRequirements(
  input: ValidateArtifactInput,
  sessionId: string,
): CdfRequirement[] {
  if (input.requirements) {
    return input.requirements.filter((r) => r.status === "active");
  }
  const brief = getLatestActiveBrief(sessionId);
  if (brief) {
    const ids = new Set(brief.requirementIds);
    return listRequirements(sessionId).filter(
      (r) => ids.has(r.requirementId) && r.status === "active",
    );
  }
  return listRequirements(sessionId).filter((r) => r.status === "active");
}

function assertNotStale(input: ValidateArtifactInput, sessionId: string): void {
  const session = getCdfSession(sessionId);
  if (!session) {
    throw generationArtifactError(
      "GENERATION_CONTEXT_MISSING",
      `Session not found for validation: ${sessionId}`,
    );
  }
  if (
    input.expectedSessionVersion != null &&
    session.sessionVersion !== input.expectedSessionVersion
  ) {
    throw generationArtifactError(
      "GENERATION_CONTEXT_STALE",
      `Cannot validate as current: session v${input.expectedSessionVersion} vs live v${session.sessionVersion}`,
      {
        expectedSessionVersion: input.expectedSessionVersion,
        currentSessionVersion: session.sessionVersion,
      },
    );
  }
  if (
    input.activeBriefId &&
    session.activeBriefId &&
    input.activeBriefId !== session.activeBriefId
  ) {
    throw generationArtifactError(
      "GENERATION_CONTEXT_STALE",
      "ActiveBrief id mismatch — refusing to validate against wrong brief",
    );
  }
  if (
    input.activeBriefVersion != null &&
    session.activeBriefVersion != null &&
    input.activeBriefVersion !== session.activeBriefVersion
  ) {
    throw generationArtifactError(
      "GENERATION_CONTEXT_STALE",
      `ActiveBrief version mismatch: expected v${input.activeBriefVersion}, live v${session.activeBriefVersion}`,
    );
  }
}

/**
 * Validate a persisted canonical artifact version against active requirements.
 * When `candidateData` is provided, validates that in-memory payload instead
 * (pre-persist gate) — never creates or mutates ArtifactVersions.
 *
 * Headless first-create: pass candidateData + artifactKey + sessionId with
 * artifactId `__candidate_gate__` (or any non-cdfart sentinel). getArtifact
 * is skipped; ownership comes from sessionId alone.
 */
export function validateCanonicalArtifact(
  input: ValidateArtifactInput,
): CdfValidationResult {
  const ownership = {
    organizationId: input.organizationId,
    projectId: input.projectId,
  };
  const isCandidateGate = input.candidateData != null;
  const isHeadlessCandidate =
    isCandidateGate &&
    Boolean(input.artifactKey?.trim()) &&
    Boolean(input.sessionId?.trim()) &&
    (!input.artifactId?.startsWith("cdfart_") ||
      input.artifactId === "__candidate_gate__");

  const head = isHeadlessCandidate
    ? null
    : getArtifact(input.artifactId, ownership);

  const versionRecord = isCandidateGate
    ? null
    : input.artifactVersion != null
      ? getArtifactVersion(input.artifactId, input.artifactVersion, ownership)
      : (() => {
          throw generationArtifactError(
            "EXACT_ARTIFACT_VERSION_REQUIRED",
            "Canonical validation requires exact artifactVersion (X@V); latest/HEAD substitution is forbidden",
          );
        })();

  const data = isCandidateGate
    ? input.candidateData!
    : versionRecord!.data;
  const artifactKey =
    input.artifactKey ?? head?.artifactKey ?? "unknown";
  const artifactVersion = isCandidateGate
    ? input.artifactVersion ?? head?.latestVersion ?? 0
    : versionRecord!.version;

  const sessionId = input.sessionId ?? head?.sessionId;
  if (!sessionId) {
    throw generationArtifactError(
      "GENERATION_CONTEXT_MISSING",
      "sessionId required for validation",
    );
  }
  assertNotStale(input, sessionId);

  const requirements = activeRequirements(input, sessionId);
  const obs = isPackagingValidationKey(artifactKey)
    ? observePackagingArtifact(artifactKey, data)
    : observePresentationArtifact(artifactKey, data);

  const requirementChecks = requirements.map((req) =>
    runRequirementCheck(req, obs, {
      expectedDesignSystemRef: input.expectedDesignSystemRef,
      expectedDesignRouteRef: input.expectedDesignRouteRef,
    }),
  );
  const checks = [
    // Leniency only gates fresh generation candidates; persisted revalidation stays strict.
    ...(isCandidateGate
      ? applyRequirementCheckLeniency(requirementChecks, {
          artifactKey,
          qualityAttempt: input.qualityAttempt,
        })
      : requirementChecks),
    ...(isPackagingValidationKey(artifactKey)
      ? [
          ...runPackagingStructuralChecks(obs),
          ...runPackagingDependencyChecks(obs, input.expectedPackagingRefs),
        ]
      : runDependencyChecks(obs, {
          expectedDesignSystemRef: input.expectedDesignSystemRef,
          expectedDesignRouteRef: input.expectedDesignRouteRef,
        })),
  ];

  const status = aggregateValidationStatus(checks);
  const blockingIssues = checks.filter(
    (c) => c.severity === "blocking" && c.status === "fail",
  );
  const warnings = checks.filter(
    (c) => c.severity === "warning" || c.status === "warning",
  );
  const reviewRequired = checks.filter(
    (c) => c.status === "semantic_review_required",
  );

  const result: CdfValidationResult = {
    validationId: createValidationId(),
    status,
    artifactId: head?.artifactId ?? input.artifactId,
    artifactVersion,
    artifactKey,
    contextId:
      input.contextId ??
      (isCandidateGate ? undefined : versionRecord!.provenance.contextId),
    contextHash:
      input.contextHash ??
      (isCandidateGate ? undefined : versionRecord!.provenance.contextHash),
    activeBriefId:
      input.activeBriefId ??
      (isCandidateGate ? undefined : versionRecord!.provenance.activeBriefId),
    activeBriefVersion:
      input.activeBriefVersion ??
      (isCandidateGate
        ? undefined
        : versionRecord!.provenance.activeBriefVersion),
    sessionId,
    checks,
    summary: summarizeValidation(status, checks),
    blockingIssues,
    warnings,
    reviewRequired,
    validatedAt: nowIso(),
    validatorVersion: CDF_VALIDATOR_VERSION,
  };

  saveValidationResult(result);

  // Lifecycle transitions only apply to persisted versions — never for candidate gates.
  if (input.applyLifecycle && !isCandidateGate && versionRecord && head) {
    if (status === "passed" || status === "review_required") {
      markValidated(head.artifactId, versionRecord.version, ownership);
    } else if (status === "failed") {
      markRejected(head.artifactId, versionRecord.version, ownership);
    }
  }

  console.info(
    JSON.stringify({
      scope: "cdf.generation_validation",
      validationId: result.validationId,
      artifactId: result.artifactId,
      artifactVersion: result.artifactVersion,
      artifactKey: result.artifactKey,
      status: result.status,
      candidateGate: isCandidateGate,
      headlessCandidate: isHeadlessCandidate,
      failedRequirementIds: blockingIssues
        .map((c) => c.requirementId)
        .filter(Boolean),
      failedChecks: blockingIssues.map((c) => ({
        requirementId: c.requirementId,
        requirementKey: c.requirementKey,
        category: c.category,
        verificationType: c.verificationType,
        expected: c.expected,
        evidence: c.evidence,
      })),
      validatorVersion: CDF_VALIDATOR_VERSION,
      activeBriefVersion: result.activeBriefVersion,
      contextHash: result.contextHash,
      ts: result.validatedAt,
    }),
  );

  return result;
}

/**
 * Pre-persist M4 gate for refinement / generation candidates.
 * ACCEPT only when status is passed | review_required.
 */
export function isM4AcceptanceStatus(
  status: CdfValidationResult["status"],
): boolean {
  return status === "passed" || status === "review_required";
}

/**
 * Revalidate the same artifact version under a (possibly new) requirement set.
 * Appends a new ValidationResult — does not mutate prior records.
 */
export function revalidateCanonicalArtifact(
  input: ValidateArtifactInput,
): CdfValidationResult {
  return validateCanonicalArtifact({ ...input, applyLifecycle: input.applyLifecycle });
}
