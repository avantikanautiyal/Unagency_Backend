/**
 * Canonical-ingest bridge: provider visual → compose → composed vault candidate.
 *
 * Insertion point: applyCdfCanonicalCompletionIngest image bridge,
 * BEFORE promoting raw art_* as the canonical preview.
 *
 * No service / platform / provider semantic branches.
 */

import type { AsyncMediaPlatform } from "../../infrastructure/durability/create-async-media-platform";
import {
  resolveDeliverableCompositionContract,
  type DeliverableCompositionContract,
} from "../../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import { expectedTextsFromExecutionMetadata } from "../generation-validation/structural-composition-validation";
import {
  contractRequiresDeterministicComposition,
  resolveSharedCompositionAuthority,
  type SharedCompositionAuthority,
} from "./composition-authority-input";
import { acceptComposedLeaf } from "./accept-composed-leaf";
import { enrichCanonicalCandidateWithComposedDeliverable } from "./accept-composed-leaf";
import {
  loadExecutionMediaBytes,
  persistComposedDeliverableToVault,
} from "./persist-composed-media";
import type { CompositionCanvasSpec, CompositionBrandMarkInput } from "./types";
import { normalizeVisualGenerationResult } from "./normalize-visual-generation";
import { resolveBrandMarkFromExecutionAuthority } from "./resolve-brand-mark-authority";
import { logCdfAssetByteLifecycle } from "../diagnostics/asset-byte-lifecycle-log";

export type DeterministicCompositionBridgeResult =
  | {
      readonly applied: false;
      readonly reason: "not_required";
    }
  | {
      readonly applied: true;
      readonly ok: true;
      readonly vaultAssetId: string;
      readonly mediaArtifactId: string;
      readonly composedContentHash: string;
      readonly sourceVisualHash: string;
      readonly enrichCandidate: (
        base: Record<string, unknown>,
      ) => Record<string, unknown>;
      readonly authority: SharedCompositionAuthority;
      readonly metadataStamps: Record<string, unknown>;
    }
  | {
      readonly applied: true;
      readonly ok: false;
      readonly reason: string;
      readonly outcome:
        | "COMPOSITION_FAILED"
        | "AUTHORITY_INVALID"
        | "VISUAL_LOAD_FAILED"
        | "PERSIST_FAILED";
      readonly metadataStamps: Record<string, unknown>;
    };

function canvasFromMetadata(
  meta: Record<string, unknown> | undefined,
): CompositionCanvasSpec {
  const w =
    typeof meta?.cdfCompositionCanvasWidthPx === "number"
      ? meta.cdfCompositionCanvasWidthPx
      : 1080;
  const h =
    typeof meta?.cdfCompositionCanvasHeightPx === "number"
      ? meta.cdfCompositionCanvasHeightPx
      : 1080;
  const inset =
    typeof meta?.cdfCompositionSafeAreaInsetPx === "number"
      ? meta.cdfCompositionSafeAreaInsetPx
      : 72;
  return {
    widthPx: w,
    heightPx: h,
    aspectRatio: w === h ? "1:1" : `${w}:${h}`,
    colourSpace: "sRGB",
    preferredMimeType: "image/png",
    safeArea: { top: inset, right: inset, bottom: inset, left: inset },
  };
}

function brandMarkFromMetadata(
  meta: Record<string, unknown> | undefined,
): CompositionBrandMarkInput | null {
  return resolveBrandMarkFromExecutionAuthority(meta);
}

function selectedRouteFromMetadata(
  meta: Record<string, unknown> | undefined,
): SharedCompositionAuthority["selectedRoute"] | undefined {
  // Prefer generation-context stamps (cdfSelectedArtifact*), then legacy aliases.
  const artifactId =
    typeof meta?.cdfSelectedArtifactId === "string"
      ? meta.cdfSelectedArtifactId
      : typeof meta?.cdfSelectedRouteArtifactId === "string"
        ? meta.cdfSelectedRouteArtifactId
        : typeof meta?.cdfRoutesArtifactId === "string"
          ? meta.cdfRoutesArtifactId
          : null;
  const artifactVersionRaw =
    meta?.cdfSelectedArtifactVersion ??
    meta?.cdfSelectedRouteArtifactVersion ??
    meta?.cdfRoutesArtifactVersion;
  const artifactVersion =
    typeof artifactVersionRaw === "number"
      ? artifactVersionRaw
      : typeof artifactVersionRaw === "string" &&
          /^\d+$/.test(artifactVersionRaw.trim())
        ? Number(artifactVersionRaw.trim())
        : null;
  const artifactKey =
    typeof meta?.cdfSelectedArtifactKey === "string"
      ? meta.cdfSelectedArtifactKey
      : typeof meta?.cdfSelectedRouteArtifactKey === "string"
        ? meta.cdfSelectedRouteArtifactKey
        : "social-media.routes";
  if (!artifactId || artifactVersion == null) return undefined;
  return { artifactId, artifactVersion, artifactKey };
}

/**
 * When the composition contract requires deterministic elements, compose the
 * final deliverable from the provider visual plate before canonical ingest.
 */
export async function tryDeterministicCompositionCanonicalBridge(input: {
  readonly metadata: Record<string, unknown> | undefined;
  readonly mediaArtifactId: string;
  readonly executionId: string;
  readonly organizationId: string;
  readonly userId?: string;
  readonly asyncMedia: AsyncMediaPlatform;
  readonly contract?: DeliverableCompositionContract | null;
}): Promise<DeterministicCompositionBridgeResult> {
  const meta = input.metadata;
  const contract =
    input.contract ??
    (typeof meta?.cdfDeliverableKind === "string"
      ? resolveDeliverableCompositionContract(
          meta.cdfDeliverableKind as never,
        )
      : resolveDeliverableCompositionContract("social_creative"));

  if (!contractRequiresDeterministicComposition(contract)) {
    return { applied: false, reason: "not_required" };
  }

  // Activate only when authority assets are present or leaf explicitly opts in
  // (fanout leaf / enforce flag). Avoids breaking legacy single-leaf paths that
  // have not yet stamped brand-mark bytes onto metadata.
  const fanoutLeaf =
    meta?.generationFanoutLeaf === true ||
    meta?.cdfDeterministicCompositionEnforced === true;
  const brandMark = brandMarkFromMetadata(meta);
  if (!fanoutLeaf && !brandMark) {
    return { applied: false, reason: "not_required" };
  }

  const expected = expectedTextsFromExecutionMetadata(meta);
  const primary =
    expected[0] ??
    (typeof meta?.cdfSelectedPrimaryMessage === "string"
      ? meta.cdfSelectedPrimaryMessage
      : "");

  const authorityResolved = resolveSharedCompositionAuthority({
    contract: contract!,
    canvas: canvasFromMetadata(meta),
    primaryMessage: primary,
    brandMark,
    brandContext:
      typeof meta?.brandName === "string"
        ? { brandName: meta.brandName }
        : undefined,
    selectedRoute: selectedRouteFromMetadata(meta),
    provenance: {
      executionId: input.executionId,
      generationFanoutGroupId: meta?.generationFanoutGroupId,
      generationFanoutTargetId: meta?.generationFanoutTargetId,
    },
  });

  if (!authorityResolved.ok) {
    return {
      applied: true,
      ok: false,
      reason: authorityResolved.reason,
      outcome: "AUTHORITY_INVALID",
      metadataStamps: {
        cdfCompositionOutcome: "COMPOSITION_FAILED",
        cdfCompositionFailureReason: authorityResolved.reason,
        cdfCompositionFailureElement: authorityResolved.element,
      },
    };
  }

  const loaded = await loadExecutionMediaBytes({
    mediaArtifactId: input.mediaArtifactId,
    organizationId: input.organizationId,
    asyncMedia: input.asyncMedia,
  });
  logCdfAssetByteLifecycle({
    boundary: "composition_bridge.after_load_raw",
    executionId: input.executionId,
    rawArtifactId: input.mediaArtifactId,
    compositionInputRef: input.mediaArtifactId,
    tenantScope: { organizationId: input.organizationId },
    mimeType: loaded.ok ? loaded.mimeType : null,
    byteLength: loaded.ok ? loaded.bytes.length : null,
    referenceExists: true,
    referenceResolves: loaded.ok,
    bytesExist: loaded.ok && loaded.bytes.length > 0,
    resolverResult: loaded.ok ? "raw_bytes_ok" : loaded.reason,
  });
  if (!loaded.ok) {
    return {
      applied: true,
      ok: false,
      reason: loaded.reason,
      outcome: "VISUAL_LOAD_FAILED",
      metadataStamps: {
        cdfCompositionOutcome: "COMPOSITION_FAILED",
        cdfCompositionFailureReason: loaded.reason,
      },
    };
  }

  const visual = normalizeVisualGenerationResult({
    bytes: loaded.bytes,
    mimeType: loaded.mimeType,
    provenance: "generated",
    generationMeta: {
      mediaArtifactId: input.mediaArtifactId,
      executionId: input.executionId,
      preferredProviderId: meta?.preferredProviderId,
      preferredModelId: meta?.preferredModelId,
      generationFanoutGroupId: meta?.generationFanoutGroupId,
      generationFanoutTargetId: meta?.generationFanoutTargetId,
    },
  });
  if ("ok" in visual && visual.ok === false) {
    return {
      applied: true,
      ok: false,
      reason: visual.reason,
      outcome: "VISUAL_LOAD_FAILED",
      metadataStamps: {
        cdfCompositionOutcome: "COMPOSITION_FAILED",
        cdfCompositionFailureReason: visual.reason,
      },
    };
  }

  const acceptance = acceptComposedLeaf({
    authority: authorityResolved.authority,
    visual: visual as never,
    identity: {
      executionId: input.executionId,
      fanoutGroupId:
        typeof meta?.generationFanoutGroupId === "string"
          ? meta.generationFanoutGroupId
          : undefined,
      fanoutTargetId:
        typeof meta?.generationFanoutTargetId === "string"
          ? meta.generationFanoutTargetId
          : undefined,
      providerId:
        typeof meta?.preferredProviderId === "string"
          ? meta.preferredProviderId
          : undefined,
      modelId:
        typeof meta?.preferredModelId === "string"
          ? meta.preferredModelId
          : undefined,
    },
    skipStructural: true,
  });

  if (!acceptance.ok) {
    return {
      applied: true,
      ok: false,
      reason: acceptance.reason,
      outcome: "COMPOSITION_FAILED",
      metadataStamps: {
        cdfCompositionOutcome: "COMPOSITION_FAILED",
        cdfCompositionFailureReason: acceptance.reason,
        cdfCompositionFailureCode: acceptance.compositionFailure?.code,
      },
    };
  }

  const persisted = await persistComposedDeliverableToVault({
    composedBytes: acceptance.composed.bytes,
    mimeType: acceptance.composed.mimeType,
    executionId: input.executionId,
    organizationId: input.organizationId,
    userId: input.userId,
    asyncMedia: input.asyncMedia,
  });
  logCdfAssetByteLifecycle({
    boundary: "composition_bridge.after_persist",
    executionId: input.executionId,
    rawArtifactId: input.mediaArtifactId,
    compositionInputRef: input.mediaArtifactId,
    compositionOutputRef: persisted.ok ? persisted.mediaArtifactId : null,
    mediaArtifactId: persisted.ok ? persisted.mediaArtifactId : null,
    finalizedArtifactId: persisted.ok ? persisted.mediaArtifactId : null,
    promotedVaultAssetId: persisted.ok ? persisted.vaultAssetId : null,
    vaultAssetId: persisted.ok ? persisted.vaultAssetId : null,
    mediaFileId: persisted.ok ? persisted.vaultAssetId : null,
    previewAssetRef: persisted.ok ? persisted.vaultAssetId : null,
    tenantScope: { organizationId: input.organizationId },
    mimeType: acceptance.composed.mimeType,
    byteLength: acceptance.composed.bytes.length,
    referenceExists: persisted.ok,
    referenceResolves: persisted.ok,
    bytesExist: acceptance.composed.bytes.length > 0,
    resolverResult: persisted.ok ? "persist_ok" : persisted.reason,
  });
  if (!persisted.ok) {
    return {
      applied: true,
      ok: false,
      reason: persisted.reason,
      outcome: "PERSIST_FAILED",
      metadataStamps: {
        cdfCompositionOutcome: "COMPOSITION_FAILED",
        cdfCompositionFailureReason: persisted.reason,
      },
    };
  }

  return {
    applied: true,
    ok: true,
    vaultAssetId: persisted.vaultAssetId,
    mediaArtifactId: persisted.mediaArtifactId,
    composedContentHash: acceptance.composed.contentHash,
    sourceVisualHash: acceptance.composed.sourceVisualHash,
    authority: authorityResolved.authority,
    enrichCandidate: (base) =>
      enrichCanonicalCandidateWithComposedDeliverable({
        baseCandidate: base,
        composed: acceptance.composed,
        vaultAssetId: persisted.vaultAssetId,
        primaryMessage: authorityResolved.authority.primaryMessage,
        contract: contract!,
      }),
    metadataStamps: {
      cdfCompositionOutcome: "COMPOSED",
      cdfComposedContentHash: acceptance.composed.contentHash,
      cdfSourceVisualHash: acceptance.composed.sourceVisualHash,
      cdfComposedMediaArtifactId: persisted.mediaArtifactId,
      cdfComposedVaultAssetId: persisted.vaultAssetId,
      cdfRawProviderMediaIsNotAcceptanceSubject: true,
    },
  };
}
