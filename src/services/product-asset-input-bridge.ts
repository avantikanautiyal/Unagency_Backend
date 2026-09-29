/**
 * ProductAsset → provider input-asset bridge.
 * Resolves owned product assets into provider payload refs (audio/vision).
 * No vendor SDKs — bytes come from IBlobStorage only.
 *
 * Transport / provenance only for referenceInputType.
 * Does NOT invent semanticReferenceRole from vault provenance.
 */

import { ApiError } from "../utils/apiError";
import { productAssetService } from "./product-asset-service";
import type { InputAssetReference } from "../platform/providers/common/input-asset-validator";
import {
  resolveCanonicalReferenceRoleWithSource,
  type MultimodalReferenceRole,
} from "../platform/ai/multimodal-context/reference-role";

export type ResolvedProductAssetPayload = {
  readonly assets: readonly InputAssetReference[];
  readonly audio?: InputAssetReference;
};

/**
 * Load owned product assets and map to provider input refs.
 * Prefers data-URL payload so sync STT dispatchers can read bytes without a second hop.
 */
export async function resolveProductAssetIdsForProvider(input: {
  readonly userId: string;
  readonly organizationId: string;
  readonly assetIds: readonly string[];
}): Promise<ResolvedProductAssetPayload> {
  const assets: InputAssetReference[] = [];
  for (const assetId of input.assetIds) {
    if (!assetId?.trim()) continue;
    const id = assetId.trim();
    const resolved = await productAssetService.resolveProviderInputAsset({
      userId: input.userId,
      assetId: id,
      organizationId: input.organizationId,
    });
    // Preserve the authoritative product-asset id on the payload record.
    const resolvedRec = resolved as Record<string, unknown>;
    const resolvedAssetId =
      typeof resolvedRec.assetId === "string" && resolvedRec.assetId.trim()
        ? resolvedRec.assetId.trim()
        : id;
    assets.push({
      ...resolvedRec,
      assetId: resolvedAssetId,
    } as InputAssetReference);
  }
  if (assets.length === 0) {
    throw new ApiError("No resolvable product assets for provider input", 400);
  }
  const audio =
    assets.find((a) => (a.mimeType ?? "").startsWith("audio/")) ?? assets[0];
  return { assets, audio };
}

function metadataLogoAssetIds(
  meta: Readonly<Record<string, unknown>>,
): Set<string> {
  const ids = new Set<string>();
  for (const key of ["logoAssetId", "brandLogoAssetId"] as const) {
    const v = meta[key];
    if (typeof v === "string" && v.trim()) ids.add(v.trim());
  }
  return ids;
}

function assetRecordId(rec: Record<string, unknown>): string | undefined {
  if (typeof rec.assetId === "string" && rec.assetId.trim()) {
    return rec.assetId.trim();
  }
  if (typeof rec.id === "string" && rec.id.trim()) return rec.id.trim();
  return undefined;
}

/**
 * Propagate authoritative role onto a resolved asset without inventing one.
 * Preserves explicit semanticReferenceRole / brandAssetRole / role.
 * Maps CTI/logo-bind metadata (logoAssetId) → brandAssetRole=logo +
 * semanticReferenceRole=identity_mark only when the asset id matches —
 * never from referenceInputType / vault class alone.
 */
function withPreservedOrAuthoritativeRole(
  asset: InputAssetReference | Record<string, unknown>,
  meta: Readonly<Record<string, unknown>>,
  logoIds: Set<string>,
): Record<string, unknown> {
  const rec = { ...(asset as Record<string, unknown>) };
  const id = assetRecordId(rec);
  const matchesLogo = Boolean(id && logoIds.has(id));

  const resolved = resolveCanonicalReferenceRoleWithSource({
    explicitRole: rec.explicitRole,
    semanticReferenceRole: rec.semanticReferenceRole,
    referenceRole: rec.referenceRole,
    brandAssetRole: rec.brandAssetRole ?? rec.role,
    matchesAuthoritativeBrandLogoRelation: matchesLogo,
  });

  if (resolved.role) {
    const existingSource =
      typeof rec.referenceRoleResolutionSource === "string" &&
      rec.referenceRoleResolutionSource.trim()
        ? rec.referenceRoleResolutionSource.trim()
        : undefined;
    const next: Record<string, unknown> = {
      ...rec,
      semanticReferenceRole: resolved.role as MultimodalReferenceRole,
      referenceRoleResolutionSource:
        existingSource ??
        (resolved.source !== "absent" ? resolved.source : undefined),
    };
    if (
      resolved.role === "identity_mark" &&
      !(typeof rec.brandAssetRole === "string" && rec.brandAssetRole.trim()) &&
      !(typeof rec.role === "string" && rec.role.trim())
    ) {
      next.brandAssetRole = "logo";
    }
    return next;
  }

  // Absence remains absence — do not invent identity_mark.
  return rec;
}

/**
 * Attach resolved `assets` / `audio` / `image` onto execution metadata
 * so providers see bytes (or URLs), not only opaque ProductAsset id strings.
 */
export async function attachProductAssetsToExecutionMetadata(input: {
  readonly userId: string;
  readonly organizationId: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): Promise<Record<string, unknown>> {
  const meta: Record<string, unknown> = { ...(input.metadata ?? {}) };
  const rawIds = meta.assetIds;
  const assetIds = Array.isArray(rawIds)
    ? rawIds.map(String).filter(Boolean)
    : typeof rawIds === "string" && rawIds.trim()
      ? [rawIds.trim()]
      : [];

  if (assetIds.length === 0) {
    return meta;
  }

  const resolved = await resolveProductAssetIdsForProvider({
    userId: input.userId,
    organizationId: input.organizationId,
    assetIds,
  });

  const logoIds = metadataLogoAssetIds(meta);
  const existingAssets = Array.isArray(meta.assets) ? [...meta.assets] : [];
  const stampedResolved = resolved.assets.map((a) =>
    withPreservedOrAuthoritativeRole(a, meta, logoIds),
  );
  meta.assets = [
    ...existingAssets.map((a) =>
      a && typeof a === "object"
        ? withPreservedOrAuthoritativeRole(
            a as Record<string, unknown>,
            meta,
            logoIds,
          )
        : a,
    ),
    ...stampedResolved,
  ];
  if (!meta.audio && resolved.audio) {
    meta.audio = resolved.audio;
  }
  const firstImage = stampedResolved.find((a) =>
    String((a as { mimeType?: string }).mimeType ?? "")
      .toLowerCase()
      .startsWith("image/"),
  );
  if (firstImage && !meta.image) {
    meta.image = withPreservedOrAuthoritativeRole(firstImage, meta, logoIds);
  } else if (meta.image && typeof meta.image === "object") {
    meta.image = withPreservedOrAuthoritativeRole(
      meta.image as Record<string, unknown>,
      meta,
      logoIds,
    );
  }
  if (firstImage) {
    meta.referenceInputPresent = true;
    // Provenance / transport only — not a semantic role.
    if (!meta.referenceInputType) {
      meta.referenceInputType = "brand_vault_asset";
    }
  }
  meta.productAssetIds = assetIds;
  return meta;
}
