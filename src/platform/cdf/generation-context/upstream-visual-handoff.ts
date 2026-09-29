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

import { failure, success, type Result } from "../../core/result";
import { ValidationError } from "../../core/errors";
import { getCdfSession } from "../session-store";
import { resolveUpstreamArtifactsForPhase } from "./resolve-dependencies";
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
    assets: [...filtered, assetRecord],
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

  const session = getCdfSession(sessionId);
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

  for (const u of resolved.upstream) {
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
      if (u.required || needsMedia || isVisualType) {
        return failure(
          new ValidationError(
            `Upstream ArtifactVersion ${u.artifactId}@${u.version} could not be resolved into the visual representation required by phase "${phaseId}"`,
            {
              reason: CDF_UPSTREAM_ARTIFACT_UNRESOLVABLE,
              artifactId: u.artifactId,
              artifactVersion: u.version,
              artifactKey: u.artifactKey,
              sourcePhase: u.phaseId,
              targetPhase: phaseId,
              requiredRepresentation: "image_asset",
              actualRepresentation: "unresolved",
              resolverStage: "vault_bytes",
              failureReason: bytes.reason,
            },
          ),
        );
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

  if (attachedCount > 0) {
    nextMeta = {
      ...nextMeta,
      cdfUpstreamVisualAttachedCount: attachedCount,
    };
  }

  return success({ metadata: nextMeta, attachedCount });
}
