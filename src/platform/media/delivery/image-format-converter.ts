/**
 * Raster download conversion for artifact media delivery.
 * Supports PNG ↔ JPG only (formats the pipeline can actually produce).
 * Does not invent SVG/PDF from raster blobs.
 */

import { PNG } from "pngjs";
import * as jpeg from "jpeg-js";
import { failure, success, type Result } from "../../core/result";
import { ValidationError } from "../../core/errors";

export type RasterDownloadFormat = "png" | "jpg";

export function normalizeRasterFormat(
  raw: string | undefined | null
): RasterDownloadFormat | undefined {
  if (!raw) return undefined;
  const f = raw.trim().toLowerCase();
  if (f === "jpeg" || f === "jpg") return "jpg";
  if (f === "png") return "png";
  return undefined;
}

export function formatFromMime(
  mimeType: string | undefined | null
): RasterDownloadFormat | undefined {
  const mime = (mimeType ?? "").toLowerCase().split(";")[0]?.trim() ?? "";
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  return undefined;
}

export function mimeForRasterFormat(format: RasterDownloadFormat): string {
  return format === "png" ? "image/png" : "image/jpeg";
}

/** Formats a stored raster blob can be delivered as (with conversion). */
export function convertibleRasterFormats(
  sourceMime: string | undefined | null
): readonly RasterDownloadFormat[] {
  const src = formatFromMime(sourceMime);
  if (!src) return [];
  return ["png", "jpg"];
}

export function canConvertRasterFormat(input: {
  readonly sourceMime: string | undefined | null;
  readonly requestedFormat: string;
}): boolean {
  const src = formatFromMime(input.sourceMime);
  const target = normalizeRasterFormat(input.requestedFormat);
  if (!src || !target) return false;
  return true;
}

export function convertRasterImage(input: {
  readonly bytes: Buffer;
  readonly sourceMime: string;
  readonly targetFormat: RasterDownloadFormat;
}): Result<{ readonly bytes: Buffer; readonly contentType: string }> {
  const sourceFormat = formatFromMime(input.sourceMime);
  if (!sourceFormat) {
    return failure(
      new ValidationError(
        `Cannot convert non-raster image (${input.sourceMime || "unknown"})`
      )
    );
  }

  if (sourceFormat === input.targetFormat) {
    return success({
      bytes: input.bytes,
      contentType: mimeForRasterFormat(input.targetFormat),
    });
  }

  try {
    const rgba = decodeToRgba(input.bytes, sourceFormat);
    if (input.targetFormat === "png") {
      const png = new PNG({ width: rgba.width, height: rgba.height });
      rgba.data.copy(png.data);
      const encoded = PNG.sync.write(png);
      return success({
        bytes: Buffer.from(encoded),
        contentType: "image/png",
      });
    }
    const encoded = jpeg.encode(
      {
        data: rgba.data,
        width: rgba.width,
        height: rgba.height,
      },
      92
    );
    return success({
      bytes: Buffer.from(encoded.data),
      contentType: "image/jpeg",
    });
  } catch (err) {
    return failure(
      new ValidationError(
        err instanceof Error
          ? `Image format conversion failed: ${err.message}`
          : "Image format conversion failed"
      )
    );
  }
}

function decodeToRgba(
  bytes: Buffer,
  format: RasterDownloadFormat
): { data: Buffer; width: number; height: number } {
  if (format === "png") {
    const png = PNG.sync.read(bytes);
    return {
      data: Buffer.from(png.data),
      width: png.width,
      height: png.height,
    };
  }
  const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
  return {
    data: Buffer.from(decoded.data),
    width: decoded.width,
    height: decoded.height,
  };
}
