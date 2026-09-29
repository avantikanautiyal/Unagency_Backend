/**
 * M8B — Packaging generation → canonical artifact boundary.
 *
 * When forceOptIn / cdfExecutionStrategy=canonical, ingest is mandatory.
 * Env CDF_PACKAGING_INGEST=1|true enables ingest for non-contract traffic.
 * FORCE_LEGACY kill-switches were removed.
 */

import {
  PACKAGING_ARTIFACT_KEYS,
  PACKAGING_PHASE_ARTIFACT_KEY,
  type PackagingArtifactKey,
} from "../artifacts/packaging/keys";
import { getCdfSession } from "../session-store";
import { collectContractUpstreamRefs } from "../canonical-ingest/upstream-projection";
import {
  ingestGenerationCompletion,
  CdfGenerationArtifactError,
} from "../generation-artifact";
import { resolveArtifactTarget } from "../generation-artifact/target-resolution";
import type { IngestGenerationInput, IngestGenerationResult } from "../generation-artifact/types";
import { isM4AcceptanceStatus } from "../generation-validation";
import {
  bindGeneratedPackagingArtifactToSession,
  findPackagingExactRef,
} from "./session-bind";

export const CDF_PACKAGING_RUNTIME_VERSION = "m8b.packaging.generation.v1";

export type PackagingCanonicalAttach = {
  cdfArtifactId: string;
  cdfArtifactVersion: number;
  cdfArtifactKey: string;
  cdfValidationStatus: string;
  cdfValidationId?: string;
  cdfRuntimePath: "canonical";
  cdfRuntimeVersion: string;
  canonicalPath: true;
  /**
   * M8F — when true, FE may use M5 RenderedFile for Packaging raster CTAs.
   * Independent of ingest: generation can be canonical while downloads stay legacy.
   */
  cdfDownloadEligible: boolean;
  cdfPreferLegacyDownload?: boolean;
};

export type PackagingIngestFailure = {
  kind:
    | "validation_failed"
    | "dependency_missing"
    | "ingest_failed"
    | "canonicalization_unsupported"
    | "opt_in_disabled"
    | "final_no_artifact";
  cdfValidationStatus?: string;
  cdfValidationId?: string;
  cdfRuntimePath: "none";
  legacyCompatible: true;
  fallbackReason: string;
  message: string;
};

export type TryIngestPackagingResult =
  | { kind: "accepted"; ingest: IngestGenerationResult; attach: PackagingCanonicalAttach }
  | PackagingIngestFailure
  | null;

function metaString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const v = metadata?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Opt-in gate for non-contract traffic. Canonical contract callers pass forceOptIn. */
export function isPackagingCanonicalIngestEnabled(): boolean {
  return (
    process.env.CDF_PACKAGING_INGEST === "1" ||
    process.env.CDF_PACKAGING_INGEST === "true"
  );
}

function findExactRef(
  sessionId: string,
  artifactKey: PackagingArtifactKey,
): { artifactId: string; version: number } | undefined {
  const session = getCdfSession(sessionId);
  if (!session) return undefined;
  return findPackagingExactRef(session, artifactKey);
}

export function resolvePackagingRefsFromSession(
  sessionId: string,
): NonNullable<IngestGenerationInput["packagingRefs"]> {
  return {
    dielineRef: findExactRef(sessionId, PACKAGING_ARTIFACT_KEYS.dieline),
    routesRef: findExactRef(sessionId, PACKAGING_ARTIFACT_KEYS.routes),
    threeDDirectionRef: findExactRef(
      sessionId,
      PACKAGING_ARTIFACT_KEYS.threeDDirection,
    ),
    frontPackRef: findExactRef(sessionId, PACKAGING_ARTIFACT_KEYS.frontPack),
    completePackRef: findExactRef(
      sessionId,
      PACKAGING_ARTIFACT_KEYS.completePack,
    ),
    viewsRef: findExactRef(sessionId, PACKAGING_ARTIFACT_KEYS.views),
  };
}

/**
 * Attempt Packaging M3C ingest (opt-in).
 * Returns null when not Packaging / missing session metadata / ingest disabled.
 * Never throws into callers — failures are typed + legacyCompatible.
 */
export function tryIngestPackagingCdfCompletion(input: {
  metadata?: Record<string, unknown>;
  rawOutput: unknown;
  executionId?: string;
  organizationId?: string;
  workspaceId?: string;
  projectId?: string;
  userId?: string;
  vaultAssetIds?: string[];
  /** Test/harness override — bypasses env opt-in when true. */
  forceOptIn?: boolean;
  packagingRefs?: IngestGenerationInput["packagingRefs"];
}): TryIngestPackagingResult {
  const metadata = input.metadata ?? {};
  const sessionId = metaString(metadata, "cdfSessionId");
  const serviceId = metaString(metadata, "cdfServiceId") ?? "packaging";
  const phaseId = metaString(metadata, "cdfPhaseId");

  if (!sessionId || !phaseId) return null;
  if (serviceId !== "packaging" && serviceId !== "Packaging") return null;

  if (!input.forceOptIn && !isPackagingCanonicalIngestEnabled()) {
    return {
      kind: "opt_in_disabled",
      cdfRuntimePath: "none",
      legacyCompatible: true,
      fallbackReason: "packaging_ingest_opt_in_disabled",
      message:
        "CDF_PACKAGING_INGEST is off — Packaging live traffic remains legacy (M8B)",
    };
  }

  if (phaseId === "final" || PACKAGING_PHASE_ARTIFACT_KEY[phaseId] === null) {
    return {
      kind: "final_no_artifact",
      cdfRuntimePath: "none",
      legacyCompatible: true,
      fallbackReason: "final_phase_no_creative_artifact",
      message: "Packaging final phase has no creative artifact target",
    };
  }

  const session = getCdfSession(sessionId);
  if (!session) {
    console.info(
      JSON.stringify({
        scope: "cdf.packaging_runtime",
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
    target = resolveArtifactTarget({ serviceId: "packaging", phaseId });
  } catch {
    return {
      kind: "ingest_failed",
      cdfRuntimePath: "none",
      legacyCompatible: true,
      fallbackReason: "target_unresolved",
      message: `No Packaging artifact mapping for phase ${phaseId}`,
    };
  }

  const packagingRefs =
    input.packagingRefs ?? resolvePackagingRefsFromSession(sessionId);

  const sourceArtifacts: Array<{
    artifactId: string;
    version: number;
    artifactKey: string;
    relationship: "uses";
  }> = [];
  const pushRef = (
    key: PackagingArtifactKey,
    ref: { artifactId: string; version: number } | undefined,
  ) => {
    if (!ref) return;
    sourceArtifacts.push({
      artifactId: ref.artifactId,
      version: ref.version,
      artifactKey: key,
      relationship: "uses",
    });
  };
  pushRef(PACKAGING_ARTIFACT_KEYS.dieline, packagingRefs.dielineRef);
  pushRef(PACKAGING_ARTIFACT_KEYS.routes, packagingRefs.routesRef);
  pushRef(
    PACKAGING_ARTIFACT_KEYS.threeDDirection,
    packagingRefs.threeDDirectionRef,
  );
  pushRef(PACKAGING_ARTIFACT_KEYS.frontPack, packagingRefs.frontPackRef);
  pushRef(PACKAGING_ARTIFACT_KEYS.completePack, packagingRefs.completePackRef);
  pushRef(PACKAGING_ARTIFACT_KEYS.views, packagingRefs.viewsRef);

  try {
    const ingest = ingestGenerationCompletion({
      sessionId,
      serviceId: "packaging",
      phaseId,
      organizationId: input.organizationId ?? session.organizationId,
      workspaceId: input.workspaceId ?? session.workspaceId,
      projectId: input.projectId ?? session.projectId,
      userId: input.userId ?? session.userId,
      executionId: input.executionId,
      rawOutput: input.rawOutput,
      contextId: metaString(metadata, "cdfContextId"),
      contextHash: metaString(metadata, "cdfContextHash"),
      activeBriefId: session.activeBriefId,
      activeBriefVersion: session.activeBriefVersion,
      expectedSessionVersion: session.sessionVersion,
      packagingRefs,
      vaultAssetIds: input.vaultAssetIds,
      upstreamArtifactRefs: collectContractUpstreamRefs({ sessionId, serviceId, phaseId }),
      sourceArtifacts: sourceArtifacts.length ? sourceArtifacts : undefined,
      requestId: input.executionId
        ? `m8b_ingest_${input.executionId}_${phaseId}`
        : undefined,
      requireAcceptanceGate: true,
    });

    const status = ingest.validationStatus ?? "passed";
    if (!isM4AcceptanceStatus(status as "passed" | "review_required" | "failed")) {
      return {
        kind: "validation_failed",
        cdfValidationStatus: status,
        cdfValidationId: ingest.validationId,
        cdfRuntimePath: "none",
        legacyCompatible: true,
        fallbackReason: "m4_validation_failed",
        message: `M4 status ${status} — no canonical Packaging artifact`,
      };
    }

    const attach: PackagingCanonicalAttach = {
      cdfArtifactId: ingest.artifactId,
      cdfArtifactVersion: ingest.artifactVersion,
      cdfArtifactKey: ingest.artifactKey,
      cdfValidationStatus: status,
      cdfValidationId: ingest.validationId,
      cdfRuntimePath: "canonical",
      cdfRuntimeVersion: CDF_PACKAGING_RUNTIME_VERSION,
      canonicalPath: true,
      // Canonical attach always authorizes M5 download — no art_* strangler.
      cdfDownloadEligible: true,
    };

    // Bind exact generated ref into session via CAS. Fail-closed if bind fails.
    // Fanout leaves must scope the pin — omitting targetId collapses N→1.
    const bound = bindGeneratedPackagingArtifactToSession({
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
        scope: "cdf.packaging_runtime",
        event: "canonical_accepted",
        sessionId,
        phaseId,
        artifactId: ingest.artifactId,
        artifactVersion: ingest.artifactVersion,
        artifactKey: ingest.artifactKey,
        validationStatus: status,
        downloadEligible: true,
        ts: new Date().toISOString(),
      }),
    );

    return { kind: "accepted", ingest, attach };
  } catch (err) {
    if (
      err instanceof CdfGenerationArtifactError &&
      err.generationArtifactCode === "PACKAGING_CANONICALIZATION_UNSUPPORTED"
    ) {
      return {
        kind: "canonicalization_unsupported",
        cdfRuntimePath: "none",
        legacyCompatible: true,
        fallbackReason: "packaging_canonicalization_unsupported",
        message: err.message,
      };
    }
    if (
      err instanceof CdfGenerationArtifactError &&
      err.generationArtifactCode === "ARTIFACT_VALIDATION_FAILED"
    ) {
      const meta = err.metadata ?? {};
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
        fallbackReason: "packaging_dependency_missing",
        message: err.message,
      };
    }
    console.info(
      JSON.stringify({
        scope: "cdf.packaging_runtime",
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
