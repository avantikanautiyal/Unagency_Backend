/**
 * Asset-backed raster renderers (Packaging, Social Media) store one Vault
 * image. A download in another format must really be that format: PNG↔JPG is
 * re-encoded and PDF wraps the raster on a page — never mislabelled bytes.
 */

import { renderError } from "./errors";
import type { CdfRenderFormat } from "./types";
import { convertRasterImage } from "../../media/delivery/image-format-converter";
import { wrapRasterImageAsPdf } from "../../media/delivery/raster-pdf-export";

/** Formats an asset-backed raster can be delivered in. */
export const ASSET_RASTER_FORMATS = ["png", "jpg", "pdf"] as const;

export function isAssetRasterFormat(format: string): boolean {
  return (ASSET_RASTER_FORMATS as readonly string[]).includes(format);
}

export function detectRasterMime(bytes: Uint8Array): string | undefined {
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
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(8, 12)).toString("latin1") === "WEBP") {
    return "image/webp";
  }
  return undefined;
}

export async function rasterOutputForFormat(
  source: Uint8Array,
  format: CdfRenderFormat,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const sourceMime = detectRasterMime(source) ?? "image/png";
  const bytes = Buffer.from(source);
  if (format === "pdf") {
    const pdf = await wrapRasterImageAsPdf({ bytes, sourceMime });
    if (!pdf.ok) {
      throw renderError("ARTIFACT_NOT_RENDERABLE", pdf.error.message);
    }
    return { bytes: new Uint8Array(pdf.value.bytes), mimeType: pdf.value.contentType };
  }
  if (format === "png" || format === "jpg") {
    const wantMime = format === "jpg" ? "image/jpeg" : "image/png";
    if (sourceMime === wantMime) return { bytes: new Uint8Array(bytes), mimeType: wantMime };
    const converted = convertRasterImage({ bytes, sourceMime, targetFormat: format });
    if (!converted.ok) {
      // Never fail a download over a re-encode: deliver the stored raster,
      // labelled with its true type.
      return { bytes: new Uint8Array(bytes), mimeType: sourceMime };
    }
    return {
      bytes: new Uint8Array(converted.value.bytes),
      mimeType: converted.value.contentType,
    };
  }
  return { bytes: new Uint8Array(bytes), mimeType: sourceMime };
}
