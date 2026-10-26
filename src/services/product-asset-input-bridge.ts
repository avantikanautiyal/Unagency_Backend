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
  classifyAttachmentRoles,
  type AttachmentForClassification,
  type AttachmentRole,
} from "./attachment-role-classifier";
import {
  resolveCanonicalReferenceRoleWithSource,
  type MultimodalReferenceRole,
} from "../platform/ai/multimodal-context/reference-role";

export type ResolvedProductAssetPayload = {
  readonly assets: readonly InputAssetReference[];
  readonly audio?: InputAssetReference;
  /** Ids that are not usable vault assets (malformed, deleted, other tenant). */
  readonly skippedAssetIds: readonly string[];
};

/**
 * A reference that can never resolve — not a vault id, deleted, or another
 * tenant's. Project references are replayed on every later step, so one such
 * id used to fail every create (and every refine) with "Invalid asset id".
 */
function isUnresolvableAssetError(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    (err.statusCode === 400 || err.statusCode === 403 || err.statusCode === 404)
  );
}

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
  const skippedAssetIds: string[] = [];
  for (const assetId of input.assetIds) {
    if (!assetId?.trim()) continue;
    const id = assetId.trim();
    let resolved: Awaited<ReturnType<typeof productAssetService.resolveProviderInputAsset>>;
    try {
      resolved = await productAssetService.resolveProviderInputAsset({
        userId: input.userId,
        assetId: id,
        organizationId: input.organizationId,
      });
    } catch (err) {
      if (!isUnresolvableAssetError(err)) throw err;
      skippedAssetIds.push(id);
      console.warn(
        JSON.stringify({
          scope: "product_asset_input_bridge",
          event: "reference_asset_skipped",
          assetId: id,
          organizationId: input.organizationId,
          reason: err instanceof Error ? err.message : String(err),
        }),
      );
      continue;
    }
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
  const audio =
    assets.find((a) => (a.mimeType ?? "").startsWith("audio/")) ?? assets[0];
  return { assets, audio, skippedAssetIds };
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
 * A photo the user attached (or picked from the vault) is the thing the
 * creative is about — the exact product/object to show — unless a vision
 * check says it is the logo or a style example. Left role-less it was a vague
 * "supporting reference" (or a style hint on some providers) and the model
 * drew its own object. Logos filed in the vault and brand documents keep
 * their meaning.
 */
function withUserSubjectRole(
  rec: Record<string, unknown>,
  classified: AttachmentRole | undefined,
): Record<string, unknown> {
  if (rec.semanticReferenceRole) return rec;
  const mime = String(rec.mimeType ?? "").toLowerCase();
  if (!mime.startsWith("image/")) return rec;
  const folder = String(rec.folder ?? "").trim().toLowerCase();
  const tags = Array.isArray(rec.tags) ? rec.tags.map(String) : [];
  if (folder === "logos" || classified === "logo") {
    return {
      ...rec,
      semanticReferenceRole: "identity_mark",
      referenceRoleResolutionSource:
        folder === "logos" ? "vault_logo_folder" : "vision_attachment_role",
      ...(rec.brandAssetRole ? {} : { brandAssetRole: "logo" }),
    };
  }
  if (tags.includes("brand-document")) return rec;
  if (classified === "style_reference") {
    return {
      ...rec,
      semanticReferenceRole: "style_reference",
      referenceRoleResolutionSource: "vision_attachment_role",
    };
  }
  return {
    ...rec,
    semanticReferenceRole: "product_reference",
    referenceRoleResolutionSource: classified
      ? "vision_attachment_role"
      : "user_attached_subject",
  };
}

/** Images whose role is still open after explicit roles, logo binds and vault filing. */
function needsVisionRole(rec: Record<string, unknown>): boolean {
  if (rec.semanticReferenceRole) return false;
  if (!String(rec.mimeType ?? "").toLowerCase().startsWith("image/")) return false;
  if (String(rec.folder ?? "").trim().toLowerCase() === "logos") return false;
  const tags = Array.isArray(rec.tags) ? rec.tags.map(String) : [];
  return !tags.includes("brand-document");
}

const visionInFlight = new Map<string, Promise<Map<string, AttachmentRole>>>();

/**
 * Vision verdict per asset: cached on the asset when known, else one batched
 * call (parallel option runs of one step share it) whose answers are saved.
 */
async function resolveAttachmentRoles(
  recs: readonly Record<string, unknown>[],
  brief: string,
): Promise<Map<string, AttachmentRole>> {
  const roles = new Map<string, AttachmentRole>();
  const pending: AttachmentForClassification[] = [];
  for (const rec of recs) {
    if (!needsVisionRole(rec)) continue;
    const id = assetRecordId(rec);
    if (!id) continue;
    const cached = String(rec.attachmentRole ?? "");
    if (cached === "logo" || cached === "product" || cached === "style_reference") {
      roles.set(id, cached);
      continue;
    }
    if (typeof rec.url === "string" && rec.url.startsWith("data:image/")) {
      pending.push({
        assetId: id,
        dataUrl: rec.url,
        ...(typeof rec.filename === "string" ? { fileName: rec.filename } : {}),
      });
    }
  }
  if (pending.length === 0) return roles;

  const key = pending.map((p) => p.assetId).sort().join(",");
  let run = visionInFlight.get(key);
  if (!run) {
    run = classifyAttachmentRoles({ brief, attachments: pending }).then((found) => {
      for (const [assetId, role] of found) {
        void productAssetService
          .rememberAttachmentRole(assetId, role)
          .catch(() => undefined);
      }
      console.info(
        JSON.stringify({
          scope: "product_asset_input_bridge",
          event: "attachment_roles_classified",
          roles: Object.fromEntries(found),
          requested: pending.length,
        }),
      );
      return found;
    });
    visionInFlight.set(key, run);
    void run.finally(() => visionInFlight.delete(key));
  }
  for (const [assetId, role] of await run) roles.set(assetId, role);
  return roles;
}

/**
 * Attach resolved `assets` / `audio` / `image` onto execution metadata
 * so providers see bytes (or URLs), not only opaque ProductAsset id strings.
 */
export async function attachProductAssetsToExecutionMetadata(input: {
  readonly userId: string;
  readonly organizationId: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  /** The brief, so the vision check can tell "in this style" from "this product". */
  readonly brief?: string;
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
  if (resolved.skippedAssetIds.length) {
    meta.productAssetIdsSkipped = [...resolved.skippedAssetIds];
  }
  if (resolved.assets.length === 0) {
    // Nothing usable — generate without reference images rather than failing.
    meta.assetIds = [];
    return meta;
  }

  const logoIds = metadataLogoAssetIds(meta);
  const existingAssets = Array.isArray(meta.assets) ? [...meta.assets] : [];
  const withRoles = resolved.assets.map((a) =>
    withPreservedOrAuthoritativeRole(a, meta, logoIds),
  );
  const visionRoles = await resolveAttachmentRoles(withRoles, input.brief ?? "");
  const stampedResolved = withRoles.map((rec) => {
    const id = assetRecordId(rec);
    return withUserSubjectRole(rec, id ? visionRoles.get(id) : undefined);
  });
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
  const usableIds = assetIds.filter((id) => !resolved.skippedAssetIds.includes(id));
  meta.assetIds = usableIds;
  meta.productAssetIds = usableIds;
  return meta;
}
