/**
 * M7 — Presentation runtime strangler: ingest Direct completion → canonical artifacts.
 *
 * Acceptance: shared M4 gate inside ingestGenerationCompletion (pre-persist).
 * FAILED M4 → no cdfArtifactId attach.
 * design-system must already exist from select — never bootstrap fixtures.
 */

import { PRESENTATION_ARTIFACT_KEYS } from "../artifacts/presentation/keys";
import { bindGeneratedArtifactToSession } from "../artifacts/generated-bind";
import { getCdfSession } from "../session-store";
import { collectContractUpstreamRefs } from "../canonical-ingest/upstream-projection";
import {
  ingestGenerationCompletion,
  CdfGenerationArtifactError,
} from "../generation-artifact";
import { resolveArtifactTarget } from "../generation-artifact/target-resolution";
import type { IngestGenerationResult } from "../generation-artifact/types";
import { isM4AcceptanceStatus } from "../generation-validation";
import { qualityAttemptFromMetadata } from "../generation-validation/leniency";

export const CDF_PRESENTATION_RUNTIME_VERSION = "m7.presentation.runtime.v1";

export type PresentationCanonicalAttach = {
  cdfArtifactId: string;
  cdfArtifactVersion: number;
  cdfArtifactKey: string;
  cdfValidationStatus: string;
  cdfValidationId?: string;
  cdfRuntimePath: "canonical";
  cdfRuntimeVersion: string;
  canonicalPath: true;
};

export type PresentationIngestFailure = {
  kind: "validation_failed" | "dependency_missing" | "ingest_failed";
  cdfValidationStatus?: string;
  cdfValidationId?: string;
  cdfRuntimePath: "none";
  legacyCompatible: true;
  fallbackReason: string;
  message: string;
};

export type TryIngestPresentationResult =
  | { kind: "accepted"; ingest: IngestGenerationResult; attach: PresentationCanonicalAttach }
  | PresentationIngestFailure
  | null;

function metaString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const v = metadata?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function findSessionDesignSystemRef(sessionId: string): {
  artifactId: string;
  version: number;
} | undefined {
  const session = getCdfSession(sessionId);
  if (!session) return undefined;
  const fromSelected = session.selectedArtifacts?.find(
    (r) => r.artifactKey === PRESENTATION_ARTIFACT_KEYS.designSystem,
  );
  if (fromSelected) {
    return { artifactId: fromSelected.artifactId, version: fromSelected.version };
  }
  const fromApproved = session.approvedArtifacts?.find(
    (r) => r.artifactKey === PRESENTATION_ARTIFACT_KEYS.designSystem,
  );
  if (fromApproved) {
    return { artifactId: fromApproved.artifactId, version: fromApproved.version };
  }
  return undefined;
}

/**
 * Attempt M3C ingest with shared M4 pre-persist gate.
 * Returns accepted attach only when M4 status is passed | review_required.
 */
export function tryIngestPresentationCdfCompletion(input: {
  metadata?: Record<string, unknown>;
  rawOutput: unknown;
  executionId?: string;
  organizationId?: string;
  workspaceId?: string;
  projectId?: string;
  userId?: string;
}): TryIngestPresentationResult {
  const metadata = input.metadata ?? {};
  const sessionId = metaString(metadata, "cdfSessionId");
  const serviceId = metaString(metadata, "cdfServiceId") ?? "presentation";
  const phaseId = metaString(metadata, "cdfPhaseId");

  if (!sessionId || !phaseId) return null;
  if (serviceId !== "presentation" && serviceId !== "Presentations") return null;

  const session = getCdfSession(sessionId);
  if (!session) {
    console.info(
      JSON.stringify({
        scope: "cdf.presentation_runtime",
        event: "ingest_skip_no_session",
        sessionId,
        phaseId,
        canonicalPath: false,
        ts: new Date().toISOString(),
      }),
    );
    return null;
  }

  let target;
  try {
    target = resolveArtifactTarget({ serviceId: "presentation", phaseId });
  } catch {
    return null;
  }

  const designSystemRef = findSessionDesignSystemRef(sessionId);

  if (
    target.artifactKey === PRESENTATION_ARTIFACT_KEYS.deck &&
    !designSystemRef
  ) {
    console.info(
      JSON.stringify({
        scope: "cdf.presentation_runtime",
        event: "dependency_missing_design_system",
        sessionId,
        phaseId,
        canonicalPath: false,
        fallbackReason: "design_system_not_selected",
        ts: new Date().toISOString(),
      }),
    );
    return {
      kind: "dependency_missing",
      cdfRuntimePath: "none",
      legacyCompatible: true,
      fallbackReason: "design_system_not_selected",
      message:
        "Full deck blocked: exact presentation.design-system version required from select",
    };
  }

  try {
    const ingest = ingestGenerationCompletion({
      sessionId,
      serviceId: "presentation",
      phaseId,
      organizationId: input.organizationId ?? session.organizationId,
      workspaceId: input.workspaceId ?? session.workspaceId,
      projectId: input.projectId ?? session.projectId,
      userId: input.userId ?? session.userId,
      executionId: input.executionId,
      rawOutput: input.rawOutput,
      contextId: metaString(metadata, "cdfContextId"),
      qualityAttempt: qualityAttemptFromMetadata(metadata),
      contextHash: metaString(metadata, "cdfContextHash"),
      activeBriefId: session.activeBriefId,
      activeBriefVersion: session.activeBriefVersion,
      expectedSessionVersion: session.sessionVersion,
      designSystemRef,
      upstreamArtifactRefs: collectContractUpstreamRefs({ sessionId, serviceId, phaseId }),
      sourceArtifacts: designSystemRef
        ? [
            {
              artifactId: designSystemRef.artifactId,
              version: designSystemRef.version,
              artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
              relationship: "uses",
            },
          ]
        : undefined,
      requestId: input.executionId
        ? `m7_ingest_${input.executionId}_${phaseId}`
        : undefined,
      requireAcceptanceGate: true,
    });

    const status = ingest.validationStatus ?? "passed";
    if (!isM4AcceptanceStatus(status as "passed" | "review_required" | "failed")) {
      // Should not happen — ingest throws on reject — belt & suspenders.
      return {
        kind: "validation_failed",
        cdfValidationStatus: status,
        cdfValidationId: ingest.validationId,
        cdfRuntimePath: "none",
        legacyCompatible: true,
        fallbackReason: "m4_validation_failed",
        message: `M4 status ${status} — no canonical artifact reference`,
      };
    }

    const attach: PresentationCanonicalAttach = {
      cdfArtifactId: ingest.artifactId,
      cdfArtifactVersion: ingest.artifactVersion,
      cdfArtifactKey: ingest.artifactKey,
      cdfValidationStatus: status,
      cdfValidationId: ingest.validationId,
      cdfRuntimePath: "canonical",
      cdfRuntimeVersion: CDF_PRESENTATION_RUNTIME_VERSION,
      canonicalPath: true,
    };

    // Exact generatedArtifacts pin (generic CAS) — same for every service.
    // Fanout leaves must scope the pin — omitting targetId collapses N→1.
    const bound = bindGeneratedArtifactToSession({
      sessionId,
      phaseId,
      artifactId: ingest.artifactId,
      version: ingest.artifactVersion,
      artifactKey: ingest.artifactKey,
      organizationId: input.organizationId,
      projectId: input.projectId,
      generationFanoutGroupId: metaString(metadata, "generationFanoutGroupId"),
      generationFanoutTargetId: metaString(metadata, "generationFanoutTargetId"),
      generationExecutionId: input.executionId,
      generationFanoutLeaf:
        metadata.generationFanoutLeaf === true ||
        Boolean(metaString(metadata, "generationFanoutTargetId")) ||
        Boolean(metaString(metadata, "generationFanoutGroupId")) ||
        undefined,
    });
    if (!bound.ok) {
      return {
        kind: "ingest_failed",
        cdfRuntimePath: "none",
        legacyCompatible: true,
        fallbackReason: `generated_bind_${bound.code}`,
        message: `generatedArtifacts CAS bind failed: ${bound.message}`,
      };
    }

    console.info(
      JSON.stringify({
        scope: "cdf.presentation_runtime",
        event: "ingest_accepted",
        sessionId,
        phaseId,
        artifactId: ingest.artifactId,
        artifactVersion: ingest.artifactVersion,
        artifactKey: ingest.artifactKey,
        validationStatus: status,
        designSystemArtifactId: designSystemRef?.artifactId,
        designSystemVersion: designSystemRef?.version,
        generationExecutionId: input.executionId,
        contextHash: metaString(metadata, "cdfContextHash"),
        canonicalPath: true,
        legacyFallback: false,
        ts: new Date().toISOString(),
      }),
    );

    return { kind: "accepted", ingest, attach };
  } catch (err) {
    if (
      err instanceof CdfGenerationArtifactError &&
      err.generationArtifactCode === "ARTIFACT_VALIDATION_FAILED"
    ) {
      const meta = err.metadata ?? {};
      console.info(
        JSON.stringify({
          scope: "cdf.presentation_runtime",
          event: "validation_failed_no_artifact",
          sessionId,
          phaseId,
          canonicalPath: false,
          validationStatus: meta.validationStatus,
          validationId: meta.validationId,
          generationExecutionId: input.executionId,
          fallbackReason: "m4_validation_failed",
          ts: new Date().toISOString(),
        }),
      );
      return {
        kind: "validation_failed",
        cdfValidationStatus: String(meta.validationStatus ?? "failed"),
        cdfValidationId:
          typeof meta.validationId === "string" ? meta.validationId : undefined,
        cdfRuntimePath: "none",
        legacyCompatible: true,
        fallbackReason: "m4_validation_failed",
        message: err.message,
      };
    }
    if (
      err instanceof CdfGenerationArtifactError &&
      err.generationArtifactCode === "ARTIFACT_DEPENDENCY_MISSING"
    ) {
      return {
        kind: "dependency_missing",
        cdfRuntimePath: "none",
        legacyCompatible: true,
        fallbackReason: "design_system_not_selected",
        message: err.message,
      };
    }
    console.info(
      JSON.stringify({
        scope: "cdf.presentation_runtime",
        event: "ingest_failed_legacy_continues",
        sessionId,
        phaseId,
        canonicalPath: false,
        fallbackReason: "ingest_error",
        error: err instanceof Error ? err.message : String(err),
        ts: new Date().toISOString(),
      }),
    );
    return {
      kind: "ingest_failed",
      cdfRuntimePath: "none",
      legacyCompatible: true,
      fallbackReason: "ingest_error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Canonical CDF Presentation with accepted artifact → skip legacy materializer.
 * Legacy-only (no CDF session / no accepted attach) → keep materializer.
 *
 * FORCE_LEGACY_EXPORT kill-switch removed — cannot force art_* export when canonical.
 */
export function shouldSkipLegacyPresentationExport(input: {
  metadata?: Record<string, unknown>;
  canonicalAttached: boolean;
}): boolean {
  if (!input.canonicalAttached) return false;
  if (!metaString(input.metadata, "cdfSessionId")) return false;

  const serviceId =
    metaString(input.metadata, "cdfServiceId") ||
    metaString(input.metadata, "serviceId");
  const phaseId = metaString(input.metadata, "cdfPhaseId");
  if (!serviceId || !phaseId) return true; // CDF session with accepted artifact

  try {
    const { resolveCdfPhaseDefinition } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("../canonical") as typeof import("../canonical");
    const phase = resolveCdfPhaseDefinition(serviceId, phaseId);
    const family = phase?.presentationArtifactFamily;
    if (
      family === "presentation.deck" ||
      family === "presentation.refinement" ||
      phase?.uxType === "final"
    ) {
      return true;
    }
  } catch {
    /* registry unavailable — prefer M5B when attach already accepted */
  }
  return true;
}

/** Explicit typed reasons for legacy compatibility path. */
export type LegacyFallbackReason =
  | "not_cdf_presentation"
  | "design_system_not_selected"
  | "m4_validation_failed"
  | "ingest_error"
  | "canonical_render_failed";
