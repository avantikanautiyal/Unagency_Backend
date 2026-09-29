/**
 * M8E — Packaging asset-backed raster pass-through renderer.
 *
 * Confirmed live Packaging downloads are PNG/JPG rasters.
 * Canonical path: previewAssetRef → Vault ObjectId → RenderedFile.
 *
 * Does NOT fabricate dieline geometry, 3D scenes, or AI imagery.
 */

import { PACKAGING_ARTIFACT_KEYS } from "../../artifacts/packaging/keys";
import { isPackagingArtifactKey } from "../../artifacts/packaging/keys";
import { renderError } from "../errors";
import type { ArtifactRenderer, CdfRenderFormat } from "../types";
import { selectPackagingPreviewVaultId } from "./asset-collect";
import { assertPackagingUpstreamExactRefs } from "./upstream";

export const PACKAGING_PREVIEW_RASTER_RENDERER_ID =
  "packaging-preview-raster";
export const PACKAGING_PREVIEW_RASTER_RENDERER_VERSION = "1.0.0";

const RASTER_KEYS = [
  PACKAGING_ARTIFACT_KEYS.threeDDirection,
  PACKAGING_ARTIFACT_KEYS.frontPack,
  PACKAGING_ARTIFACT_KEYS.completePack,
  PACKAGING_ARTIFACT_KEYS.views,
  PACKAGING_ARTIFACT_KEYS.skuAdaptations,
] as const;

function detectMime(bytes: Uint8Array, format: CdfRenderFormat): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  // Honest default from requested format — bytes still pass-through unchanged
  return format === "jpg" ? "image/jpeg" : "image/png";
}

function entityIdFromOptions(
  options: { extras?: Record<string, string | number | boolean | null> },
): string | undefined {
  const e = options.extras;
  if (!e) return undefined;
  const raw =
    e.entityId ?? e.surfaceId ?? e.viewId ?? e.skuId ?? e.candidateId;
  return raw == null ? undefined : String(raw);
}

export function createPackagingPreviewRasterRenderer(): ArtifactRenderer {
  return {
    capability: {
      rendererId: PACKAGING_PREVIEW_RASTER_RENDERER_ID,
      rendererVersion: PACKAGING_PREVIEW_RASTER_RENDERER_VERSION,
      artifactKeys: [...RASTER_KEYS],
      formats: ["png", "jpg"],
      purposes: ["preview", "final"],
      description:
        "Deterministic Vault previewAssetRef pass-through for Packaging (PNG/JPG). Not a creative compositor.",
    },
    canRender({ artifactKey, format }) {
      return (
        isPackagingArtifactKey(artifactKey) &&
        (RASTER_KEYS as readonly string[]).includes(artifactKey) &&
        (format === "png" || format === "jpg")
      );
    },
    async render(input) {
      if (input.data.geometryUnresolved === true && input.format === "svg") {
        throw renderError(
          "ARTIFACT_NOT_RENDERABLE",
          "Cannot render dieline geometry while unresolved",
        );
      }
      if (input.data.structuredSceneUnresolved === true) {
        // Raster preview still allowed — GLB/scene not
        // (format svg/pdf/glb never reach here via canRender)
      }

      assertPackagingUpstreamExactRefs(
        input.artifactKey,
        input.data as Record<string, unknown>,
        {
          organizationId: input.organizationId,
          projectId: input.projectId,
        },
      );

      const entityId = entityIdFromOptions(input.options);
      const vaultAssetId = selectPackagingPreviewVaultId(
        input.data as Record<string, unknown>,
        { entityId },
      );

      const bytes = input.resolvedAssets.get(vaultAssetId);
      if (!bytes || bytes.byteLength === 0) {
        throw renderError(
          "ASSET_NOT_FOUND",
          `Packaging preview vault asset not resolved: ${vaultAssetId}`,
          { vaultAssetId },
        );
      }

      // Pass-through only — no AI, no OCR, no recomposition
      return {
        bytes: new Uint8Array(bytes),
        mimeType: detectMime(bytes, input.format),
      };
    },
  };
}

/**
 * Explicit unsupported Packaging formats — registered so canRender is false
 * and resolveRenderer throws RENDER_FORMAT_UNSUPPORTED (no silent fallback).
 * Dieline SVG/PDF geometry and GLB are intentionally not registered.
 */
export function packagingUnsupportedFormatMessage(
  artifactKey: string,
  format: string,
): string {
  if (
    artifactKey === PACKAGING_ARTIFACT_KEYS.dieline &&
    (format === "svg" || format === "pdf")
  ) {
    return "Packaging dieline geometry rendering is unsupported while structured cut/fold paths are unresolved — refusing to fabricate paths";
  }
  if (
    artifactKey === PACKAGING_ARTIFACT_KEYS.threeDDirection &&
    (format === "svg" || format === "pdf" || format === "mp4")
  ) {
    return "Packaging 3D scene-graph representations are unsupported — structured scene unresolved; raster preview only via png/jpg";
  }
  if (artifactKey === PACKAGING_ARTIFACT_KEYS.routes) {
    return "Packaging routes is structured text — no file representation renderer";
  }
  return `No Packaging renderer registered for ${artifactKey} format=${format}`;
}
