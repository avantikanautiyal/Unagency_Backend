/**
 * Shared CDF canonical completion ingest (sync create + recovered_job finalize).
 *
 * ONE authoritative path. Sync must not duplicate this logic.
 *
 * For executionStrategy=canonical (or contractRequiresCanonicalImageIngest):
 * provider success without ArtifactVersion + generatedArtifacts bind ⇒ product failure.
 *
 * Monotonic completion: once ArtifactVersion + generatedArtifacts (or an
 * established completion stamp) exists for this execution leaf, a later
 * duplicate poll_hydrate / recovered_job / finalize ingest that hits an
 * idempotency conflict MUST recover the established attach and MUST NOT
 * set productCompletionBlocked (success cannot downgrade to failure).
 * Intentional fanout leaves are independent completions of the same phase.
 */

import type { AsyncMediaPlatform } from "../../infrastructure/durability/create-async-media-platform";
import type { CdfSessionArtifactRef } from "../../cdf/types";
import { presentationEligibilityFromExecutionSurfaces } from "../../../../../Unagency-frontend/packages/api/src/domain/cdf/generated-deliverable-presentation-eligibility";

export type CdfCanonicalIngestAttachResult = {
  structuredCandidate: unknown;
  presentationCanonicalAttach: Record<string, unknown> | null;
  presentationIngestFailure: Record<string, unknown> | null;
  packagingCanonicalAttach: Record<string, unknown> | null;
  packagingIngestFailure: Record<string, unknown> | null;
  socialMediaCanonicalAttach: Record<string, unknown> | null;
  socialMediaIngestFailure: Record<string, unknown> | null;
  /**
   * Contract-generic family attach (web-tech structured/visual, etc.).
   * Must be surfaced — previously dropped → canonical_ingest_after=no_attach
   * even when cdfart_*@V was accepted.
   */
  genericCanonicalAttach: Record<string, unknown> | null;
  genericIngestFailure: Record<string, unknown> | null;
  cdfVaultAssetIds?: string[];
  /**
   * When true, caller MUST set execution status to failed —
   * provider/runtime success alone is not product success.
   */
  productCompletionBlocked: boolean;
  productCompletionBlockReason?: string;
  /**
   * Observational structural/OCR diagnostics only.
   * Callers MUST persist these for forensics; MUST NOT use them as
   * an independent acceptance authority.
   */
  metadataStamps?: Readonly<Record<string, unknown>>;
};

/**
 * Merge observational structural stamps into result/metadata surfaces.
 * Does not change acceptance — stamps mirror the structural decision already made.
 */
export function mergeStructuralDiagnosticStamps(input: {
  readonly target?: Record<string, unknown> | null;
  readonly stamps?: Readonly<Record<string, unknown>> | null;
}): Record<string, unknown> {
  const base =
    input.target && typeof input.target === "object" && !Array.isArray(input.target)
      ? { ...input.target }
      : {};
  if (!input.stamps || typeof input.stamps !== "object") return base;
  return { ...base, ...input.stamps };
}

/**
 * Authoritative presentation-eligibility stamp for generated deliverables.
 * Observational relative to acceptance — never a second acceptance path.
 */
export function buildPresentationEligibilityStamp(input: {
  readonly executionId: string;
  readonly executionStatus: string;
  readonly workingMetadata?: Record<string, unknown> | null;
  readonly resultData?: Record<string, unknown> | null;
  readonly artifactIds?: readonly string[] | null;
  readonly productCompletionBlocked?: boolean;
  readonly productCompletionBlockReason?: string;
}): Record<string, unknown> {
  const requiresCanonical = metadataRequiresCanonicalProductCompletion(
    input.workingMetadata ?? undefined,
  );
  const eligibility = presentationEligibilityFromExecutionSurfaces({
    executionId: input.executionId,
    executionStatus: input.executionStatus,
    requiresCanonicalCompletion: requiresCanonical,
    resultData: {
      ...(input.resultData ?? {}),
      ...(input.productCompletionBlocked
        ? {
            cdfCanonicalRejected: true,
            cdfFallbackReason:
              input.productCompletionBlockReason ?? "canonical_completion_blocked",
          }
        : {}),
    },
    metadata: input.workingMetadata ?? null,
    artifactIds: input.artifactIds ?? null,
    errorMessage: input.productCompletionBlockReason,
  });
  return { presentationEligibility: eligibility };
}

/**
 * Best-effort: write structural diagnostics onto job.payload.metadata for
 * post-run forensic inspection (same-process cache + durable Mongo when available).
 */
export async function persistStructuralDiagnosticsToJobMetadata(input: {
  readonly getJob?: (
    jobId: string,
  ) =>
    | { ok: true; value: { payload?: { metadata?: Record<string, unknown> } } }
    | { ok: false }
    | undefined;
  readonly jobId?: string | null;
  readonly stamps?: Readonly<Record<string, unknown>> | null;
}): Promise<void> {
  if (!input.stamps || Object.keys(input.stamps).length === 0) return;
  const jobId = typeof input.jobId === "string" ? input.jobId.trim() : "";
  if (!jobId) return;

  let nextMeta: Record<string, unknown> | undefined;
  if (input.getJob) {
    try {
      const got = input.getJob(jobId);
      if (got && got.ok && got.value?.payload) {
        const payload = got.value.payload as {
          metadata?: Record<string, unknown>;
        };
        nextMeta = {
          ...(payload.metadata && typeof payload.metadata === "object"
            ? payload.metadata
            : {}),
          ...input.stamps,
        };
        payload.metadata = nextMeta;
      }
    } catch {
      // in-memory annotate is best-effort
    }
  }

  try {
    const { EnterpriseJob } = await import(
      "../../infrastructure/durability/mongo/models/enterprise-job.model"
    );
    const $set: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    for (const [key, value] of Object.entries(input.stamps)) {
      $set[`payload.metadata.${key}`] = value;
    }
    await EnterpriseJob.updateOne({ jobId }, { $set });
  } catch {
    // Durable annotate is best-effort (tests / stub stores may lack Mongo).
  }
}

/** Attach rebuilt from an already-established canonical completion (no new AV). */
export function attachFromEstablishedCanonicalPin(
  pin: Pick<
    CdfSessionArtifactRef,
    | "artifactId"
    | "version"
    | "artifactKey"
    | "generationFanoutGroupId"
    | "generationFanoutTargetId"
    | "generationExecutionId"
  >,
): Record<string, unknown> {
  return {
    cdfArtifactId: pin.artifactId,
    cdfArtifactVersion: pin.version,
    cdfArtifactKey: pin.artifactKey,
    cdfRuntimePath: "canonical",
    canonicalPath: true,
    cdfDownloadEligible: true,
    cdfCanonicalCompletionEstablished: true,
    cdfIdempotentCompletionReplay: true,
    ...(typeof pin.generationFanoutGroupId === "string" &&
    pin.generationFanoutGroupId.trim()
      ? { generationFanoutGroupId: pin.generationFanoutGroupId.trim() }
      : {}),
    ...(typeof pin.generationFanoutTargetId === "string" &&
    pin.generationFanoutTargetId.trim()
      ? { generationFanoutTargetId: pin.generationFanoutTargetId.trim() }
      : {}),
    ...(typeof pin.generationExecutionId === "string" &&
    pin.generationExecutionId.trim()
      ? { generationExecutionId: pin.generationExecutionId.trim() }
      : {}),
  };
}

function fanoutTargetIdFromMeta(
  meta: Record<string, unknown> | undefined,
): string {
  if (!meta) return "";
  const v = meta.generationFanoutTargetId;
  return typeof v === "string" ? v.trim() : "";
}

function isFanoutLeafMeta(meta: Record<string, unknown> | undefined): boolean {
  if (!meta) return false;
  return (
    meta.generationFanoutLeaf === true ||
    fanoutTargetIdFromMeta(meta).length > 0
  );
}

function creativeOptionTargetIdFromMeta(
  meta: Record<string, unknown> | undefined,
): string {
  if (!meta) return "";
  const v = meta.creativeOptionTargetId;
  return typeof v === "string" ? v.trim() : "";
}

function isCreativeOptionLeafMeta(
  meta: Record<string, unknown> | undefined,
): boolean {
  if (!meta) return false;
  return (
    meta.creativeOptionLeaf === true ||
    creativeOptionTargetIdFromMeta(meta).length > 0
  );
}

/**
 * Resolve an already-successful canonical completion for this execution leaf.
 * Prefers metadata stamp, then session.generatedArtifacts (exact X@V pin).
 *
 * Fanout leaves: session lookup is scoped to generationFanoutTargetId so one
 * leaf cannot idempotently replay another leaf's completion.
 * Creative option leaves (exactly N routes): scoped to this execution and
 * creativeOptionTargetId. A sibling option must not replay another option's
 * ArtifactVersion, and an inherited parent-phase stamp is not a match.
 * Non-fanout single completions: session+phase (+ optional artifactKey).
 */
export function resolveEstablishedCanonicalCompletionAttach(
  meta: Record<string, unknown> | undefined,
  executionId?: string,
): Record<string, unknown> | null {
  if (!meta) return null;

  const stampedId =
    typeof meta.cdfArtifactId === "string" ? meta.cdfArtifactId.trim() : "";
  const stampedVersion = meta.cdfArtifactVersion;
  const stampedKey =
    typeof meta.cdfArtifactKey === "string" ? meta.cdfArtifactKey.trim() : "";
  const leafTargetId = fanoutTargetIdFromMeta(meta);

  if (
    meta.cdfCanonicalCompletionEstablished === true &&
    stampedId.startsWith("cdfart_") &&
    typeof stampedVersion === "number" &&
    Number.isInteger(stampedVersion) &&
    stampedVersion >= 1
  ) {
    // Per-execution stamp — same leaf / same execution replay only.
    const stampedFanoutTarget =
      typeof meta.cdfCanonicalFanoutTargetId === "string" &&
      meta.cdfCanonicalFanoutTargetId.trim()
        ? meta.cdfCanonicalFanoutTargetId.trim()
        : leafTargetId;
    // C6: fanout leaf claim without targetId must not replay first sibling.
    if (isFanoutLeafMeta(meta) && !stampedFanoutTarget) {
      return null;
    }
    // Creative options inherit the parent phase's completion stamp via
    // continuity. That stamp is not this option's ArtifactVersion — fall
    // through to an execution-scoped pin instead of replaying it.
    if (!isCreativeOptionLeafMeta(meta)) {
      return attachFromEstablishedCanonicalPin({
        artifactId: stampedId,
        version: stampedVersion,
        artifactKey: stampedKey || "unknown",
        ...(stampedFanoutTarget
          ? { generationFanoutTargetId: stampedFanoutTarget }
          : {}),
        ...(typeof meta.generationFanoutGroupId === "string" &&
        meta.generationFanoutGroupId.trim()
          ? { generationFanoutGroupId: meta.generationFanoutGroupId.trim() }
          : {}),
      });
    }
  }

  // C6: claimed fanout leaf without targetId — never fall through to first pin.
  if (isFanoutLeafMeta(meta) && !leafTargetId) {
    return null;
  }

  const sessionId =
    typeof meta.cdfSessionId === "string" ? meta.cdfSessionId.trim() : "";
  const phaseId =
    typeof meta.cdfPhaseId === "string" ? meta.cdfPhaseId.trim() : "";
  if (!sessionId || !phaseId) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCdfSession } = require("../../cdf") as typeof import("../../cdf");
    const session = getCdfSession(sessionId);
    const pins = session?.generatedArtifacts ?? [];

    const pinMatchesIdentity = (
      r: CdfSessionArtifactRef,
    ): boolean => {
      if (
        typeof r.artifactId !== "string" ||
        !r.artifactId.startsWith("cdfart_") ||
        typeof r.version !== "number" ||
        !Number.isInteger(r.version) ||
        r.version < 1
      ) {
        return false;
      }
      if (isFanoutLeafMeta(meta) && leafTargetId) {
        return (
          r.phaseId === phaseId &&
          r.generationFanoutTargetId === leafTargetId
        );
      }
      // Creative options are parallel completions of one phase. A phase-wide
      // pin is a sibling (or the parent), never this option.
      if (isCreativeOptionLeafMeta(meta)) {
        const execId =
          typeof executionId === "string" ? executionId.trim() : "";
        const optionTarget = creativeOptionTargetIdFromMeta(meta);
        if (!optionTarget || r.phaseId !== phaseId) return false;
        return Boolean(execId) && r.generationExecutionId === execId;
      }
      // Non-fanout: ignore fanout-scoped pins (they belong to parallel leaves).
      if (r.generationFanoutTargetId) return false;
      return r.phaseId === phaseId;
    };

    const byKey =
      stampedKey.length > 0
        ? pins.find(
            (r) =>
              r.artifactKey === stampedKey &&
              pinMatchesIdentity(r),
          )
        : undefined;
    // Prefer exact artifactKey match. Fall back to phase pin only when unique.
    const phaseMatches = pins.filter(pinMatchesIdentity);
    const byPhaseUnique =
      phaseMatches.length === 1 ? phaseMatches[0] : undefined;
    const pin = byKey ?? byPhaseUnique;
    if (!pin) return null;
    return attachFromEstablishedCanonicalPin(pin);
  } catch {
    return null;
  }
}

function assignEstablishedAttachByArtifactKey(
  attach: Record<string, unknown>,
  sinks: {
    presentation: { current: Record<string, unknown> | null };
    packaging: { current: Record<string, unknown> | null };
    social: { current: Record<string, unknown> | null };
  },
): void {
  const key =
    typeof attach.cdfArtifactKey === "string" ? attach.cdfArtifactKey : "";
  if (key.startsWith("presentation.")) {
    sinks.presentation.current = attach;
  } else if (key.startsWith("packaging.")) {
    sinks.packaging.current = attach;
  } else {
    sinks.social.current = attach;
  }
}

type LogFn = (
  event: string,
  fields: {
    requestId?: string;
    executionId?: string;
    organizationId?: string;
    status?: string;
    errorCode?: string;
    [key: string]: unknown;
  },
) => void;

export function metadataRequiresCanonicalProductCompletion(
  meta: Record<string, unknown> | undefined,
): boolean {
  if (!meta) return false;
  // Product deferred_website ZIP/HTML completion is materialization authority —
  // never require image Vault→cdfart ingest for webexport artifacts.
  const outputKind =
    typeof meta.outputKind === "string" ? meta.outputKind.trim() : "";
  if (outputKind === "deferred_website" || outputKind === "website") {
    return false;
  }
  if (
    typeof meta.cdfSessionId !== "string" ||
    !meta.cdfSessionId.trim() ||
    typeof meta.cdfPhaseId !== "string" ||
    !meta.cdfPhaseId.trim()
  ) {
    return false;
  }
  if (
    typeof meta.cdfExecutionStrategy === "string" &&
    meta.cdfExecutionStrategy === "canonical"
  ) {
    return true;
  }
  try {
    const { contractRequiresCanonicalImageIngest } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("../../cdf/generation-artifact") as typeof import("../../cdf/generation-artifact");
    return contractRequiresCanonicalImageIngest(meta) != null;
  } catch {
    return false;
  }
}

/**
 * When to persist presentationEligibility on result/metadata.
 * Image-AV canonical leaves use requiresCanonical; deferred_website uses
 * websiteCanonicalCompletionEstablished (requiresCanonical is intentionally
 * false for websites — do not skip the stamp for that reason).
 */
export function shouldStampPresentationEligibility(
  metadata?: Record<string, unknown> | null,
  resultData?: Record<string, unknown> | null,
): boolean {
  const meta =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : undefined;
  const data =
    resultData && typeof resultData === "object" && !Array.isArray(resultData)
      ? (resultData as Record<string, unknown>)
      : undefined;
  if (metadataRequiresCanonicalProductCompletion(meta)) return true;
  if (meta?.websiteCanonicalCompletionEstablished === true) return true;
  if (data?.websiteCanonicalCompletionEstablished === true) return true;
  try {
    const { isWebsiteGenerationMetadata } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("./execution-thin-path") as typeof import("./execution-thin-path");
    if (isWebsiteGenerationMetadata(meta)) return true;
  } catch {
    // thin-path optional at import time
  }
  return false;
}

function isDeferredWebsiteMeta(
  meta: Record<string, unknown> | undefined,
): boolean {
  if (!meta) return false;
  const kind =
    typeof meta.outputKind === "string" ? meta.outputKind.trim() : "";
  return kind === "deferred_website" || kind === "website";
}

function failureRecord(input: {
  status?: string;
  id?: string;
  reason: string;
  message: string;
}): Record<string, unknown> {
  return {
    cdfRuntimePath: "none",
    cdfValidationStatus: input.status ?? input.reason,
    ...(input.id ? { cdfValidationId: input.id } : {}),
    cdfCanonicalRejected: true,
    cdfFallbackReason: input.reason,
    message: input.message,
  };
}

/**
 * Attempt presentation / packaging / social-media canonical ingest for a
 * successful provider run. Sole ingest implementation for sync + recovered.
 */
export async function applyCdfCanonicalCompletionIngest(input: {
  status: string;
  workingMetadata?: Record<string, unknown>;
  structuredCandidate: unknown;
  mediaArtifactIds: readonly string[];
  executionId: string;
  organizationId: string;
  correlationId?: string;
  workspaceId?: string;
  projectId?: string;
  userId?: string;
  asyncMedia?: AsyncMediaPlatform;
  logOsExecutionEvent: LogFn;
}): Promise<CdfCanonicalIngestAttachResult> {
  let structuredCandidate = input.structuredCandidate;
  let cdfVaultAssetIds: string[] | undefined;
  let canonicalImageBridgeFailure: Record<string, unknown> | null = null;
  /** Observational stamps (composition + structural). */
  let metadataStamps: Record<string, unknown> | undefined;

  const meta = input.workingMetadata;
  const requiresCanonical = metadataRequiresCanonicalProductCompletion(meta);

  if (typeof meta?.cdfSessionId === "string" && meta.cdfSessionId.trim()) {
    try {
      const { ensureCdfSessionLoaded } = await import("../../cdf");
      await ensureCdfSessionLoaded(meta.cdfSessionId.trim());
    } catch {
      // session load best-effort; ingest fails closed if missing
    }
  }

  // Duplicate completion (poll_hydrate ↔ recovered_job): if generated X@V already
  // exists for this session/phase, skip bridge+ingest and return established attach.
  {
    const establishedBeforeBridge =
      resolveEstablishedCanonicalCompletionAttach(meta, input.executionId);
    if (establishedBeforeBridge) {
      const key =
        typeof establishedBeforeBridge.cdfArtifactKey === "string"
          ? establishedBeforeBridge.cdfArtifactKey
          : "";
      const presentationCanonicalAttach = key.startsWith("presentation.")
        ? establishedBeforeBridge
        : null;
      const packagingCanonicalAttach = key.startsWith("packaging.")
        ? establishedBeforeBridge
        : null;
      const socialMediaCanonicalAttach =
        !presentationCanonicalAttach && !packagingCanonicalAttach
          ? establishedBeforeBridge
          : null;
      // Also surface as generic when not a Class-A key (same attach object).
      const genericCanonicalAttach =
        !presentationCanonicalAttach &&
        !packagingCanonicalAttach &&
        !key.startsWith("social-media.")
          ? establishedBeforeBridge
          : null;
      input.logOsExecutionEvent(
        "execution.cdf_canonical_completion.idempotent_replay",
        {
          requestId: input.correlationId,
          executionId: input.executionId,
          organizationId: input.organizationId,
          status: "succeeded",
          errorCode: "established_canonical_completion",
        },
      );
      return {
        structuredCandidate,
        presentationCanonicalAttach,
        presentationIngestFailure: null,
        packagingCanonicalAttach,
        packagingIngestFailure: null,
        socialMediaCanonicalAttach,
        socialMediaIngestFailure: null,
        genericCanonicalAttach,
        genericIngestFailure: null,
        cdfVaultAssetIds,
        productCompletionBlocked: false,
      };
    }
  }

  // Canonical image/video/hybrid: media MUST pass the generic Vault→candidate
  // bridge before any family-specific canonical adapter. Text envelopes and
  // leftover structured prose must never skip this path.
  // Product deferred_website exports (art_webexport_*) are NOT image subjects.
  if (
    input.status === "succeeded" &&
    input.mediaArtifactIds.length > 0 &&
    typeof meta?.cdfSessionId === "string" &&
    typeof meta?.cdfPhaseId === "string" &&
    !isDeferredWebsiteMeta(meta)
  ) {
    try {
      const {
        contractRequiresCanonicalImageIngest,
        buildCanonicalImageIngestCandidate,
        promoteExecutionMediaArtifactToVaultAsset,
      } = await import("../../cdf/generation-artifact");
      const { isVaultAssetObjectIdShape } = await import(
        "../../cdf/artifacts/ids"
      );
      const imageContract = contractRequiresCanonicalImageIngest(meta);
      const alreadyVaultSeeded = (() => {
        if (
          !structuredCandidate ||
          typeof structuredCandidate !== "object" ||
          Array.isArray(structuredCandidate)
        ) {
          return false;
        }
        const ref = (structuredCandidate as Record<string, unknown>)
          .previewAssetRef;
        if (!ref || typeof ref !== "object" || Array.isArray(ref)) return false;
        const vaultId = (ref as Record<string, unknown>).vaultAssetId;
        return (
          typeof vaultId === "string" && isVaultAssetObjectIdShape(vaultId.trim())
        );
      })();
      if (imageContract && !alreadyVaultSeeded) {
        if (!input.asyncMedia) {
          canonicalImageBridgeFailure = failureRecord({
            status: "vault_promote_unavailable",
            reason: "async_media_required_for_canonical_media_bridge",
            message:
              "Canonical media bridge requires Vault promotion (async media platform)",
          });
          input.logOsExecutionEvent(
            "execution.cdf_canonical_image_bridge.failed",
            {
              requestId: input.correlationId,
              executionId: input.executionId,
              organizationId: input.organizationId,
              status: "failed",
              errorCode: "async_media_required_for_canonical_media_bridge",
            },
          );
        } else {
          // Deterministic composition bridge: provider visual → composed final
          // BEFORE raw art_* becomes the canonical preview subject.
          let mediaArtifactIdForPromote = input.mediaArtifactIds[0]!;
          let compositionEnrich:
            | ((base: Record<string, unknown>) => Record<string, unknown>)
            | null = null;
          try {
            const { tryDeterministicCompositionCanonicalBridge } = await import(
              "../../cdf/deterministic-composition/canonical-composition-bridge"
            );
            const compositionBridge =
              await tryDeterministicCompositionCanonicalBridge({
                metadata: meta as Record<string, unknown> | undefined,
                mediaArtifactId: mediaArtifactIdForPromote,
                executionId: input.executionId,
                organizationId: input.organizationId,
                userId: input.userId,
                asyncMedia: input.asyncMedia,
              });
            if (compositionBridge.applied && !compositionBridge.ok) {
              metadataStamps = {
                ...(metadataStamps ?? {}),
                ...compositionBridge.metadataStamps,
              };
              if (meta) {
                Object.assign(meta, compositionBridge.metadataStamps);
              }
              input.logOsExecutionEvent(
                "execution.cdf_deterministic_composition.failed",
                {
                  requestId: input.correlationId,
                  executionId: input.executionId,
                  organizationId: input.organizationId,
                  status: "warning",
                  errorCode: compositionBridge.reason,
                },
              );
              // Observational quality plane: stamp diagnostics and CONTINUE with
              // raw provider media → canonical ArtifactVersion. Do NOT hard-gate
              // usable creatives on missing brand-mark bytes / composition fail.
              metadataStamps = {
                ...(metadataStamps ?? {}),
                ...compositionBridge.metadataStamps,
                cdfStructuralComplianceStatus:
                  compositionBridge.outcome === "AUTHORITY_INVALID"
                    ? "UNVERIFIABLE"
                    : "NON_COMPLIANT",
                cdfCompositionOutcome: "COMPOSITION_FAILED",
                cdfCompositionFailureReason: compositionBridge.reason,
              };
              if (meta) {
                Object.assign(meta, metadataStamps);
              }
            } else if (compositionBridge.applied && compositionBridge.ok) {
              mediaArtifactIdForPromote = compositionBridge.mediaArtifactId;
              compositionEnrich = compositionBridge.enrichCandidate;
              metadataStamps = {
                ...(metadataStamps ?? {}),
                ...compositionBridge.metadataStamps,
              };
              if (meta) {
                Object.assign(meta, compositionBridge.metadataStamps);
              }
              input.logOsExecutionEvent(
                "execution.cdf_deterministic_composition.succeeded",
                {
                  requestId: input.correlationId,
                  executionId: input.executionId,
                  organizationId: input.organizationId,
                  status: "succeeded",
                },
              );
              const { logCdfAssetByteLifecycle } = await import(
                "../../cdf/diagnostics/asset-byte-lifecycle-log"
              );
              logCdfAssetByteLifecycle({
                boundary: "ingest.after_composition_succeeded",
                executionId: input.executionId,
                rawArtifactId: input.mediaArtifactIds[0] ?? null,
                compositionInputRef: input.mediaArtifactIds[0] ?? null,
                compositionOutputRef: compositionBridge.mediaArtifactId,
                mediaArtifactId: compositionBridge.mediaArtifactId,
                vaultAssetId: compositionBridge.vaultAssetId,
                previewAssetRef: compositionBridge.vaultAssetId,
                tenantScope: {
                  organizationId: input.organizationId,
                  projectId:
                    typeof input.projectId === "string"
                      ? input.projectId
                      : null,
                },
                referenceExists: true,
                referenceResolves: true,
                bytesExist: true,
                finalizedArtifactId: compositionBridge.mediaArtifactId,
                promotedVaultAssetId: compositionBridge.vaultAssetId,
                mediaFileId: compositionBridge.vaultAssetId,
                resolverResult: "composition_succeeded_with_promoted_vault",
              });
            }
          } catch (compErr) {
            // Composition exception is observational — stamp UNVERIFIABLE and
            // continue raw provider media toward canonical ArtifactVersion.
            const msg =
              compErr instanceof Error ? compErr.message : String(compErr);
            metadataStamps = {
              ...(metadataStamps ?? {}),
              cdfCompositionOutcome: "COMPOSITION_FAILED",
              cdfCompositionFailureReason: "composition_bridge_exception",
              cdfStructuralComplianceStatus: "UNVERIFIABLE",
              cdfStructuralCompliance: {
                status: "UNVERIFIABLE",
                reason: "composition_bridge_exception",
                message: msg.slice(0, 200),
              },
            };
            if (meta) {
              Object.assign(meta, metadataStamps);
            }
            input.logOsExecutionEvent(
              "execution.cdf_deterministic_composition.failed",
              {
                requestId: input.correlationId,
                executionId: input.executionId,
                organizationId: input.organizationId,
                status: "warning",
                errorCode: "composition_bridge_exception",
              },
            );
          }

          if (!canonicalImageBridgeFailure) {
          const promoted = await promoteExecutionMediaArtifactToVaultAsset({
            mediaArtifactId: mediaArtifactIdForPromote,
            organizationId: input.organizationId,
            executionId: input.executionId,
            userId: input.userId,
            asyncMedia: input.asyncMedia,
          });
          if (!promoted.ok) {
            // Composed path may already have a vault id via in-process map.
            const g = globalThis as typeof globalThis & {
              __cdfVaultPromoteMap?: Map<string, string>;
            };
            const mapped = g.__cdfVaultPromoteMap?.get(mediaArtifactIdForPromote);
            if (mapped && compositionEnrich) {
              const built = buildCanonicalImageIngestCandidate({
                contract: imageContract,
                vaultAssetId: mapped,
              });
              if (!("ok" in built)) {
                structuredCandidate = compositionEnrich(built.rawOutput);
                cdfVaultAssetIds = built.vaultAssetIds;
                input.logOsExecutionEvent(
                  "execution.cdf_canonical_image_bridge.succeeded",
                  {
                    requestId: input.correlationId,
                    executionId: input.executionId,
                    organizationId: input.organizationId,
                    status: "succeeded",
                  },
                );
              }
            } else {
            canonicalImageBridgeFailure = failureRecord({
              status: "vault_promote_failed",
              reason: promoted.reason,
              message: `Canonical image bridge could not promote execution media to Vault: ${promoted.reason}`,
            });
            input.logOsExecutionEvent(
              "execution.cdf_canonical_image_bridge.failed",
              {
                requestId: input.correlationId,
                executionId: input.executionId,
                organizationId: input.organizationId,
                status: "failed",
                errorCode: promoted.reason,
              },
            );
            }
          } else {
            const built = buildCanonicalImageIngestCandidate({
              contract: imageContract,
              vaultAssetId: promoted.vaultAssetId,
            });
            if ("ok" in built && built.ok === false) {
              canonicalImageBridgeFailure = failureRecord({
                status: "candidate_build_failed",
                reason: built.reason,
                message: `Canonical image candidate build failed: ${built.reason}`,
              });
            } else if (!("ok" in built)) {
              // Generic media candidate is the authoritative media→structure seed.
              // Family adapters may enrich/validate — never invent from raw raster first.
              structuredCandidate = compositionEnrich
                ? compositionEnrich(built.rawOutput)
                : built.rawOutput;
              cdfVaultAssetIds = built.vaultAssetIds;
              input.logOsExecutionEvent(
                "execution.cdf_canonical_image_bridge.succeeded",
                {
                  requestId: input.correlationId,
                  executionId: input.executionId,
                  organizationId: input.organizationId,
                  status: "succeeded",
                },
              );
            }
          }
          } // end !canonicalImageBridgeFailure
        }
      } else if (imageContract && alreadyVaultSeeded) {
        const ref = (structuredCandidate as Record<string, unknown>)
          .previewAssetRef as Record<string, unknown>;
        const vaultId = String(ref.vaultAssetId).trim();
        cdfVaultAssetIds = cdfVaultAssetIds?.length
          ? cdfVaultAssetIds
          : [vaultId];
      }
    } catch (bridgeErr) {
      const msg =
        bridgeErr instanceof Error ? bridgeErr.message : String(bridgeErr);
      canonicalImageBridgeFailure = failureRecord({
        status: "bridge_exception",
        reason: "canonical_image_bridge_exception",
        message: msg,
      });
      input.logOsExecutionEvent("execution.cdf_canonical_image_bridge.failed", {
        requestId: input.correlationId,
        executionId: input.executionId,
        organizationId: input.organizationId,
        status: "skipped",
        errorCode: msg,
      });
    }
  }

  let presentationCanonicalAttach: Record<string, unknown> | null = null;
  let presentationIngestFailure: Record<string, unknown> | null = null;
  let packagingCanonicalAttach: Record<string, unknown> | null = null;
  let packagingIngestFailure: Record<string, unknown> | null = null;
  let socialMediaCanonicalAttach: Record<string, unknown> | null = null;
  let socialMediaIngestFailure: Record<string, unknown> | null =
    canonicalImageBridgeFailure;
  let genericCanonicalAttach: Record<string, unknown> | null = null;
  let genericIngestFailure: Record<string, unknown> | null = null;

  const empty = (): CdfCanonicalIngestAttachResult => ({
    structuredCandidate,
    presentationCanonicalAttach,
    presentationIngestFailure,
    packagingCanonicalAttach,
    packagingIngestFailure,
    socialMediaCanonicalAttach,
    socialMediaIngestFailure,
    genericCanonicalAttach,
    genericIngestFailure,
    cdfVaultAssetIds,
    productCompletionBlocked: false,
    ...(metadataStamps ? { metadataStamps } : {}),
  });

  const stampStructuralDiagnostics = async (inputStamp: {
    structural: import("../../cdf/generation-validation/structural-composition-validation").StructuralValidationResult;
    evidence: import("../../cdf/generation-validation/structural-composition-validation").StructuralArtifactEvidence;
    requiresRenderedTextProof?: boolean;
    gateException?: boolean;
  }): Promise<void> => {
    if (!meta) return;
    const {
      buildStructuralVerificationDiagnostics,
      structuralVerificationMetadataStamps,
    } = await import(
      "../../cdf/generation-validation/structural-composition-validation"
    );
    const diagnostics = buildStructuralVerificationDiagnostics({
      structural: inputStamp.structural,
      evidence: inputStamp.evidence,
      executionId: input.executionId,
      providerId: meta.preferredProviderId ?? meta.actualProviderId,
      modelId: meta.preferredModelId ?? meta.actualModelId,
      requiresRenderedTextProof: inputStamp.requiresRenderedTextProof,
      gateException: inputStamp.gateException,
    });
    const stamps = structuralVerificationMetadataStamps(diagnostics);
    (meta as Record<string, unknown>).cdfStructuralComplianceStatus =
      stamps.cdfStructuralComplianceStatus;
    (meta as Record<string, unknown>).cdfStructuralCompliance =
      stamps.cdfStructuralCompliance;
    metadataStamps = stamps;
  };

  const attachSinks = {
    presentation: {
      get current() {
        return presentationCanonicalAttach;
      },
      set current(v: Record<string, unknown> | null) {
        presentationCanonicalAttach = v;
      },
    },
    packaging: {
      get current() {
        return packagingCanonicalAttach;
      },
      set current(v: Record<string, unknown> | null) {
        packagingCanonicalAttach = v;
      },
    },
    social: {
      get current() {
        return socialMediaCanonicalAttach;
      },
      set current(v: Record<string, unknown> | null) {
        socialMediaCanonicalAttach = v;
      },
    },
  };

  // Race fallback: concurrent path may have bound between our pre-bridge check
  // and now (still no attach from this attempt).
  const establishedUpFront = resolveEstablishedCanonicalCompletionAttach(meta, input.executionId);
  if (establishedUpFront) {
    assignEstablishedAttachByArtifactKey(establishedUpFront, {
      presentation: attachSinks.presentation,
      packaging: attachSinks.packaging,
      social: attachSinks.social,
    });
    input.logOsExecutionEvent("execution.cdf_canonical_completion.idempotent_replay", {
      requestId: input.correlationId,
      executionId: input.executionId,
      organizationId: input.organizationId,
      status: "succeeded",
      errorCode: "established_canonical_completion",
    });
    return empty();
  }

  if (
    typeof meta?.cdfSessionId !== "string" ||
    typeof meta?.cdfPhaseId !== "string"
  ) {
    return empty();
  }

  if (structuredCandidate == null) {
    const recoveredMissingCandidate =
      resolveEstablishedCanonicalCompletionAttach(meta, input.executionId);
    if (recoveredMissingCandidate) {
      assignEstablishedAttachByArtifactKey(recoveredMissingCandidate, {
        presentation: attachSinks.presentation,
        packaging: attachSinks.packaging,
        social: attachSinks.social,
      });
      return empty();
    }
    if (requiresCanonical && input.status === "succeeded") {
      const reason =
        (canonicalImageBridgeFailure?.cdfFallbackReason as string) ||
        "canonical_artifact_missing";
      return {
        ...empty(),
        socialMediaIngestFailure:
          socialMediaIngestFailure ??
          failureRecord({
            reason,
            message:
              "Canonical CDF phase completed provider work without a structured/canonical artifact candidate",
          }),
        productCompletionBlocked: true,
        productCompletionBlockReason: reason,
      };
    }
    return empty();
  }

  // Composition / image-bridge failure is authoritative rejection.
  // Never fall through to ArtifactVersion / M9C / completion while raw media
  // candidate still exists for diagnostic preview.
  if (canonicalImageBridgeFailure) {
    const reason =
      (canonicalImageBridgeFailure.cdfFallbackReason as string) ||
      (canonicalImageBridgeFailure.reason as string) ||
      "composition_failed";
    return {
      ...empty(),
      socialMediaIngestFailure: canonicalImageBridgeFailure,
      metadataStamps: {
        ...(metadataStamps ?? {}),
        cdfCanonicalRejected: true,
        cdfFallbackReason: reason,
        productCompletionBlocked: true,
        productCompletionBlockReason: reason,
      },
      productCompletionBlocked: true,
      productCompletionBlockReason: reason,
    };
  }

  // Structural composition verification — observational quality plane.
  // NON_COMPLIANT / UNVERIFIABLE / missing brand-mark bytes stamp diagnostics
  // but MUST NOT block ArtifactVersion / M9C when provider media persisted.
  {
    const serviceId =
      typeof meta?.cdfServiceId === "string" ? meta.cdfServiceId : "";
    const phaseId = typeof meta?.cdfPhaseId === "string" ? meta.cdfPhaseId : "";
    if (serviceId && phaseId) {
      try {
        const { resolveDeliverableCompositionForPhase } = await import(
          "../../cdf/generation-context/resolve-deliverable-composition"
        );
        const {
          evaluateStructuralCompositionCompliance,
          extractStructuralEvidenceFromCandidate,
          expectedTextsFromExecutionMetadata,
        } = await import(
          "../../cdf/generation-validation/structural-composition-validation"
        );
        const { deriveVisualVerificationRequirements } = await import(
          "../../cdf/generation-validation/visual-verification-requirements"
        );
        const { produceRenderedTextProof } = await import(
          "../../cdf/generation-validation/rendered-text-proof"
        );

        const resolved = resolveDeliverableCompositionForPhase({
          serviceId,
          phaseId,
          service: typeof meta?.service === "string" ? meta.service : null,
          subtype: typeof meta?.subtype === "string" ? meta.subtype : null,
          productKey:
            typeof meta?.productKey === "string"
              ? meta.productKey
              : typeof meta?.productPath === "string"
                ? meta.productPath
                : null,
        });

        if (resolved.required && !resolved.contract) {
          const reason = "structural_composition_contract_missing";
          input.logOsExecutionEvent(
            "execution.cdf_structural_compliance.failed",
            {
              requestId: input.correlationId,
              executionId: input.executionId,
              organizationId: input.organizationId,
              status: "warning",
              errorCode: reason,
            },
          );
          metadataStamps = {
            ...(metadataStamps ?? {}),
            cdfStructuralComplianceStatus: "UNVERIFIABLE",
            cdfStructuralCompliance: {
              status: "UNVERIFIABLE",
              reason,
              message:
                "Deliverable composition is required but no composition contract resolved",
            },
          };
          if (meta) {
            (meta as Record<string, unknown>).cdfStructuralComplianceStatus =
              "UNVERIFIABLE";
          }
          // Observational — continue toward canonical ArtifactVersion.
        }

        if (resolved.contract) {
          const evidence = extractStructuralEvidenceFromCandidate(
            structuredCandidate,
          );
          const expectedFromMeta = expectedTextsFromExecutionMetadata(meta);
          const evidenceWithExpected =
            expectedFromMeta.length > 0
              ? {
                  ...evidence,
                  expectedRenderedTexts: [
                    ...(evidence.expectedRenderedTexts ?? []),
                    ...expectedFromMeta,
                  ],
                }
              : evidence;
          const vreqs = deriveVisualVerificationRequirements(resolved.contract);
          const vaultId =
            evidenceWithExpected.hasPreviewAsset &&
            structuredCandidate &&
            typeof structuredCandidate === "object" &&
            (structuredCandidate as Record<string, unknown>).previewAssetRef &&
            typeof (
              (structuredCandidate as Record<string, unknown>)
                .previewAssetRef as Record<string, unknown>
            ).vaultAssetId === "string"
              ? String(
                  (
                    (structuredCandidate as Record<string, unknown>)
                      .previewAssetRef as Record<string, unknown>
                  ).vaultAssetId,
                )
              : undefined;

          let evidenceFinal = evidenceWithExpected;
          try {
            const { logCdfAssetByteLifecycle } = await import(
              "../../cdf/diagnostics/asset-byte-lifecycle-log"
            );
            logCdfAssetByteLifecycle({
              boundary: "ingest.before_produceRenderedTextProof",
              executionId: input.executionId,
              rawArtifactId: input.mediaArtifactIds?.[0] ?? null,
              previewAssetRef: vaultId ?? null,
              vaultAssetId: vaultId ?? null,
              tenantScope: {
                organizationId: input.organizationId,
                projectId:
                  typeof input.projectId === "string" ? input.projectId : null,
              },
              referenceExists: Boolean(vaultId),
              referenceResolves: false,
              bytesExist: false,
              resolverResult: vaultId
                ? "passing_previewAssetRef.vaultAssetId_to_ocr"
                : "no_vault_id_on_candidate",
              extra: {
                hasPreviewAsset: evidenceWithExpected.hasPreviewAsset === true,
                isFinalComposedDeliverable:
                  structuredCandidate &&
                  typeof structuredCandidate === "object" &&
                  (structuredCandidate as Record<string, unknown>)
                    .isFinalComposedDeliverable === true,
              },
            });
            const produced = await produceRenderedTextProof({
              artifactRef: vaultId
                ? {
                    vaultAssetId: vaultId,
                    organizationId: input.organizationId,
                    projectId:
                      typeof input.projectId === "string"
                        ? input.projectId
                        : undefined,
                  }
                : undefined,
            });
            logCdfAssetByteLifecycle({
              boundary: "ingest.after_produceRenderedTextProof",
              executionId: input.executionId,
              previewAssetRef: vaultId ?? null,
              vaultAssetId: vaultId ?? null,
              tenantScope: {
                organizationId: input.organizationId,
                projectId:
                  typeof input.projectId === "string" ? input.projectId : null,
              },
              referenceExists: Boolean(vaultId),
              referenceResolves: produced?.outcome === "ok",
              bytesExist: produced?.outcome === "ok",
              resolverResult: produced
                ? `${produced.outcome}:${produced.failureReason ?? "ok"}`
                : "null_proof",
            });
            if (produced) {
              evidenceFinal = {
                ...evidenceWithExpected,
                renderedTextProof: produced,
              };
            }
          } catch (proofErr) {
            // Convert producer infrastructure failure into structured evidence;
            // acceptance policy decides block vs hold — do not skip the gate.
            evidenceFinal = {
              ...evidenceWithExpected,
              renderedTextProof: {
                extractedText: null,
                source: "ocr",
                outcome: "error",
                failureReason:
                  proofErr instanceof Error
                    ? proofErr.message.slice(0, 200)
                    : "rendered_text_proof_threw",
              },
            };
          }

          const structural = evaluateStructuralCompositionCompliance({
            contract: resolved.contract,
            evidence: evidenceFinal,
            verificationRequirements: vreqs,
          });
          await stampStructuralDiagnostics({
            structural,
            evidence: evidenceFinal,
            requiresRenderedTextProof: vreqs?.requiresRenderedTextProof ?? false,
          });
          // Observational quality plane: blocking structural flags stamp
          // diagnostics and log warning — do NOT withhold ArtifactVersion / M9C
          // when provider media already persisted successfully.
          if (structural.blocksCanonicalCompletion) {
            const reason =
              structural.failedRequirements.join(",") ||
              "structural_compliance_failed";
            input.logOsExecutionEvent(
              "execution.cdf_structural_compliance.warning",
              {
                requestId: input.correlationId,
                executionId: input.executionId,
                organizationId: input.organizationId,
                status: structural.status,
                errorCode: reason,
              },
            );
            metadataStamps = {
              ...(metadataStamps ?? {}),
              cdfStructuralComplianceStatus: structural.status,
              cdfCompositionFailureReason: reason,
            };
            if (meta) {
              Object.assign(meta, {
                cdfStructuralComplianceStatus: structural.status,
              });
            }
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        input.logOsExecutionEvent(
          "execution.cdf_structural_compliance.failed",
          {
            requestId: input.correlationId,
            executionId: input.executionId,
            organizationId: input.organizationId,
            status: "warning",
            errorCode: errMsg,
          },
        );
        // Verification exception: re-evaluate with error evidence. Blocking
        // acceptance must NOT fall through to ArtifactVersion / M9C / approval.
        // Optional non-blocking UNVERIFIABLE may continue; required/unknown fails closed.
        try {
          const { resolveDeliverableCompositionForPhase } = await import(
            "../../cdf/generation-context/resolve-deliverable-composition"
          );
          const {
            evaluateStructuralCompositionCompliance,
          } = await import(
            "../../cdf/generation-validation/structural-composition-validation"
          );
          const { deriveVisualVerificationRequirements } = await import(
            "../../cdf/generation-validation/visual-verification-requirements"
          );
          const resolved = resolveDeliverableCompositionForPhase({
            serviceId,
            phaseId,
            service: typeof meta?.service === "string" ? meta.service : null,
            subtype: typeof meta?.subtype === "string" ? meta.subtype : null,
            productKey:
              typeof meta?.productKey === "string"
                ? meta.productKey
                : typeof meta?.productPath === "string"
                  ? meta.productPath
                  : null,
          });
          if (resolved.contract) {
            const vreqs = deriveVisualVerificationRequirements(
              resolved.contract,
            );
            const {
              expectedTextsFromExecutionMetadata,
            } = await import(
              "../../cdf/generation-validation/structural-composition-validation"
            );
            const expectedFromMeta = expectedTextsFromExecutionMetadata(meta);
            const structural = evaluateStructuralCompositionCompliance({
              contract: resolved.contract,
              evidence: {
                renderedTextProof: {
                  extractedText: null,
                  source: "ocr",
                  outcome: "error",
                  failureReason: errMsg.slice(0, 200),
                },
                ...(expectedFromMeta.length > 0
                  ? { expectedRenderedTexts: expectedFromMeta }
                  : {}),
              },
              verificationRequirements: vreqs,
            });
            await stampStructuralDiagnostics({
              structural,
              evidence: {
                renderedTextProof: {
                  extractedText: null,
                  source: "ocr",
                  outcome: "error",
                  failureReason: errMsg.slice(0, 200),
                },
                ...(expectedFromMeta.length > 0
                  ? { expectedRenderedTexts: expectedFromMeta }
                  : {}),
              },
              requiresRenderedTextProof: vreqs?.requiresRenderedTextProof ?? false,
              gateException: true,
            });
            if (structural.blocksCanonicalCompletion) {
              const reason =
                structural.failedRequirements.join(",") ||
                "structural_compliance_verification_exception";
              input.logOsExecutionEvent(
                "execution.cdf_structural_compliance.warning",
                {
                  requestId: input.correlationId,
                  executionId: input.executionId,
                  organizationId: input.organizationId,
                  status: structural.status,
                  errorCode: reason,
                },
              );
              metadataStamps = {
                ...(metadataStamps ?? {}),
                cdfStructuralComplianceStatus: structural.status,
                cdfCompositionFailureReason: reason,
              };
              if (meta) {
                Object.assign(meta, {
                  cdfStructuralComplianceStatus: structural.status,
                });
              }
              // Observational — continue ingest with provider media.
            }
          } else if (resolved.required) {
            const reason = "structural_compliance_verification_exception";
            metadataStamps = {
              ...(metadataStamps ?? {}),
              cdfStructuralComplianceStatus: "UNVERIFIABLE",
              cdfStructuralCompliance: {
                status: "UNVERIFIABLE",
                reason,
                message: errMsg.slice(0, 200),
              },
            };
            if (meta) {
              Object.assign(meta, metadataStamps);
            }
            // Observational — continue ingest.
          } else {
            metadataStamps = {
              ...(metadataStamps ?? {}),
              cdfStructuralComplianceStatus: "UNVERIFIABLE",
              cdfStructuralCompliance: {
                status: "UNVERIFIABLE",
                reason: "structural_compliance_verification_exception",
                message: errMsg.slice(0, 200),
              },
            };
            if (meta) {
              (meta as Record<string, unknown>).cdfStructuralComplianceStatus =
                "UNVERIFIABLE";
            }
          }
        } catch {
          const reason = "structural_compliance_verification_exception";
          return {
            ...empty(),
            metadataStamps: {
              ...(metadataStamps ?? {}),
              cdfStructuralComplianceStatus: "UNVERIFIABLE",
              cdfStructuralCompliance: {
                status: "UNVERIFIABLE",
                reason,
                message: errMsg.slice(0, 200),
              },
              cdfCanonicalRejected: true,
              cdfFallbackReason: reason,
              productCompletionBlocked: true,
              productCompletionBlockReason: reason,
            },
            productCompletionBlocked: true,
            productCompletionBlockReason: reason,
          };
        }
      }
    }
  }

  // ONE generic canonical ingest boundary — dispatches by CDF service family.
  // Env ingest flags only apply to non-contract traffic; canonical strategy forces ingest.
  try {
    const { tryIngestCanonicalCdfCompletion } = await import(
      "../../cdf/canonical-ingest/try-ingest-canonical"
    );
    const { contractRequiresCanonicalImageIngest } = await import(
      "../../cdf/generation-artifact"
    );
    const forceCanonicalIngest =
      contractRequiresCanonicalImageIngest(meta) != null ||
      (typeof meta?.cdfExecutionStrategy === "string" &&
        meta.cdfExecutionStrategy === "canonical");
    const ingested = tryIngestCanonicalCdfCompletion({
      metadata: meta,
      rawOutput: structuredCandidate,
      executionId: input.executionId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      userId: input.userId,
      vaultAssetIds: cdfVaultAssetIds,
      forceOptIn: forceCanonicalIngest,
    });

    if (ingested?.kind === "accepted" && ingested.attach) {
      if (ingested.family === "presentation") {
        presentationCanonicalAttach = ingested.attach;
      } else if (ingested.family === "packaging") {
        packagingCanonicalAttach = ingested.attach;
      } else if (ingested.family === "social-media") {
        const { bindSocialMediaGeneratedFromAttach } = await import(
          "../../cdf/social-media-runtime"
        );
        const sessionIdMeta = meta?.cdfSessionId;
        const phaseIdMeta = meta?.cdfPhaseId;
        let m9cBoundOk = false;
        if (
          typeof sessionIdMeta === "string" &&
          sessionIdMeta.trim() &&
          typeof phaseIdMeta === "string" &&
          phaseIdMeta.trim()
        ) {
          try {
            const bound = bindSocialMediaGeneratedFromAttach({
              sessionId: sessionIdMeta.trim(),
              phaseId: phaseIdMeta.trim(),
              attach: {
                cdfArtifactId: String(ingested.attach.cdfArtifactId),
                cdfArtifactVersion: Number(ingested.attach.cdfArtifactVersion),
                cdfArtifactKey: String(ingested.attach.cdfArtifactKey ?? ""),
              },
              organizationId: input.organizationId,
              projectId: input.projectId,
              generationFanoutGroupId:
                typeof meta?.generationFanoutGroupId === "string"
                  ? meta.generationFanoutGroupId.trim()
                  : undefined,
              generationFanoutTargetId:
                typeof meta?.generationFanoutTargetId === "string"
                  ? meta.generationFanoutTargetId.trim()
                  : undefined,
              generationExecutionId: input.executionId,
              generationFanoutLeaf:
                meta?.generationFanoutLeaf === true ||
                (typeof meta?.generationFanoutGroupId === "string" &&
                  Boolean(meta.generationFanoutGroupId.trim())) ||
                (typeof meta?.generationFanoutTargetId === "string" &&
                  Boolean(meta.generationFanoutTargetId.trim())) ||
                undefined,
            });
            if (bound.ok) {
              m9cBoundOk = true;
              try {
                const { persistCdfSession } = await import("../../cdf");
                await persistCdfSession(bound.session);
              } catch (persistErr) {
                m9cBoundOk = false;
                socialMediaIngestFailure = failureRecord({
                  status: "session_bind_failed",
                  reason: "m9c_bind_durability_failed",
                  message: `M9C session bind durability failed: ${
                    persistErr instanceof Error
                      ? persistErr.message
                      : String(persistErr)
                  }`,
                });
              }
              if (m9cBoundOk) {
                input.logOsExecutionEvent(
                  "execution.cdf_social_media_session_bind.succeeded",
                  {
                    requestId: input.correlationId,
                    executionId: input.executionId,
                    organizationId: input.organizationId,
                    status: "succeeded",
                  },
                );
              }
            } else {
              socialMediaIngestFailure = failureRecord({
                status: "session_bind_failed",
                reason: `m9c_bind_${bound.code}`,
                message: `M9C session bind failed: ${bound.message}`,
              });
            }
          } catch (bindErr) {
            socialMediaIngestFailure = failureRecord({
              status: "session_bind_failed",
              reason: "m9c_bind_exception",
              message: `M9C session bind exception: ${
                bindErr instanceof Error ? bindErr.message : String(bindErr)
              }`,
            });
          }
        } else {
          socialMediaIngestFailure = failureRecord({
            status: "session_bind_failed",
            reason: "m9c_bind_missing_session_or_phase",
            message:
              "M9C session bind requires cdfSessionId and cdfPhaseId in metadata",
          });
        }
        if (m9cBoundOk) {
          socialMediaCanonicalAttach = ingested.attach;
        }
      } else if (ingested.family === "generic") {
        // Generic contract ingest already binds generatedArtifacts inside
        // tryIngestContractCanonicalCompletion — surface the attach.
        genericCanonicalAttach = ingested.attach;
      }
    } else if (
      ingested &&
      ingested.kind !== "skipped_not_applicable" &&
      ingested.kind !== "opt_in_disabled"
    ) {
      const recoveredAfterConflict =
        resolveEstablishedCanonicalCompletionAttach(meta, input.executionId);
      if (recoveredAfterConflict) {
        assignEstablishedAttachByArtifactKey(recoveredAfterConflict, {
          presentation: attachSinks.presentation,
          packaging: attachSinks.packaging,
          social: attachSinks.social,
        });
        const recoveredKey =
          typeof recoveredAfterConflict.cdfArtifactKey === "string"
            ? recoveredAfterConflict.cdfArtifactKey
            : "";
        if (
          !recoveredKey.startsWith("presentation.") &&
          !recoveredKey.startsWith("packaging.") &&
          !recoveredKey.startsWith("social-media.")
        ) {
          genericCanonicalAttach = recoveredAfterConflict;
        }
        input.logOsExecutionEvent(
          "execution.cdf_canonical_completion.idempotent_replay",
          {
            requestId: input.correlationId,
            executionId: input.executionId,
            organizationId: input.organizationId,
            status: "succeeded",
            errorCode: "ingest_conflict_established_completion",
          },
        );
      } else {
        const failRec = failureRecord({
          status: ingested.cdfValidationStatus ?? ingested.kind,
          id: ingested.cdfValidationId,
          reason: ingested.fallbackReason ?? ingested.kind,
          message: ingested.message ?? ingested.kind,
        });
        if (ingested.family === "presentation") {
          presentationIngestFailure = failRec;
        } else if (ingested.family === "packaging") {
          packagingIngestFailure = failRec;
        } else if (ingested.family === "social-media") {
          socialMediaIngestFailure = failRec;
        } else if (ingested.family === "generic") {
          genericIngestFailure = failRec;
        } else if (
          forceCanonicalIngest ||
          ingested.kind === "adapter_unavailable"
        ) {
          // Canonical services without deep adapters: block product completion.
          socialMediaIngestFailure = failRec;
          packagingIngestFailure = failRec;
          presentationIngestFailure = failRec;
          genericIngestFailure = failRec;
          if (requiresCanonical && input.status === "succeeded") {
            return {
              ...empty(),
              socialMediaIngestFailure: failRec,
              packagingIngestFailure: failRec,
              presentationIngestFailure: failRec,
              genericIngestFailure: failRec,
              productCompletionBlocked: true,
              productCompletionBlockReason:
                ingested.fallbackReason ?? "deep_ingest_adapter_missing",
              metadataStamps,
            };
          }
        }
        input.logOsExecutionEvent("execution.cdf_canonical_ingest.rejected", {
          requestId: input.correlationId,
          executionId: input.executionId,
          organizationId: input.organizationId,
          status: "failed",
          errorCode: ingested.fallbackReason ?? ingested.kind,
        });
      }
    }
  } catch (err) {
    input.logOsExecutionEvent("execution.cdf_canonical_ingest.failed", {
      requestId: input.correlationId,
      executionId: input.executionId,
      organizationId: input.organizationId,
      status: "skipped",
      errorCode: err instanceof Error ? err.message : String(err),
    });
  }

  let anyAttach =
    presentationCanonicalAttach != null ||
    packagingCanonicalAttach != null ||
    socialMediaCanonicalAttach != null ||
    genericCanonicalAttach != null;

  // Last-chance recovery: concurrent poll_hydrate may have bound generatedArtifacts
  // while this recovered_job path hit an idempotency conflict.
  if (!anyAttach) {
    const recovered = resolveEstablishedCanonicalCompletionAttach(meta, input.executionId);
    if (recovered) {
      assignEstablishedAttachByArtifactKey(recovered, {
        presentation: attachSinks.presentation,
        packaging: attachSinks.packaging,
        social: attachSinks.social,
      });
      const recoveredKey =
        typeof recovered.cdfArtifactKey === "string"
          ? recovered.cdfArtifactKey
          : "";
      if (
        !recoveredKey.startsWith("presentation.") &&
        !recoveredKey.startsWith("packaging.") &&
        !recoveredKey.startsWith("social-media.")
      ) {
        genericCanonicalAttach = recovered;
      }
      anyAttach = true;
      socialMediaIngestFailure = null;
      packagingIngestFailure = null;
      presentationIngestFailure = null;
      genericIngestFailure = null;
      input.logOsExecutionEvent(
        "execution.cdf_canonical_completion.idempotent_replay",
        {
          requestId: input.correlationId,
          executionId: input.executionId,
          organizationId: input.organizationId,
          status: "succeeded",
          errorCode: "recovered_established_canonical_completion",
        },
      );
    }
  }

  let productCompletionBlocked = false;
  let productCompletionBlockReason: string | undefined;
  if (requiresCanonical && input.status === "succeeded" && !anyAttach) {
    productCompletionBlocked = true;
    productCompletionBlockReason =
      (socialMediaIngestFailure?.cdfFallbackReason as string) ||
      (packagingIngestFailure?.cdfFallbackReason as string) ||
      (presentationIngestFailure?.cdfFallbackReason as string) ||
      (genericIngestFailure?.cdfFallbackReason as string) ||
      "canonical_artifact_or_bind_missing";
  }

  return {
    structuredCandidate,
    presentationCanonicalAttach,
    presentationIngestFailure,
    packagingCanonicalAttach,
    packagingIngestFailure,
    socialMediaCanonicalAttach,
    socialMediaIngestFailure,
    genericCanonicalAttach,
    genericIngestFailure,
    cdfVaultAssetIds,
    productCompletionBlocked,
    productCompletionBlockReason,
    ...(metadataStamps ? { metadataStamps } : {}),
  };
}

/** True when any family attach survived ingest (Class-A or generic). */
export function cdfCanonicalIngestHasAttach(
  ingestOut: Pick<
    CdfCanonicalIngestAttachResult,
    | "socialMediaCanonicalAttach"
    | "presentationCanonicalAttach"
    | "packagingCanonicalAttach"
    | "genericCanonicalAttach"
  >,
): boolean {
  return Boolean(
    ingestOut.socialMediaCanonicalAttach ||
      ingestOut.presentationCanonicalAttach ||
      ingestOut.packagingCanonicalAttach ||
      ingestOut.genericCanonicalAttach,
  );
}

/** Prefer Class-A attach, then generic — never invent identity. */
export function pickCdfCanonicalIngestAttach(
  ingestOut: Pick<
    CdfCanonicalIngestAttachResult,
    | "socialMediaCanonicalAttach"
    | "presentationCanonicalAttach"
    | "packagingCanonicalAttach"
    | "genericCanonicalAttach"
  >,
): Record<string, unknown> | null {
  return (
    ingestOut.socialMediaCanonicalAttach ??
    ingestOut.packagingCanonicalAttach ??
    ingestOut.presentationCanonicalAttach ??
    ingestOut.genericCanonicalAttach ??
    null
  );
}
