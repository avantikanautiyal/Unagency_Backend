/**
 * M8D — Packaging path for applyTargetedRefinement (shared M6 orchestration).
 */

import {
  createVersionWithCasRetry,
  getArtifact,
  getArtifactVersion,
  markValidated,
} from "../artifacts";
import { CdfArtifactError } from "../artifacts/errors";
import {
  isPackagingArtifactKey,
  PACKAGING_ARTIFACT_TYPE_BY_KEY,
  PACKAGING_SCHEMA_VERSION,
  type PackagingArtifactKey,
} from "../artifacts/packaging/keys";
import { validateArtifactData } from "../artifacts/schema-registry";
import {
  isM4AcceptanceStatus,
  validateCanonicalArtifact,
} from "../generation-validation";
import { bindGeneratedPackagingArtifactToSession } from "../packaging-runtime/session-bind";
import { captureSourceAndResolveSync } from "../requirements";
import { getCdfSession } from "../session-store";
import { refinementError } from "./errors";
import {
  commitIdempotency,
  fingerprintPayload,
  lookupIdempotency,
} from "./idempotency";
import { assertPackagingIsolation } from "./packaging-isolation";
import { parsePackagingRefinementInstruction } from "./packaging-instruction-parser";
import { applyPackagingRefinementPatch } from "./packaging-patch-applier";
import { buildPackagingRefinementPatch } from "./packaging-patch-builder";
import { resolvePackagingRefinementTarget } from "./packaging-target-resolver";
import { saveRefinementRequest } from "./store";
import {
  CDF_PACKAGING_REFINEMENT_ENGINE_VERSION,
  type ApplyRefinementInput,
  type ApplyRefinementResult,
  type CdfRefinementRequest,
} from "./types";
import { assertVaultAssetForRefinement } from "./vault";

function nowIso(): string {
  return new Date().toISOString();
}

function createRefinementId(): string {
  return `refn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function extractExpectedPackagingRefs(data: Record<string, unknown>) {
  const pick = (key: string) => {
    const ref = data[key] as
      | { artifactId?: string; version?: number }
      | undefined;
    if (
      ref &&
      typeof ref.artifactId === "string" &&
      Number.isInteger(ref.version)
    ) {
      return { artifactId: ref.artifactId, version: ref.version as number };
    }
    return undefined;
  };
  return {
    dielineRef: pick("dielineRef"),
    routesRef: pick("routesRef"),
    threeDDirectionRef: pick("threeDDirectionRef"),
    frontPackRef: pick("frontPackRef"),
    completePackRef: pick("completePackRef"),
    viewsRef: pick("viewsRef"),
  };
}

/**
 * Packaging targeted refinement — exact version → patch → M4 → createVersion.
 * Never mutates source. Never resolves latest. Never full regenerates.
 */
export function applyPackagingTargetedRefinement(
  input: ApplyRefinementInput,
  artifactKey: PackagingArtifactKey,
): ApplyRefinementResult {
  const ownership = {
    organizationId: input.organizationId,
    projectId: input.projectId,
  };

  if (input.requestId) {
    const existing = lookupIdempotency(input.sessionId, input.requestId);
    if (existing) {
      const fp = fingerprintPayload([
        input.rawInstruction,
        input.artifactId,
        input.artifactVersion,
        input.preferredTargetPath ?? "",
      ]);
      if (existing.fingerprint !== fp) {
        throw refinementError(
          "IDEMPOTENCY_CONFLICT",
          "requestId reused with different refinement payload",
        );
      }
      return {
        ...(existing.resultPayload as ApplyRefinementResult),
        idempotentReplay: true,
      };
    }
  }

  if (input.expectedSessionVersion != null) {
    const session = getCdfSession(input.sessionId);
    if (!session) {
      throw refinementError("STALE_CONTEXT", "Session not found");
    }
    if (session.sessionVersion !== input.expectedSessionVersion) {
      throw refinementError(
        "STALE_CONTEXT",
        `Session version mismatch: expected ${input.expectedSessionVersion}, live ${session.sessionVersion}`,
        {
          expectedSessionVersion: input.expectedSessionVersion,
          currentSessionVersion: session.sessionVersion,
        },
      );
    }
  }

  let versionRecord;
  try {
    getArtifact(input.artifactId, ownership);
    versionRecord = getArtifactVersion(
      input.artifactId,
      input.artifactVersion,
      ownership,
    );
  } catch (err) {
    if (err instanceof CdfArtifactError) {
      if (err.artifactCode === "ARTIFACT_NOT_FOUND") {
        throw refinementError("ARTIFACT_NOT_FOUND", err.message);
      }
      if (err.artifactCode === "ARTIFACT_VERSION_NOT_FOUND") {
        throw refinementError("ARTIFACT_VERSION_NOT_FOUND", err.message);
      }
      if (err.artifactCode === "ARTIFACT_OWNERSHIP_INVALID") {
        throw refinementError("OWNERSHIP_INVALID", err.message);
      }
    }
    throw err;
  }

  if (input.contextHash) {
    const versionHash =
      versionRecord.provenance?.contextHash ??
      (versionRecord.data as { sourceRefs?: { contextHash?: string } })
        ?.sourceRefs?.contextHash;
    if (versionHash && versionHash !== input.contextHash) {
      throw refinementError(
        "STALE_CONTEXT",
        "contextHash does not match exact artifact version provenance",
        {
          expectedContextHash: versionHash,
          contextHash: input.contextHash,
          artifactVersion: input.artifactVersion,
        },
      );
    }
  }

  const refinementId = createRefinementId();
  const createdAt = nowIso();
  const engineVersion = CDF_PACKAGING_REFINEMENT_ENGINE_VERSION;

  let sourceInputId: string | undefined;
  let briefVersion: number | undefined = input.briefVersion;
  try {
    const cap = captureSourceAndResolveSync({
      sessionId: input.sessionId,
      serviceId: input.serviceId,
      projectId: input.projectId,
      userId: input.userId,
      type: "refinement",
      rawContent: input.rawInstruction,
      source: "cdf_targeted_refine",
      metadata: {
        phaseId: input.phaseId,
        artifactId: input.artifactId,
        artifactVersion: input.artifactVersion,
        semantic: "targeted_refinement",
        refinementId,
        packaging: true,
      },
    });
    sourceInputId = cap.source.sourceInputId;
    briefVersion = cap.brief.version;
  } catch {
    // best-effort
  }

  const sourceData = versionRecord.data as Record<string, unknown>;
  const intent = parsePackagingRefinementInstruction(
    input.rawInstruction,
    input.preferredTargetPath,
  );

  if (intent.unsupported) {
    const req: CdfRefinementRequest = {
      refinementId,
      projectId: input.projectId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      serviceId: input.serviceId,
      phaseId: input.phaseId,
      sourceInputId,
      rawInstruction: input.rawInstruction,
      artifactId: input.artifactId,
      artifactVersion: input.artifactVersion,
      artifactKey,
      contextId: input.contextId,
      contextHash: input.contextHash,
      briefVersion,
      sessionVersion: input.expectedSessionVersion,
      status: "requires_clarification",
      clarificationReason: intent.unsupportedReason ?? "UNSUPPORTED_OPERATION",
      createdAt,
      updatedAt: createdAt,
      requestId: input.requestId,
      engineVersion,
    };
    saveRefinementRequest(req);
    throw refinementError(
      "UNSUPPORTED_OPERATION",
      intent.unsupportedReason ?? "Unsupported Packaging refinement",
    );
  }

  const resolved = resolvePackagingRefinementTarget({
    data: sourceData,
    artifactId: input.artifactId,
    artifactVersion: input.artifactVersion,
    artifactKey,
    intent,
  });

  if (resolved.status === "requires_clarification") {
    const req: CdfRefinementRequest = {
      refinementId,
      projectId: input.projectId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      serviceId: input.serviceId,
      phaseId: input.phaseId,
      sourceInputId,
      rawInstruction: input.rawInstruction,
      artifactId: input.artifactId,
      artifactVersion: input.artifactVersion,
      artifactKey,
      contextId: input.contextId,
      contextHash: input.contextHash,
      briefVersion,
      status: "requires_clarification",
      clarificationReason: resolved.reason,
      clarificationCandidates: resolved.candidates,
      createdAt,
      updatedAt: nowIso(),
      requestId: input.requestId,
      engineVersion,
    };
    saveRefinementRequest(req);
    const result: ApplyRefinementResult = {
      status: "requires_clarification",
      refinementId,
      artifactId: input.artifactId,
      sourceVersion: input.artifactVersion,
      clarificationReason: resolved.reason,
      clarificationCandidates: resolved.candidates,
      request: req,
    };
    if (input.requestId) {
      commitIdempotency({
        requestId: input.requestId,
        sessionId: input.sessionId,
        action: "targeted_refine",
        fingerprint: fingerprintPayload([
          input.rawInstruction,
          input.artifactId,
          input.artifactVersion,
          input.preferredTargetPath ?? "",
        ]),
        resultPayload: result,
        refinementId,
        artifactId: input.artifactId,
        artifactVersion: input.artifactVersion,
        createdAt: nowIso(),
      });
    }
    return result;
  }

  const patch = buildPackagingRefinementPatch({
    data: sourceData,
    intent,
    target: resolved.target,
  });

  for (const op of patch.operations) {
    if (op.op === "REPLACE_ASSET") {
      assertVaultAssetForRefinement({ vaultAssetId: String(op.value) });
    }
  }

  const { data: nextData, changes } = applyPackagingRefinementPatch(
    sourceData,
    patch,
  );
  assertPackagingIsolation(sourceData, nextData, patch);

  const artifactType = PACKAGING_ARTIFACT_TYPE_BY_KEY[artifactKey];
  try {
    validateArtifactData({
      artifactType: artifactType as never,
      schemaVersion: versionRecord.schemaVersion || PACKAGING_SCHEMA_VERSION,
      data: nextData as never,
      artifactKey,
    });
  } catch (err) {
    throw refinementError(
      "SCHEMA_INVALID",
      err instanceof Error ? err.message : "Packaging schema validation failed",
    );
  }

  let validationStatus = "skipped";
  let validationId: string | undefined;
  if (input.runM4 !== false) {
    let val;
    try {
      val = validateCanonicalArtifact({
        artifactId: input.artifactId,
        artifactVersion: input.artifactVersion,
        candidateData: nextData as never,
        artifactKey,
        sessionId: input.sessionId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        contextId: input.contextId,
        contextHash: input.contextHash,
        expectedSessionVersion: input.expectedSessionVersion,
        expectedPackagingRefs: extractExpectedPackagingRefs(nextData),
        ...(input.m4Requirements ? { requirements: input.m4Requirements } : {}),
        applyLifecycle: false,
      });
    } catch (err) {
      const reqFailed: CdfRefinementRequest = {
        refinementId,
        projectId: input.projectId,
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        serviceId: input.serviceId,
        phaseId: input.phaseId,
        sourceInputId,
        rawInstruction: input.rawInstruction,
        artifactId: input.artifactId,
        artifactVersion: input.artifactVersion,
        artifactKey,
        contextId: input.contextId,
        contextHash: input.contextHash,
        briefVersion,
        sessionVersion: input.expectedSessionVersion,
        resolvedTarget: resolved.target,
        scope: patch.scope,
        patch,
        status: "validation_failed",
        validationStatus: "failed",
        createdAt,
        updatedAt: nowIso(),
        requestId: input.requestId,
        engineVersion,
      };
      saveRefinementRequest(reqFailed);
      const result: ApplyRefinementResult = {
        status: "validation_failed",
        refinementId,
        artifactId: input.artifactId,
        sourceVersion: input.artifactVersion,
        target: resolved.target,
        changes,
        validation: { status: "failed" },
        request: reqFailed,
      };
      if (input.requestId) {
        commitIdempotency({
          requestId: input.requestId,
          sessionId: input.sessionId,
          action: "targeted_refine",
          fingerprint: fingerprintPayload([
            input.rawInstruction,
            input.artifactId,
            input.artifactVersion,
            input.preferredTargetPath ?? "",
          ]),
          resultPayload: result,
          refinementId,
          artifactId: input.artifactId,
          artifactVersion: input.artifactVersion,
          createdAt: nowIso(),
        });
      }
      console.info(
        JSON.stringify({
          scope: "cdf.refinement",
          event: "packaging_refinement_rejected_m4_error",
          refinementId,
          artifactId: input.artifactId,
          sourceVersion: input.artifactVersion,
          error: err instanceof Error ? err.message : String(err),
          engineVersion,
        }),
      );
      return result;
    }

    validationStatus = val.status;
    validationId = val.validationId;

    if (!isM4AcceptanceStatus(val.status)) {
      const reqFailed: CdfRefinementRequest = {
        refinementId,
        projectId: input.projectId,
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        serviceId: input.serviceId,
        phaseId: input.phaseId,
        sourceInputId,
        rawInstruction: input.rawInstruction,
        artifactId: input.artifactId,
        artifactVersion: input.artifactVersion,
        artifactKey,
        contextId: input.contextId,
        contextHash: input.contextHash,
        briefVersion,
        sessionVersion: input.expectedSessionVersion,
        resolvedTarget: resolved.target,
        scope: patch.scope,
        patch,
        status: "validation_failed",
        changes,
        validationStatus,
        validationId,
        createdAt,
        updatedAt: nowIso(),
        requestId: input.requestId,
        engineVersion,
      };
      saveRefinementRequest(reqFailed);
      const result: ApplyRefinementResult = {
        status: "validation_failed",
        refinementId,
        artifactId: input.artifactId,
        sourceVersion: input.artifactVersion,
        target: resolved.target,
        changes,
        validation: { status: validationStatus, validationId },
        request: reqFailed,
      };
      if (input.requestId) {
        commitIdempotency({
          requestId: input.requestId,
          sessionId: input.sessionId,
          action: "targeted_refine",
          fingerprint: fingerprintPayload([
            input.rawInstruction,
            input.artifactId,
            input.artifactVersion,
            input.preferredTargetPath ?? "",
          ]),
          resultPayload: result,
          refinementId,
          artifactId: input.artifactId,
          artifactVersion: input.artifactVersion,
          createdAt: nowIso(),
        });
      }
      return result;
    }
  }

  const expectedLatest =
    input.expectedLatestVersion ??
    getArtifact(input.artifactId, ownership).latestVersion;
  let created;
  try {
    created = createVersionWithCasRetry({
      artifactId: input.artifactId,
      expectedLatestVersion: expectedLatest,
      organizationId: input.organizationId,
      projectId: input.projectId,
      userId: input.userId,
      data: nextData as never,
      lineageParentVersion: input.artifactVersion,
      requestId: input.requestId
        ? `refine_art_${input.requestId}`
        : undefined,
      provenance: {
        sourceInputIds: sourceInputId ? [sourceInputId] : undefined,
        activeBriefVersion: briefVersion,
        contextId: input.contextId,
        contextHash: input.contextHash,
        sessionVersion: input.expectedSessionVersion,
        candidateRequestId: refinementId,
      },
      sourceArtifacts: [
        {
          artifactId: input.artifactId,
          version: input.artifactVersion,
          artifactKey,
          relationship: "refines",
        },
      ],
      maxRetries: 8,
    });
  } catch (err) {
    if (err instanceof CdfArtifactError) {
      if (err.artifactCode === "ARTIFACT_VERSION_CONFLICT") {
        throw refinementError("VERSION_CONFLICT", err.message);
      }
      if (err.artifactCode === "ARTIFACT_IDEMPOTENCY_CONFLICT") {
        throw refinementError("IDEMPOTENCY_CONFLICT", err.message);
      }
    }
    throw err;
  }

  if (
    input.applyLifecycle &&
    (validationStatus === "passed" || validationStatus === "review_required")
  ) {
    try {
      markValidated(input.artifactId, created.version.version, ownership);
    } catch {
      // best-effort
    }
  }

  // Session generated ref → new exact version (CAS)
  const bound = bindGeneratedPackagingArtifactToSession({
    sessionId: input.sessionId,
    phaseId: input.phaseId,
    artifactId: input.artifactId,
    version: created.version.version,
    artifactKey,
    organizationId: input.organizationId,
    projectId: input.projectId,
  });
  if (!bound.ok) {
    throw new Error(
      `Packaging refinement generatedArtifacts bind failed: ${bound.message}`,
    );
  }

  const req: CdfRefinementRequest = {
    refinementId,
    projectId: input.projectId,
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    serviceId: input.serviceId,
    phaseId: input.phaseId,
    sourceInputId,
    rawInstruction: input.rawInstruction,
    artifactId: input.artifactId,
    artifactVersion: input.artifactVersion,
    artifactKey,
    contextId: input.contextId,
    contextHash: input.contextHash,
    briefVersion,
    sessionVersion: input.expectedSessionVersion,
    resolvedTarget: resolved.target,
    scope: patch.scope,
    patch,
    status: "applied",
    changes,
    newArtifactVersion: created.version.version,
    validationStatus,
    validationId,
    createdAt,
    updatedAt: nowIso(),
    requestId: input.requestId,
    engineVersion,
  };
  saveRefinementRequest(req);

  console.info(
    JSON.stringify({
      scope: "cdf.refinement",
      event: "packaging_refinement_applied",
      refinementId,
      artifactId: input.artifactId,
      sourceVersion: input.artifactVersion,
      newVersion: created.version.version,
      target: resolved.target.path,
      ops: patch.operations.map((o) => o.op),
      validationStatus,
      engineVersion,
    }),
  );

  const result: ApplyRefinementResult = {
    status: "applied",
    refinementId,
    artifactId: input.artifactId,
    sourceVersion: input.artifactVersion,
    newVersion: created.version.version,
    target: resolved.target,
    changes,
    validation: { status: validationStatus, validationId },
    request: req,
  };

  if (input.requestId) {
    commitIdempotency({
      requestId: input.requestId,
      sessionId: input.sessionId,
      action: "targeted_refine",
      fingerprint: fingerprintPayload([
        input.rawInstruction,
        input.artifactId,
        input.artifactVersion,
        input.preferredTargetPath ?? "",
      ]),
      resultPayload: result,
      refinementId,
      artifactId: input.artifactId,
      artifactVersion: created.version.version,
      createdAt: nowIso(),
    });
  }

  return result;
}

export function isPackagingRefinementKey(key: string): key is PackagingArtifactKey {
  return isPackagingArtifactKey(key);
}
