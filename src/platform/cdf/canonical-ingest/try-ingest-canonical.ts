/**
 * Generic canonical CDF completion ingest boundary.
 *
 * ONE entry for all services. Class-A deep bridges (presentation / packaging /
 * social-media) remain preferred overlays when their typed refs/schemas apply.
 * All other services use contract-driven generic completion:
 *   phase.artifact → normalize → M4 → ArtifactVersion → M9C bind
 *
 * Env ingest flags are stranglers for non-contract traffic only.
 * When cdfExecutionStrategy=canonical (or forceOptIn), ingest is mandatory.
 */

import { resolveCdfCanonicalService } from "../canonical";
import { bindGeneratedArtifactToSession } from "../artifacts/generated-bind";
import { getCdfSession } from "../session-store";
import {
  ingestGenerationCompletion,
  CdfGenerationArtifactError,
} from "../generation-artifact";
import { resolveArtifactTarget } from "../generation-artifact/target-resolution";
import { isM4AcceptanceStatus } from "../generation-validation";
import { qualityAttemptFromMetadata } from "../generation-validation/leniency";
import { PRESENTATION_ARTIFACT_KEYS } from "../artifacts/presentation/keys";
import { isPackagingArtifactKey } from "../artifacts/packaging/keys";
import { isSocialMediaArtifactKey } from "../artifacts/social-media/keys";
import { CDF_DEEP_INGEST_RUNTIME_SERVICES } from "../../ai/conversational-runtime/acceptance-matrix";
import { collectContractUpstreamRefs } from "./upstream-projection";

export type GenericCanonicalIngestKind =
  | "accepted"
  | "skipped_not_applicable"
  | "adapter_unavailable"
  | "opt_in_disabled"
  | "ingest_failed"
  | "validation_failed"
  | "session_bind_failed"
  | "final_no_artifact";

export type GenericCanonicalIngestResult = {
  readonly kind: GenericCanonicalIngestKind;
  readonly family?:
    | "presentation"
    | "packaging"
    | "social-media"
    | "generic"
    | "none";
  readonly attach?: Record<string, unknown>;
  readonly fallbackReason?: string;
  readonly message?: string;
  readonly cdfValidationStatus?: string;
  readonly cdfValidationId?: string;
  readonly legacyCompatible?: boolean;
};

const DEEP = new Set<string>(CDF_DEEP_INGEST_RUNTIME_SERVICES);

function metaString(
  meta: Record<string, unknown> | undefined,
  key: string,
): string {
  const v = meta?.[key];
  return typeof v === "string" ? v.trim() : "";
}

function isCanonicalForced(meta: Record<string, unknown> | undefined): boolean {
  if (!meta) return false;
  if (meta.cdfExecutionStrategy === "canonical") return true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { contractRequiresCanonicalImageIngest } =
      require("../generation-artifact") as typeof import("../generation-artifact");
    return contractRequiresCanonicalImageIngest(meta) != null;
  } catch {
    return false;
  }
}

function findDesignSystemRef(sessionId: string):
  | { artifactId: string; version: number }
  | undefined {
  const session = getCdfSession(sessionId);
  if (!session) return undefined;
  const hit =
    session.selectedArtifacts?.find(
      (r) => r.artifactKey === PRESENTATION_ARTIFACT_KEYS.designSystem,
    ) ??
    session.approvedArtifacts?.find(
      (r) => r.artifactKey === PRESENTATION_ARTIFACT_KEYS.designSystem,
    );
  return hit
    ? { artifactId: hit.artifactId, version: hit.version }
    : undefined;
}

/**
 * Contract-driven generic completion for any service/phase with an artifact contract.
 * No serviceId semantic branches — Class-A typed refs are applied only when the
 * resolved artifact key belongs to a deep overlay family.
 */
export function tryIngestContractCanonicalCompletion(input: {
  readonly metadata?: Record<string, unknown>;
  readonly rawOutput: unknown;
  readonly executionId?: string;
  readonly organizationId?: string;
  readonly workspaceId?: string;
  readonly projectId?: string;
  readonly userId?: string;
  readonly vaultAssetIds?: string[];
  readonly serviceId: string;
  readonly phaseId: string;
  readonly sessionId: string;
}): GenericCanonicalIngestResult {
  const sessionId = input.sessionId;
  const phaseId = input.phaseId;
  const serviceId = input.serviceId;
  const session = getCdfSession(sessionId);
  if (!session) {
    return {
      kind: "ingest_failed",
      family: "generic",
      fallbackReason: "session_missing",
      message: `CDF session not found: ${sessionId}`,
      legacyCompatible: false,
    };
  }

  let target;
  try {
    target = resolveArtifactTarget({ serviceId, phaseId });
  } catch (err) {
    return {
      kind: "adapter_unavailable",
      family: "generic",
      fallbackReason: "target_unresolved",
      message:
        err instanceof Error
          ? err.message
          : `No artifact target for ${serviceId}.${phaseId}`,
      legacyCompatible: false,
    };
  }

  const designSystemRef =
    target.artifactKey === PRESENTATION_ARTIFACT_KEYS.deck
      ? findDesignSystemRef(sessionId)
      : undefined;
  if (
    target.artifactKey === PRESENTATION_ARTIFACT_KEYS.deck &&
    !designSystemRef
  ) {
    return {
      kind: "ingest_failed",
      family: "generic",
      fallbackReason: "dependency_missing",
      message: "presentation.deck requires exact designSystemRef",
      legacyCompatible: false,
    };
  }

  let packagingRefs: Parameters<
    typeof ingestGenerationCompletion
  >[0]["packagingRefs"];
  let socialMediaRefs: Parameters<
    typeof ingestGenerationCompletion
  >[0]["socialMediaRefs"];

  if (isPackagingArtifactKey(target.artifactKey)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { resolvePackagingRefsFromSession } =
        require("../packaging-runtime") as typeof import("../packaging-runtime");
      packagingRefs = resolvePackagingRefsFromSession(sessionId);
    } catch {
      packagingRefs = undefined;
    }
  }
  if (isSocialMediaArtifactKey(target.artifactKey)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { resolveSocialMediaRefsFromSession } =
        require("../social-media-runtime") as typeof import("../social-media-runtime");
      socialMediaRefs = resolveSocialMediaRefsFromSession(sessionId);
    } catch {
      socialMediaRefs = undefined;
    }
  }

  const fanoutLeaf =
    metaString(input.metadata, "generationFanoutTargetId") ||
    metaString(input.metadata, "generationFanoutLeafId");
  const fanoutGroup = metaString(input.metadata, "generationFanoutGroupId");
  const requestId = input.executionId
    ? `cdf_ingest_${input.executionId}_${phaseId}${
        fanoutLeaf ? `_${fanoutLeaf}` : ""
      }`
    : undefined;

  try {
    const ingest = ingestGenerationCompletion({
      sessionId,
      serviceId,
      phaseId,
      organizationId: input.organizationId ?? session.organizationId,
      workspaceId: input.workspaceId ?? session.workspaceId,
      projectId: input.projectId ?? session.projectId,
      userId: input.userId ?? session.userId,
      executionId: input.executionId,
      rawOutput: input.rawOutput,
      contextId: metaString(input.metadata, "cdfContextId"),
      qualityAttempt: qualityAttemptFromMetadata(input.metadata),
      contextHash: metaString(input.metadata, "cdfContextHash"),
      activeBriefId: session.activeBriefId,
      activeBriefVersion: session.activeBriefVersion,
      expectedSessionVersion: session.sessionVersion,
      vaultAssetIds: input.vaultAssetIds,
      upstreamArtifactRefs: collectContractUpstreamRefs({
        sessionId,
        serviceId,
        phaseId,
      }),
      designSystemRef,
      packagingRefs,
      socialMediaRefs,
      requestId,
      requireAcceptanceGate: true,
    });

    const status = ingest.validationStatus ?? "passed";
    if (
      !isM4AcceptanceStatus(status as "passed" | "review_required" | "failed")
    ) {
      return {
        kind: "validation_failed",
        family: "generic",
        fallbackReason: "m4_rejected",
        message: `Canonical validation ${status}`,
        cdfValidationStatus: status,
        cdfValidationId: ingest.validationId,
        legacyCompatible: false,
      };
    }

    const attach: Record<string, unknown> = {
      cdfArtifactId: ingest.artifactId,
      cdfArtifactVersion: ingest.artifactVersion,
      cdfArtifactKey: ingest.artifactKey,
      cdfValidationStatus: status,
      cdfValidationId: ingest.validationId,
      cdfRuntimePath: "canonical",
      cdfRuntimeVersion: "cdf.generic.completion.v1",
      canonicalPath: true,
      cdfDownloadEligible: true,
    };

    const bound = bindGeneratedArtifactToSession({
      sessionId,
      phaseId,
      artifactId: ingest.artifactId,
      version: ingest.artifactVersion,
      artifactKey: ingest.artifactKey,
      organizationId: input.organizationId ?? session.organizationId,
      projectId: input.projectId ?? session.projectId,
      generationFanoutGroupId: fanoutGroup || undefined,
      generationFanoutTargetId: fanoutLeaf || undefined,
      generationExecutionId: input.executionId,
      generationFanoutLeaf:
        input.metadata?.generationFanoutLeaf === true ||
        Boolean(fanoutGroup) ||
        Boolean(fanoutLeaf) ||
        undefined,
    });
    if (!bound.ok) {
      return {
        kind: "session_bind_failed",
        family: "generic",
        attach,
        fallbackReason: bound.code,
        message: bound.message,
        legacyCompatible: false,
      };
    }

    return {
      kind: "accepted",
      family: "generic",
      attach,
      legacyCompatible: false,
    };
  } catch (err) {
    if (err instanceof CdfGenerationArtifactError) {
      return {
        kind: "ingest_failed",
        family: "generic",
        fallbackReason: err.code,
        message: err.message,
        legacyCompatible: false,
      };
    }
    return {
      kind: "ingest_failed",
      family: "generic",
      fallbackReason: "ingest_error",
      message: err instanceof Error ? err.message : String(err),
      legacyCompatible: false,
    };
  }
}

/**
 * Contract-driven ingest. Returns null when metadata is not a CDF completion.
 */
export function tryIngestCanonicalCdfCompletion(input: {
  readonly metadata?: Record<string, unknown>;
  readonly rawOutput: unknown;
  readonly executionId?: string;
  readonly organizationId?: string;
  readonly workspaceId?: string;
  readonly projectId?: string;
  readonly userId?: string;
  readonly vaultAssetIds?: string[];
  readonly forceOptIn?: boolean;
}): GenericCanonicalIngestResult | null {
  const meta = input.metadata;
  const sessionId = metaString(meta, "cdfSessionId");
  const phaseId = metaString(meta, "cdfPhaseId");
  const serviceId =
    metaString(meta, "cdfServiceId") ||
    metaString(meta, "service") ||
    metaString(meta, "serviceId");
  if (!sessionId || !phaseId || !serviceId) return null;

  const canonical = resolveCdfCanonicalService(serviceId);
  if (!canonical) {
    return {
      kind: "adapter_unavailable",
      family: "none",
      fallbackReason: "unknown_service",
      message: `No CDF canonical service for "${serviceId}"`,
      legacyCompatible: false,
    };
  }

  const phase = canonical.phases.find((p) => p.phaseId === phaseId);
  if (!phase) {
    return {
      kind: "adapter_unavailable",
      family: "none",
      fallbackReason: "unknown_phase",
      message: `Unknown phase "${phaseId}" for service "${canonical.serviceId}"`,
      legacyCompatible: false,
    };
  }

  if (
    phase.executionStrategy === "none" ||
    phase.generationModality === "none" ||
    phase.generationModality === "materialize"
  ) {
    return {
      kind: "skipped_not_applicable",
      family: "none",
      fallbackReason: "phase_strategy_none",
      message: `Phase ${canonical.serviceId}.${phaseId} has no generation ingest`,
      legacyCompatible: true,
    };
  }

  const force = input.forceOptIn === true || isCanonicalForced(meta);
  const strategyCanonical = phase.executionStrategy === "canonical";

  // Class-A deep overlays — preserve typed ref / schema behavior.
  // Env flags never block when contract forces canonical.
  if (DEEP.has(canonical.serviceId)) {
    if (canonical.serviceId === "presentation") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { tryIngestPresentationCdfCompletion } =
        require("../presentation-runtime") as typeof import("../presentation-runtime");
      const r = tryIngestPresentationCdfCompletion({
        metadata: meta,
        rawOutput: input.rawOutput,
        executionId: input.executionId,
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        userId: input.userId,
      });
      return mapFamilyResult(r, "presentation");
    }

    if (canonical.serviceId === "packaging") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const {
        tryIngestPackagingCdfCompletion,
        isPackagingCanonicalIngestEnabled,
      } = require("../packaging-runtime") as typeof import("../packaging-runtime");
      if (!force && !strategyCanonical && !isPackagingCanonicalIngestEnabled()) {
        return {
          kind: "opt_in_disabled",
          family: "packaging",
          fallbackReason: "packaging_ingest_opt_in_disabled",
          message: "Packaging ingest flag off (non-canonical traffic)",
          legacyCompatible: true,
        };
      }
      const r = tryIngestPackagingCdfCompletion({
        metadata: meta,
        rawOutput: input.rawOutput,
        executionId: input.executionId,
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        userId: input.userId,
        vaultAssetIds: input.vaultAssetIds,
        forceOptIn: force || strategyCanonical || undefined,
      });
      return mapFamilyResult(r, "packaging");
    }

    if (canonical.serviceId === "social-media") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const {
        tryIngestSocialMediaCdfCompletion,
        isSocialMediaCanonicalIngestEnabled,
      } =
        require("../social-media-runtime") as typeof import("../social-media-runtime");
      if (
        !force &&
        !strategyCanonical &&
        !isSocialMediaCanonicalIngestEnabled()
      ) {
        return {
          kind: "opt_in_disabled",
          family: "social-media",
          fallbackReason: "opt_in_disabled",
          message: "Social Media ingest flag off (non-canonical traffic)",
          legacyCompatible: true,
        };
      }
      const r = tryIngestSocialMediaCdfCompletion({
        metadata: meta,
        rawOutput: input.rawOutput,
        executionId: input.executionId,
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        userId: input.userId,
        vaultAssetIds: input.vaultAssetIds,
        forceOptIn: force || strategyCanonical || undefined,
      });
      return mapFamilyResult(r, "social-media");
    }
  }

  // Universal contract-generic completion for all other services.
  if (force || strategyCanonical) {
    return tryIngestContractCanonicalCompletion({
      metadata: meta,
      rawOutput: input.rawOutput,
      executionId: input.executionId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      userId: input.userId,
      vaultAssetIds: input.vaultAssetIds,
      serviceId: canonical.serviceId,
      phaseId,
      sessionId,
    });
  }

  // Non-canonical exploratory (should be rare after route_visual migration).
  return {
    kind: "skipped_not_applicable",
    family: "none",
    fallbackReason: "non_canonical_strategy",
    message: `Phase ${canonical.serviceId}.${phaseId} strategy=${phase.executionStrategy} — no canonical ingest`,
    legacyCompatible: true,
  };
}

function mapFamilyResult(
  r: {
    kind?: string;
    attach?: unknown;
    fallbackReason?: string;
    message?: string;
    cdfValidationStatus?: string;
    cdfValidationId?: string;
    legacyCompatible?: boolean;
  } | null,
  family: "presentation" | "packaging" | "social-media",
): GenericCanonicalIngestResult {
  if (!r || r.kind === undefined) {
    return {
      kind: "skipped_not_applicable",
      family,
      fallbackReason: "bridge_null",
      message: "Family bridge returned null",
      legacyCompatible: true,
    };
  }
  if (r.kind === "accepted") {
    return {
      kind: "accepted",
      family,
      attach: r.attach as Record<string, unknown>,
      legacyCompatible: false,
    };
  }
  if (r.kind === "opt_in_disabled") {
    return {
      kind: "opt_in_disabled",
      family,
      fallbackReason: r.fallbackReason,
      message: r.message,
      legacyCompatible: true,
    };
  }
  if (r.kind === "final_no_artifact") {
    return {
      kind: "final_no_artifact",
      family,
      fallbackReason: r.fallbackReason,
      message: r.message,
      legacyCompatible: true,
    };
  }
  if (r.kind === "validation_failed") {
    return {
      kind: "validation_failed",
      family,
      fallbackReason: r.fallbackReason,
      message: r.message,
      cdfValidationStatus: r.cdfValidationStatus,
      cdfValidationId: r.cdfValidationId,
      legacyCompatible: false,
    };
  }
  return {
    kind: "ingest_failed",
    family,
    fallbackReason: r.fallbackReason ?? r.kind,
    message: r.message,
    cdfValidationId: r.cdfValidationId,
    legacyCompatible: r.legacyCompatible === true,
  };
}

/** Bind a generic accepted attach into generatedArtifacts. */
export function bindGenericCanonicalAttach(input: {
  readonly sessionId: string;
  readonly phaseId: string;
  readonly attach: Record<string, unknown>;
  readonly organizationId?: string;
  readonly projectId?: string;
  readonly generationFanoutGroupId?: string;
  readonly generationFanoutTargetId?: string;
  readonly generationExecutionId?: string;
}):
  | { ok: true }
  | { ok: false; reason: string; message: string } {
  const artifactId = String(input.attach.cdfArtifactId ?? "").trim();
  const artifactKey = String(input.attach.cdfArtifactKey ?? "").trim();
  const version = Number(input.attach.cdfArtifactVersion);
  if (
    !artifactId.startsWith("cdfart_") ||
    !artifactKey ||
    !Number.isInteger(version) ||
    version < 1
  ) {
    return {
      ok: false,
      reason: "invalid_attach",
      message: "Canonical attach missing exact artifact identity",
    };
  }
  const bound = bindGeneratedArtifactToSession({
    sessionId: input.sessionId,
    phaseId: input.phaseId,
    artifactId,
    version,
    artifactKey,
    organizationId: input.organizationId,
    projectId: input.projectId,
    generationFanoutGroupId: input.generationFanoutGroupId,
    generationFanoutTargetId: input.generationFanoutTargetId,
    generationExecutionId: input.generationExecutionId,
  });
  if (!bound.ok) {
    return { ok: false, reason: bound.code, message: bound.message };
  }
  return { ok: true };
}

/** True when contract-generic completion is available for any registered service. */
export function isGenericCanonicalCompletionAvailable(): boolean {
  return true;
}
