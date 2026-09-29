/**
 * M8E — Collect Vault preview asset ids from Packaging canonical data.
 * Never treats art_* / exec_* / cdfart_* / URLs as Vault ids.
 */

import {
  isCdfCanonicalArtifactId,
  isExecutionIdShape,
  isMediaArtifactIdShape,
  isVaultAssetObjectIdShape,
} from "../../artifacts/ids";
import { renderError } from "../errors";

function assertVaultId(id: string): void {
  if (
    isMediaArtifactIdShape(id) ||
    isExecutionIdShape(id) ||
    isCdfCanonicalArtifactId(id) ||
    /^https?:\/\//i.test(id)
  ) {
    throw renderError(
      "ASSET_NOT_FOUND",
      `Packaging preview asset must be a Vault ObjectId — rejected identity: ${id}`,
      { vaultAssetId: id },
    );
  }
  if (!isVaultAssetObjectIdShape(id)) {
    throw renderError(
      "ASSET_NOT_FOUND",
      `Invalid vault asset id shape (expected 24-hex ObjectId): ${id}`,
      { vaultAssetId: id },
    );
  }
}

function readPreviewId(obj: unknown): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const id = (obj as { vaultAssetId?: unknown }).vaultAssetId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

export type PackagingPreviewSelectOptions = {
  /** Prefer this stable entity id (surface / view / sku / direction). */
  entityId?: string;
};

/**
 * Resolve which previewAssetRef to materialize for a Packaging artifact payload.
 * Does not invent previews. Ambiguous multi-preview without entityId → error.
 */
export function selectPackagingPreviewVaultId(
  data: Record<string, unknown>,
  opts: PackagingPreviewSelectOptions = {},
): string {
  const entityId = opts.entityId?.trim();

  // Root-level preview (front-pack)
  const root = readPreviewId(data.previewAssetRef);
  if (root && (!entityId || entityId === data.frontId)) {
    assertVaultId(root);
    return root;
  }

  const candidates = data.candidates as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(candidates)) {
    const pick =
      (entityId
        ? candidates.find((c) => c.id === entityId)
        : undefined) ??
      (typeof data.selectedCandidateId === "string"
        ? candidates.find((c) => c.id === data.selectedCandidateId)
        : undefined);
    if (pick) {
      const id = readPreviewId(pick.previewAssetRef);
      if (id) {
        assertVaultId(id);
        return id;
      }
      throw renderError(
        "ARTIFACT_NOT_RENDERABLE",
        `Packaging 3D candidate ${String(pick.id)} has no previewAssetRef — raster-only structure without asset cannot invent GLB/scene`,
        { entityId: pick.id },
      );
    }
    if (entityId) {
      throw renderError(
        "ARTIFACT_NOT_RENDERABLE",
        `Packaging direction candidate not found: ${entityId}`,
      );
    }
  }

  const surfaces = data.surfaces as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(surfaces)) {
    const withPreview = surfaces
      .map((s) => ({ id: String(s.id ?? ""), vaultId: readPreviewId(s.previewAssetRef) }))
      .filter((s) => s.vaultId);
    if (entityId) {
      const hit = withPreview.find((s) => s.id === entityId);
      if (!hit?.vaultId) {
        throw renderError(
          "ARTIFACT_NOT_RENDERABLE",
          `Packaging surface ${entityId} has no previewAssetRef`,
        );
      }
      assertVaultId(hit.vaultId);
      return hit.vaultId;
    }
    if (withPreview.length === 1) {
      assertVaultId(withPreview[0]!.vaultId!);
      return withPreview[0]!.vaultId!;
    }
    if (withPreview.length > 1) {
      throw renderError(
        "RENDER_REQUEST_INVALID",
        "Multiple surface previews — pass options.extras.entityId",
        { candidates: withPreview.map((s) => s.id) },
      );
    }
  }

  const views = data.views as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(views)) {
    const withPreview = views
      .map((v) => ({ id: String(v.id ?? ""), vaultId: readPreviewId(v.previewAssetRef) }))
      .filter((v) => v.vaultId);
    if (entityId) {
      const hit = withPreview.find((v) => v.id === entityId);
      if (!hit?.vaultId) {
        throw renderError(
          "ARTIFACT_NOT_RENDERABLE",
          `Packaging view ${entityId} has no previewAssetRef`,
        );
      }
      assertVaultId(hit.vaultId);
      return hit.vaultId;
    }
    if (withPreview.length === 1) {
      assertVaultId(withPreview[0]!.vaultId!);
      return withPreview[0]!.vaultId!;
    }
    if (withPreview.length > 1) {
      throw renderError(
        "RENDER_REQUEST_INVALID",
        "Multiple view previews — pass options.extras.entityId",
        { candidates: withPreview.map((v) => v.id) },
      );
    }
  }

  const skus = data.skus as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(skus)) {
    const withPreview = skus
      .map((s) => ({ id: String(s.id ?? ""), vaultId: readPreviewId(s.previewAssetRef) }))
      .filter((s) => s.vaultId);
    if (entityId) {
      const hit = withPreview.find((s) => s.id === entityId);
      if (!hit?.vaultId) {
        throw renderError(
          "ARTIFACT_NOT_RENDERABLE",
          `Packaging SKU ${entityId} has no previewAssetRef`,
        );
      }
      assertVaultId(hit.vaultId);
      return hit.vaultId;
    }
    if (withPreview.length === 1) {
      assertVaultId(withPreview[0]!.vaultId!);
      return withPreview[0]!.vaultId!;
    }
    if (withPreview.length > 1) {
      throw renderError(
        "RENDER_REQUEST_INVALID",
        "Multiple SKU previews — pass options.extras.entityId",
        { candidates: withPreview.map((s) => s.id) },
      );
    }
  }

  if (root) {
    assertVaultId(root);
    return root;
  }

  throw renderError(
    "ARTIFACT_NOT_RENDERABLE",
    "Packaging artifact has no previewAssetRef — cannot invent raster/geometry representation",
  );
}

/** All Vault preview ids referenced by the payload (for pre-resolve). */
export function collectPackagingPreviewVaultIds(
  data: Record<string, unknown>,
  opts: PackagingPreviewSelectOptions = {},
): string[] {
  try {
    return [selectPackagingPreviewVaultId(data, opts)];
  } catch {
    // Still collect any valid root/list previews for requireAll=false paths
    const ids = new Set<string>();
    const root = readPreviewId(data.previewAssetRef);
    if (root && isVaultAssetObjectIdShape(root)) ids.add(root);
    for (const listKey of ["candidates", "surfaces", "views", "skus"] as const) {
      const list = data[listKey] as Array<Record<string, unknown>> | undefined;
      for (const item of list ?? []) {
        const id = readPreviewId(item.previewAssetRef);
        if (id && isVaultAssetObjectIdShape(id)) ids.add(id);
      }
    }
    return [...ids].sort();
  }
}
