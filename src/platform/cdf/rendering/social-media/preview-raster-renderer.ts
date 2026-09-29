/**
 * M9E — Social Media asset-backed raster pass-through renderer.
 *
 * Confirmed representation: PNG/JPG via previewAssetRef → Vault ObjectId.
 * Does NOT invent on-image layout, OCR, or AI imagery (elementLayoutUnresolved).
 */

import {
  isSocialMediaArtifactKey,
  SOCIAL_MEDIA_ARTIFACT_KEYS,
} from "../../artifacts/social-media/keys";
import { renderError } from "../errors";
import type { ArtifactRenderer, CdfRenderFormat } from "../types";
import { selectSocialMediaPreviewVaultId } from "./asset-collect";
import { assertSocialMediaUpstreamExactRefs } from "./upstream";

export const SOCIAL_MEDIA_PREVIEW_RASTER_RENDERER_ID =
  "social-media-preview-raster";
export const SOCIAL_MEDIA_PREVIEW_RASTER_RENDERER_VERSION = "1.0.0";

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
  return format === "jpg" ? "image/jpeg" : "image/png";
}

/** Read PNG IHDR width/height when signature present. */
export function readPngDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | undefined {
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    return undefined;
  }
  const width =
    ((bytes[16]! << 24) | (bytes[17]! << 16) | (bytes[18]! << 8) | bytes[19]!) >>>
    0;
  const height =
    ((bytes[20]! << 24) | (bytes[21]! << 16) | (bytes[22]! << 8) | bytes[23]!) >>>
    0;
  return { width, height };
}

function assertCanvasValid(data: Record<string, unknown>): {
  widthPx?: number;
  heightPx?: number;
} {
  const canvas = data.canvas as
    | { widthPx?: unknown; heightPx?: unknown; elementLayoutUnresolved?: unknown }
    | undefined;
  if (!canvas) return {};
  const widthPx = canvas.widthPx;
  const heightPx = canvas.heightPx;
  if (widthPx != null) {
    if (typeof widthPx !== "number" || !Number.isInteger(widthPx) || widthPx < 1) {
      throw renderError(
        "ARTIFACT_NOT_RENDERABLE",
        "Social Media canvas.widthPx must be a positive integer",
      );
    }
  }
  if (heightPx != null) {
    if (
      typeof heightPx !== "number" ||
      !Number.isInteger(heightPx) ||
      heightPx < 1
    ) {
      throw renderError(
        "ARTIFACT_NOT_RENDERABLE",
        "Social Media canvas.heightPx must be a positive integer",
      );
    }
  }
  return {
    widthPx: typeof widthPx === "number" ? widthPx : undefined,
    heightPx: typeof heightPx === "number" ? heightPx : undefined,
  };
}

export function createSocialMediaPreviewRasterRenderer(): ArtifactRenderer {
  return {
    capability: {
      rendererId: SOCIAL_MEDIA_PREVIEW_RASTER_RENDERER_ID,
      rendererVersion: SOCIAL_MEDIA_PREVIEW_RASTER_RENDERER_VERSION,
      artifactKeys: [SOCIAL_MEDIA_ARTIFACT_KEYS.output],
      formats: ["png", "jpg"],
      purposes: ["preview", "final"],
      description:
        "Deterministic Vault previewAssetRef pass-through for social-media.output (PNG/JPG). Not a creative compositor; does not invent on-image layout.",
    },
    canRender({ artifactKey, format }) {
      return (
        isSocialMediaArtifactKey(artifactKey) &&
        artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.output &&
        (format === "png" || format === "jpg")
      );
    },
    async render(input) {
      const data = input.data as Record<string, unknown>;

      // Explicit: layout unresolved — never invent geometry from onImageCopy
      if (
        input.format === "svg" ||
        input.format === "pdf" ||
        input.format === "mp4"
      ) {
        throw renderError(
          "RENDER_FORMAT_UNSUPPORTED",
          socialMediaUnsupportedFormatMessage(input.artifactKey, input.format),
        );
      }

      assertSocialMediaUpstreamExactRefs(input.artifactKey, data, {
        organizationId: input.organizationId,
        projectId: input.projectId,
      });

      const canvas = assertCanvasValid(data);
      const vaultAssetId = selectSocialMediaPreviewVaultId(data);
      const bytes = input.resolvedAssets.get(vaultAssetId);
      if (!bytes || bytes.byteLength === 0) {
        throw renderError(
          "ASSET_NOT_FOUND",
          `Social Media preview vault asset not resolved: ${vaultAssetId}`,
          { vaultAssetId },
        );
      }

      // When canvas declares dimensions and bytes are PNG, require exact match —
      // never silently resize/crop.
      if (
        input.format === "png" &&
        canvas.widthPx != null &&
        canvas.heightPx != null
      ) {
        const dims = readPngDimensions(bytes);
        if (
          dims &&
          (dims.width !== canvas.widthPx || dims.height !== canvas.heightPx)
        ) {
          throw renderError(
            "ARTIFACT_NOT_RENDERABLE",
            `Social Media PNG dimensions ${dims.width}x${dims.height} do not match canonical canvas ${canvas.widthPx}x${canvas.heightPx} — refusing silent resize`,
            {
              pngWidth: dims.width,
              pngHeight: dims.height,
              canvasWidth: canvas.widthPx,
              canvasHeight: canvas.heightPx,
            },
          );
        }
      }

      return {
        bytes: new Uint8Array(bytes),
        mimeType: detectMime(bytes, input.format),
      };
    },
  };
}

export function socialMediaUnsupportedFormatMessage(
  artifactKey: string,
  format: string,
): string {
  if (
    artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.platform ||
    artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference ||
    artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.routes
  ) {
    return `Social Media ${artifactKey} has no file representation renderer`;
  }
  if (format === "gif" || format === "mp4") {
    return "Social Media GIF/MP4 / multi-frame representations are unsupported — single-image creative only";
  }
  if (format === "svg" || format === "pdf") {
    return "Social Media SVG/PDF rendering unsupported — on-image layout unresolved; raster preview only via png/jpg";
  }
  return `No Social Media renderer registered for ${artifactKey} format=${format}`;
}
