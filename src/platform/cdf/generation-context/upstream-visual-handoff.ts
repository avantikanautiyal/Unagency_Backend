/**
 * Generic upstream visual ArtifactVersion handoff.
 *
 * When a downstream visual/video/hybrid phase depends on an upstream ArtifactVersion
 * that carries Vault media, materialize that exact X@V into metadata.assets so
 * multimodal CMR + provider adapters receive provider-usable visual input.
 *
 * Contract-driven (modality + artifactType + previewAssetRef) — no service/phase
 * branches. Continuation-selected visuals remain handled separately; this covers
 * approved/selected dependency pins (e.g. IMAGE → VIDEO after approve).
 */

import { success, type Result } from "../../core/result";
import { ensureCdfSessionLoaded } from "../session-store";
import { resolveUpstreamArtifactsForPhase } from "./resolve-dependencies";
import { resolveCdfCanonicalService } from "../canonical";
import {
  createArtifactContextLoader,
  loadUpstreamFromSessionRef,
} from "./artifact-context-loader";
import type { CdfSessionArtifactRef, CdfSessionState } from "../types";
import {
  downstreamRequiresVisualMediaInput,
  extractVaultAssetIdFromArtifactData,
  isVisualMediaArtifactType,
  resolveCanonicalArtifactVisualBytes,
} from "./canonical-visual-bytes";
import type { UpstreamArtifactContext } from "./types";

const UPSTREAM_VISUAL_RELATIONSHIP = "cdf_upstream_visual_artifact";
const UPSTREAM_VISUAL_REFERENCE_ROLE = "subject_reference" as const;

export const CDF_UPSTREAM_ARTIFACT_UNRESOLVABLE =
  "CDF_UPSTREAM_ARTIFACT_UNRESOLVABLE";

/**
 * Every image stage also receives the earlier approved image stages (not only
 * the declared direct dependency), so later stages cannot drift from the
 * established design. Video is excluded: providers open on the first image,
 * and storyboard frames are handed over by the animation planner instead.
 */
function receivesFullVisualLineage(modality: string | undefined): boolean {
  return modality !== "video";
}
/** Upstream creatives per request; the brand logo is attached separately. */
const MAX_UPSTREAM_VISUALS = 4;

/**
 * Earlier approved stages of this project, most recent stage first. A final
 * step re-render of an approved stage (pack angles, size adaptations) also
 * gets the stages approved after it — the 2D pack shows every panel the 3D
 * view hides.
 */
function earlierApprovedRefs(
  session: CdfSessionState,
  serviceId: string,
  phaseId: string,
  includeLaterStages = false,
): CdfSessionArtifactRef[] {
  const phases = resolveCdfCanonicalService(serviceId)?.phases ?? [];
  const order = new Map(phases.map((p, i) => [p.phaseId, i]));
  const current = order.get(phaseId);
  if (current === undefined) return [];
  const latestByPhase = new Map<string, CdfSessionArtifactRef>();
  for (const ref of session.approvedArtifacts ?? []) {
    const idx = order.get(ref.phaseId);
    if (idx === undefined || idx === current) continue;
    if (idx > current && !includeLaterStages) continue;
    if (!Number.isInteger(ref.version) || ref.version < 1) continue;
    const prev = latestByPhase.get(ref.phaseId);
    if (!prev || ref.version > prev.version) latestByPhase.set(ref.phaseId, ref);
  }
  return [...latestByPhase.values()].sort(
    (a, b) => (order.get(b.phaseId) ?? 0) - (order.get(a.phaseId) ?? 0),
  );
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

function readString(
  meta: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const v = meta[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function logUpstreamVisual(event: string, fields: Record<string, unknown>): void {
  try {
    console.info(
      JSON.stringify({
        scope: "cdf.upstream_artifact",
        event,
        ...fields,
        ts: new Date().toISOString(),
      }),
    );
  } catch {
    // ignore
  }
}

function upstreamNeedsVisualMedia(u: UpstreamArtifactContext): boolean {
  if (extractVaultAssetIdFromArtifactData(u.data)) return true;
  // Prefer artifactKey modality hints only via data / known visual roles.
  if (u.role === "visual_reference") return true;
  return false;
}

function assetAlreadyBoundForArtifact(
  meta: Readonly<Record<string, unknown>>,
  artifactId: string,
): boolean {
  const assets = Array.isArray(meta.assets) ? meta.assets : [];
  for (const a of assets) {
    const rec = asRecord(a);
    if (!rec) continue;
    const id =
      (typeof rec.assetId === "string" && rec.assetId.trim()) ||
      (typeof rec.id === "string" && rec.id.trim()) ||
      "";
    const hasBytes = Boolean(
      (typeof rec.url === "string" && rec.url.trim()) ||
        (typeof rec.storageRef === "string" && rec.storageRef.trim()),
    );
    if (id === artifactId && hasBytes) return true;
    if (
      rec.relationshipLabel === UPSTREAM_VISUAL_RELATIONSHIP &&
      typeof rec.cdfUpstreamArtifactId === "string" &&
      rec.cdfUpstreamArtifactId === artifactId &&
      hasBytes
    ) {
      return true;
    }
  }
  return false;
}

function attachUpstreamVisualAsset(input: {
  metadata: Readonly<Record<string, unknown>>;
  upstream: UpstreamArtifactContext;
  resolvedUrl: string;
  mimeType: string;
  organizationId: string;
  vaultAssetId: string;
  contentHash?: string;
  /**
   * Put this visual first. Video providers use the first image as the opening
   * frame — with the logo first, the video started on the logo instead of the
   * approved storyboard.
   */
  leadsInputs?: boolean;
}): Record<string, unknown> {
  const existingAssets = Array.isArray(input.metadata.assets)
    ? [...input.metadata.assets]
    : [];
  const assetRecord: Record<string, unknown> = {
    url: input.resolvedUrl,
    mimeType: input.mimeType,
    assetId: input.upstream.artifactId,
    organizationId: input.organizationId,
    semanticReferenceRole: UPSTREAM_VISUAL_REFERENCE_ROLE,
    explicitRole: UPSTREAM_VISUAL_REFERENCE_ROLE,
    referenceRoleResolutionSource: "explicit_role",
    relationshipLabel: UPSTREAM_VISUAL_RELATIONSHIP,
    referenceAuthority: "authoritative",
    referenceBehavior: "source_asset",
    cdfUpstreamArtifactId: input.upstream.artifactId,
    cdfUpstreamArtifactVersion: input.upstream.version,
    cdfUpstreamArtifactKey: input.upstream.artifactKey,
    cdfUpstreamPhaseId: input.upstream.phaseId,
    cdfUpstreamSessionRole: input.upstream.sessionRole,
    cdfUpstreamVaultAssetId: input.vaultAssetId,
    ...(input.contentHash
      ? { cdfUpstreamContentHash: input.contentHash }
      : {}),
  };

  const filtered = existingAssets.filter((a) => {
    const rec = asRecord(a);
    if (!rec) return true;
    if (rec.cdfUpstreamArtifactId === input.upstream.artifactId) return false;
    const id =
      (typeof rec.assetId === "string" && rec.assetId.trim()) ||
      (typeof rec.id === "string" && rec.id.trim()) ||
      "";
    if (
      id === input.upstream.artifactId &&
      rec.relationshipLabel === UPSTREAM_VISUAL_RELATIONSHIP
    ) {
      return false;
    }
    return true;
  });

  return {
    ...input.metadata,
    referenceInputPresent: true,
    cdfUpstreamVisualHandoffApplied: true,
    assets: input.leadsInputs ? [assetRecord, ...filtered] : [...filtered, assetRecord],
  };
}

/**
 * Materialize exact upstream visual ArtifactVersions into metadata.assets.
 * Fail closed when a required visual upstream cannot be resolved to bytes.
 */
export async function applyUpstreamVisualArtifactHandoff(input: {
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly organizationId: string;
  readonly projectId?: string;
}): Promise<
  Result<{
    metadata: Record<string, unknown>;
    attachedCount: number;
  }>
> {
  const meta = { ...input.metadata };
  const sessionId = readString(meta, "cdfSessionId");
  const phaseId = readString(meta, "cdfPhaseId");
  const modality =
    readString(meta, "cdfGenerationModality") ||
    readString(meta, "generationModality") ||
    readString(meta, "cdfAuthorityGenerationModality");

  if (!sessionId || !phaseId) {
    return success({ metadata: meta, attachedCount: 0 });
  }
  if (!downstreamRequiresVisualMediaInput(modality)) {
    return success({ metadata: meta, attachedCount: 0 });
  }

  // From Mongo after a restart — a cold in-memory cache must not silently drop
  // the approved stages and let the model redesign from text alone.
  let session: CdfSessionState | undefined;
  try {
    session = await ensureCdfSessionLoaded(sessionId);
  } catch {
    session = undefined;
  }
  if (!session) {
    return success({ metadata: meta, attachedCount: 0 });
  }

  const resolved = resolveUpstreamArtifactsForPhase({
    session,
    serviceId:
      readString(meta, "cdfServiceId") ||
      readString(meta, "serviceId") ||
      session.serviceId,
    phaseId,
    organizationId: input.organizationId,
    projectId: input.projectId ?? session.projectId,
  });

  if (!resolved.ok) {
    // Dependency failure is handled by generation-context apply; do not double-fail here
    // when pins are absent — only fail when pins exist but media cannot materialize.
    logUpstreamVisual("declared", {
      executionId: readString(meta, "executionId") ?? null,
      cdfSessionId: sessionId,
      targetPhase: phaseId,
      status: "dependency_unresolved",
      reason: resolved.message,
    });
    return success({ metadata: meta, attachedCount: 0 });
  }

  let nextMeta: Record<string, unknown> = meta;
  let attachedCount = 0;

  // The most recent approved stage leads: providers and the reference
  // description treat the first upstream image as the design authority
  // (3D direction before dieline for the 2D pack, master before brief).
  const phaseOrder = new Map(
    (resolveCdfCanonicalService(
      readString(meta, "cdfServiceId") || readString(meta, "serviceId") || session.serviceId,
    )?.phases ?? []).map((p, i) => [p.phaseId, i]),
  );
  const upstreamLatestFirst = [...resolved.upstream].sort(
    (a, b) => (phaseOrder.get(b.phaseId) ?? -1) - (phaseOrder.get(a.phaseId) ?? -1),
  );

  for (const u of upstreamLatestFirst) {
    logUpstreamVisual("declared", {
      executionId: readString(meta, "executionId") ?? null,
      cdfSessionId: sessionId,
      sourcePhase: u.phaseId,
      targetPhase: phaseId,
      artifactId: u.artifactId,
      artifactVersion: u.version,
      artifactKey: u.artifactKey,
      required: u.required,
      sessionRole: u.sessionRole,
    });

    const vaultHint = extractVaultAssetIdFromArtifactData(u.data);
    const needsMedia = Boolean(vaultHint) || upstreamNeedsVisualMedia(u);

    // Load artifactType from bag when data lacks vault — still may be visual type.
    let artifactType: string | undefined;
    try {
      const { getArtifact } = await import("../artifacts");
      const head = getArtifact(u.artifactId, {
        organizationId: input.organizationId,
        projectId: input.projectId ?? session.projectId,
      });
      artifactType = head.artifactType;
    } catch {
      artifactType = undefined;
    }

    const isVisualType = isVisualMediaArtifactType(artifactType);
    if (!needsMedia && !isVisualType) {
      logUpstreamVisual("loaded", {
        executionId: readString(meta, "executionId") ?? null,
        cdfSessionId: sessionId,
        sourcePhase: u.phaseId,
        targetPhase: phaseId,
        artifactId: u.artifactId,
        artifactVersion: u.version,
        artifactKey: u.artifactKey,
        representation: "structured_data",
        resolverStatus: "skip_non_visual",
        // Media bytes skipped — structured semantic payload remains on UpstreamArtifactContext
        // and is projected via resolveSelectedSemanticChoices / resolveUpstreamArtifactContext.
        semanticProjectionEligible: true,
        note: "skip_non_visual skips vault media attachment only; structured semantic content is retained for downstream composition",
      });
      continue;
    }

    logUpstreamVisual("loaded", {
      executionId: readString(meta, "executionId") ?? null,
      cdfSessionId: sessionId,
      sourcePhase: u.phaseId,
      targetPhase: phaseId,
      artifactId: u.artifactId,
      artifactVersion: u.version,
      artifactKey: u.artifactKey,
      representation: "image_asset",
      resolverStatus: "pending_bytes",
    });

    if (assetAlreadyBoundForArtifact(nextMeta, u.artifactId)) {
      attachedCount += 1;
      logUpstreamVisual("attached", {
        executionId: readString(meta, "executionId") ?? null,
        cdfSessionId: sessionId,
        sourcePhase: u.phaseId,
        targetPhase: phaseId,
        artifactId: u.artifactId,
        artifactVersion: u.version,
        artifactKey: u.artifactKey,
        representation: "image_asset",
        resolverStatus: "already_bound",
      });
      continue;
    }

    const bytes = await resolveCanonicalArtifactVisualBytes({
      artifactId: u.artifactId,
      artifactVersion: u.version,
      organizationId: input.organizationId,
      projectId: input.projectId ?? session.projectId,
    });

    if (!bytes.ok) {
      logUpstreamVisual("resolved", {
        executionId: readString(meta, "executionId") ?? null,
        cdfSessionId: sessionId,
        sourcePhase: u.phaseId,
        targetPhase: phaseId,
        artifactId: u.artifactId,
        artifactVersion: u.version,
        artifactKey: u.artifactKey,
        representation: "image_asset",
        resolverStatus: "failed",
        reason: bytes.reason,
      });
      // Product decision (Oct 27 2026): never leave the user with an error.
      // Generate from the brief and tell them so (cdfDeliveryNote on the result).
      if (u.required || needsMedia || isVisualType) {
        nextMeta = { ...nextMeta, cdfApprovedDesignFallback: true };
      }
      continue;
    }

    logUpstreamVisual("resolved", {
      executionId: readString(meta, "executionId") ?? null,
      cdfSessionId: sessionId,
      sourcePhase: u.phaseId,
      targetPhase: phaseId,
      artifactId: u.artifactId,
      artifactVersion: u.version,
      artifactKey: u.artifactKey,
      contentHash: bytes.contentHash,
      representation: "image_asset",
      resolverStatus: "ok",
      vaultAssetId: bytes.vaultAssetId,
    });

    nextMeta = attachUpstreamVisualAsset({
      leadsInputs: modality === "video",
      metadata: nextMeta,
      upstream: u,
      resolvedUrl: bytes.resolved.providerInput.url!,
      mimeType: bytes.resolved.mimeType,
      organizationId: input.organizationId,
      vaultAssetId: bytes.vaultAssetId,
      contentHash: bytes.contentHash,
    });
    attachedCount += 1;

    logUpstreamVisual("attached", {
      executionId: readString(meta, "executionId") ?? null,
      cdfSessionId: sessionId,
      sourcePhase: u.phaseId,
      targetPhase: phaseId,
      artifactId: u.artifactId,
      artifactVersion: u.version,
      artifactKey: u.artifactKey,
      contentHash: bytes.contentHash,
      representation: "image_asset",
      resolverStatus: "ok",
    });

    logUpstreamVisual("represented", {
      executionId: readString(meta, "executionId") ?? null,
      cdfSessionId: sessionId,
      sourcePhase: u.phaseId,
      targetPhase: phaseId,
      artifactId: u.artifactId,
      artifactVersion: u.version,
      artifactKey: u.artifactKey,
      contentHash: bytes.contentHash,
      representation: "image_asset",
      resolverStatus: "provider_ready",
    });
  }

  // Full lineage: earlier approved image stages beyond the declared dependency.
  // Optional evidence — a stage that cannot be loaded is skipped, never fatal.
  const lineageServiceId =
    readString(meta, "cdfServiceId") || readString(meta, "serviceId") || session.serviceId;
  if (receivesFullVisualLineage(modality)) {
    const loader = createArtifactContextLoader();
    const projectId = input.projectId ?? session.projectId;
    const rerender = meta.cdfSingleLeaf === true;
    for (const ref of earlierApprovedRefs(session, lineageServiceId, phaseId, rerender)) {
      if (attachedCount >= MAX_UPSTREAM_VISUALS) break;
      if (assetAlreadyBoundForArtifact(nextMeta, ref.artifactId)) continue;
      try {
        const u = loadUpstreamFromSessionRef({
          loader,
          ref,
          required: false,
          organizationId: input.organizationId,
          projectId,
        });
        let artifactType: string | undefined;
        try {
          const { getArtifact } = await import("../artifacts");
          artifactType = getArtifact(u.artifactId, {
            organizationId: input.organizationId,
            projectId,
          }).artifactType;
        } catch {
          artifactType = undefined;
        }
        if (
          !extractVaultAssetIdFromArtifactData(u.data) &&
          !isVisualMediaArtifactType(artifactType)
        ) {
          continue;
        }
        const bytes = await resolveCanonicalArtifactVisualBytes({
          artifactId: u.artifactId,
          artifactVersion: u.version,
          organizationId: input.organizationId,
          projectId,
        });
        if (!bytes.ok) {
          logUpstreamVisual("lineage_skipped", {
            cdfSessionId: sessionId,
            sourcePhase: u.phaseId,
            targetPhase: phaseId,
            artifactId: u.artifactId,
            artifactVersion: u.version,
            reason: bytes.reason,
          });
          continue;
        }
        nextMeta = attachUpstreamVisualAsset({
          metadata: nextMeta,
          upstream: u,
          resolvedUrl: bytes.resolved.providerInput.url!,
          mimeType: bytes.resolved.mimeType,
          organizationId: input.organizationId,
          vaultAssetId: bytes.vaultAssetId,
          contentHash: bytes.contentHash,
        });
        attachedCount += 1;
        logUpstreamVisual("lineage_attached", {
          cdfSessionId: sessionId,
          sourcePhase: u.phaseId,
          targetPhase: phaseId,
          artifactId: u.artifactId,
          artifactVersion: u.version,
        });
      } catch (err) {
        logUpstreamVisual("lineage_skipped", {
          cdfSessionId: sessionId,
          sourcePhase: ref.phaseId,
          targetPhase: phaseId,
          artifactId: ref.artifactId,
          artifactVersion: ref.version,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  if (attachedCount > 0) {
    nextMeta = {
      ...nextMeta,
      cdfUpstreamVisualAttachedCount: attachedCount,
    };
  }

  return success({ metadata: nextMeta, attachedCount });
}
