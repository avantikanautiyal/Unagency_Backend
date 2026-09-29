/**
 * M6 — Apply targeted refinement to an exact DeckSpec ArtifactVersion.
 */

import {
  bindGeneratedArtifactToSession,
  createVersionWithCasRetry,
  getArtifact,
  getArtifactVersion,
  markValidated,
} from "../artifacts";
import { CdfArtifactError } from "../artifacts/errors";
import { PRESENTATION_ARTIFACT_KEYS } from "../artifacts/presentation/keys";
import type { DeckSpec } from "../artifacts/presentation/types";
import { validateArtifactData } from "../artifacts/schema-registry";
import { validateCanonicalArtifact, isM4AcceptanceStatus } from "../generation-validation";
import { captureSourceAndResolveSync } from "../requirements";
import { getCdfSession } from "../session-store";
import { refinementError } from "./errors";
import {
  commitIdempotency,
  fingerprintPayload,
  lookupIdempotency,
} from "./idempotency";
import { interpretRefinementInstruction } from "./ai-interpreter";
import { assertIsolation } from "./isolation-check";
import { applyRefinementPatch } from "./patch-applier";
import { buildRefinementPatch } from "./patch-builder";
import { saveRefinementRequest } from "./store";
import { resolveRefinementTarget } from "./target-resolver";
import {
  CDF_REFINEMENT_ENGINE_VERSION,
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

function asDeck(data: Record<string, unknown>): DeckSpec {
  if (!data.slides || !data.designSystemRef) {
    throw refinementError("SCHEMA_INVALID", "Not a DeckSpec payload");
  }
  return data as unknown as DeckSpec;
}

/**
 * Apply a targeted refinement. Does not call AI full-deck generation.
 */
export function applyTargetedRefinement(
  input: ApplyRefinementInput,
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

  let head;
  let versionRecord;
  try {
    head = getArtifact(input.artifactId, ownership);
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

  // Stale context: caller-supplied context must match exact target version provenance
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
  if (input.contextId) {
    const versionCtx =
      versionRecord.provenance?.contextId ??
      (versionRecord.data as { sourceRefs?: { contextId?: string } })?.sourceRefs
        ?.contextId;
    if (versionCtx && versionCtx !== input.contextId) {
      throw refinementError(
        "STALE_CONTEXT",
        "contextId does not match exact artifact version provenance",
        {
          expectedContextId: versionCtx,
          contextId: input.contextId,
          artifactVersion: input.artifactVersion,
        },
      );
    }
  }

  const artifactKey =
    input.artifactKey ?? head.artifactKey ?? PRESENTATION_ARTIFACT_KEYS.deck;

  // M8D — Packaging keys use shared M6 orchestration with Packaging adapters
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const packagingRefine = require("./packaging-service") as typeof import("./packaging-service");
  if (packagingRefine.isPackagingRefinementKey(artifactKey)) {
    return packagingRefine.applyPackagingTargetedRefinement(
      input,
      artifactKey,
    );
  }

  // M9D — Social Media keys use shared M6 orchestration with Social Media adapters
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const socialMediaRefine = require("./social-media-service") as typeof import("./social-media-service");
  if (socialMediaRefine.isSocialMediaRefinementKey(artifactKey)) {
    return socialMediaRefine.applySocialMediaTargetedRefinement(
      input,
      artifactKey,
    );
  }

  if (artifactKey !== PRESENTATION_ARTIFACT_KEYS.deck) {
    throw refinementError(
      "UNSUPPORTED_OPERATION",
      `Targeted refinement supports ${PRESENTATION_ARTIFACT_KEYS.deck}, packaging.*, and social-media.* keys only (got ${artifactKey})`,
    );
  }

  const refinementId = createRefinementId();
  const createdAt = nowIso();

  // Preserve raw instruction via Requirement Engine
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
      },
    });
    sourceInputId = cap.source.sourceInputId;
    briefVersion = cap.brief.version;
  } catch {
    // best-effort capture
  }

  const deck = asDeck(versionRecord.data);
  const intent = interpretRefinementInstruction(input.rawInstruction);

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
      engineVersion: CDF_REFINEMENT_ENGINE_VERSION,
    };
    saveRefinementRequest(req);
    throw refinementError(
      "UNSUPPORTED_OPERATION",
      intent.unsupportedReason ?? "Unsupported refinement",
    );
  }

  const resolved = resolveRefinementTarget({
    deck,
    artifactId: input.artifactId,
    artifactVersion: input.artifactVersion,
    artifactKey,
    intent,
    preferredTargetPath: input.preferredTargetPath,
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
      engineVersion: CDF_REFINEMENT_ENGINE_VERSION,
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

  const patch = buildRefinementPatch({
    deck,
    intent,
    target: resolved.target,
  });

  for (const op of patch.operations) {
    if (op.op === "REPLACE_ASSET") {
      assertVaultAssetForRefinement({ vaultAssetId: String(op.value) });
    }
  }

  const { deck: nextDeck, changes } = applyRefinementPatch(deck, patch);
  assertIsolation(deck, nextDeck, patch);

  try {
    validateArtifactData({
      artifactType: "deck",
      schemaVersion: versionRecord.schemaVersion,
      data: nextDeck as never,
      artifactKey,
    });
  } catch (err) {
    throw refinementError(
      "SCHEMA_INVALID",
      err instanceof Error ? err.message : "M3B validation failed",
    );
  }

  // ── M4 pre-persist acceptance gate ──────────────────────────────────────
  // Failed / non-accepting M4 MUST NOT create a canonical ArtifactVersion.
  let validationStatus = "skipped";
  let validationId: string | undefined;
  if (input.runM4 !== false) {
    let val;
    try {
      val = validateCanonicalArtifact({
        artifactId: input.artifactId,
        artifactVersion: input.artifactVersion,
        candidateData: nextDeck as never,
        artifactKey,
        sessionId: input.sessionId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        contextId: input.contextId,
        contextHash: input.contextHash,
        // Do not pass the post-capture brief version when session has not CAS-bumped yet —
        // that would false-trip GENERATION_CONTEXT_STALE. Session brief is authoritative.
        expectedSessionVersion: input.expectedSessionVersion,
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
        engineVersion: CDF_REFINEMENT_ENGINE_VERSION,
      };
      saveRefinementRequest(reqFailed);
      const result: ApplyRefinementResult = {
        status: "validation_failed",
        refinementId,
        artifactId: input.artifactId,
        sourceVersion: input.artifactVersion,
        target: resolved.target,
        changes,
        validation: {
          status: "failed",
          validationId: undefined,
        },
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
          event: "refinement_rejected_m4_error",
          refinementId,
          artifactId: input.artifactId,
          sourceVersion: input.artifactVersion,
          error: err instanceof Error ? err.message : String(err),
          engineVersion: CDF_REFINEMENT_ENGINE_VERSION,
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
        engineVersion: CDF_REFINEMENT_ENGINE_VERSION,
      };
      saveRefinementRequest(reqFailed);

      console.info(
        JSON.stringify({
          scope: "cdf.refinement",
          event: "refinement_rejected_m4",
          refinementId,
          artifactId: input.artifactId,
          sourceVersion: input.artifactVersion,
          validationStatus,
          validationId,
          engineVersion: CDF_REFINEMENT_ENGINE_VERSION,
        }),
      );

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

  // ACCEPT → create immutable ArtifactVersion only after M3B + M4 gate.
  // Version number is allocated by M3A (HEAD+1 under CAS), independent of source.
  // Creative lineage: lineageParentVersion + sourceArtifacts.refines = exact source.
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
      data: nextDeck as never,
      lineageParentVersion: input.artifactVersion,
      requestId: input.requestId
        ? `refine_art_${input.requestId}`
        : undefined,
      provenance: {
        sourceInputIds: sourceInputId ? [sourceInputId] : undefined,
        activeBriefId: undefined,
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
      if (err.artifactCode === "ARTIFACT_VERSION_NOT_FOUND") {
        throw refinementError("ARTIFACT_VERSION_NOT_FOUND", err.message);
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
      // best-effort lifecycle stamp
    }
  }

  // Session generated ref → new exact version (mirrors Packaging/Social
  // Media refinement; without this the session keeps pointing at the
  // pre-refinement version after a deck targeted-refinement).
  const bound = bindGeneratedArtifactToSession({
    sessionId: input.sessionId,
    phaseId: input.phaseId,
    artifactId: input.artifactId,
    version: created.version.version,
    artifactKey,
    organizationId: input.organizationId,
    projectId: input.projectId,
  });
  if (!bound.ok) {
    throw refinementError(
      bound.code === "SESSION_VERSION_CONFLICT"
        ? "VERSION_CONFLICT"
        : "REFINEMENT_FAILED",
      `Deck refinement generatedArtifacts bind failed: ${bound.message}`,
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
    engineVersion: CDF_REFINEMENT_ENGINE_VERSION,
  };
  saveRefinementRequest(req);

  console.info(
    JSON.stringify({
      scope: "cdf.refinement",
      event: "refinement_applied",
      refinementId,
      artifactId: input.artifactId,
      sourceVersion: input.artifactVersion,
      newVersion: created.version.version,
      target: resolved.target.path,
      ops: patch.operations.map((o) => o.op),
      validationStatus,
      engineVersion: CDF_REFINEMENT_ENGINE_VERSION,
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
