/**
 * Wrap a raster image in a single-page print-ready PDF for download delivery.
 */

import PDFDocument from "pdfkit";
import { PNG } from "pngjs";
import * as jpeg from "jpeg-js";
import { failure, success, type Result } from "../../core/result";
import { ValidationError } from "../../core/errors";
import { formatFromMime } from "./image-format-converter";

function decodeRasterDimensions(
  bytes: Buffer,
  sourceMime: string,
): { width: number; height: number } | undefined {
  const format = formatFromMime(sourceMime);
  if (!format) return undefined;
  try {
    if (format === "png") {
      const png = PNG.sync.read(bytes);
      return { width: png.width, height: png.height };
    }
    const decoded = jpeg.decode(bytes, { useTArray: true });
    return { width: decoded.width, height: decoded.height };
  } catch {
    return undefined;
  }
}

export function canExportRasterAsPdf(sourceMime: string | undefined | null): boolean {
  return formatFromMime(sourceMime) != null;
}

export async function wrapRasterImageAsPdf(input: {
  readonly bytes: Buffer;
  readonly sourceMime: string;
}): Promise<Result<{ readonly bytes: Buffer; readonly contentType: string }>> {
  if (!canExportRasterAsPdf(input.sourceMime)) {
    return failure(
      new ValidationError(
        `Cannot export ${input.sourceMime || "unknown"} as PDF`,
      ),
    );
  }

  const dims = decodeRasterDimensions(input.bytes, input.sourceMime);
  const maxEdge = 595; // A4 width pt — scale down large packaging art for PDF page
  let pageW = dims?.width ?? maxEdge;
  let pageH = dims?.height ?? maxEdge;
  if (pageW > maxEdge || pageH > maxEdge) {
    const scale = maxEdge / Math.max(pageW, pageH);
    pageW = Math.max(72, Math.round(pageW * scale));
    pageH = Math.max(72, Math.round(pageH * scale));
  }

  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 0, size: [pageW, pageH] });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => {
      resolve(
        success({
          bytes: Buffer.concat(chunks),
          contentType: "application/pdf",
        }),
      );
    });
    doc.on("error", (err) => {
      resolve(
        failure(
          new ValidationError(
            err instanceof Error
              ? `PDF export failed: ${err.message}`
              : "PDF export failed",
          ),
        ),
      );
    });

    try {
      doc.image(input.bytes, 0, 0, { width: pageW, height: pageH });
      doc.end();
    } catch (err) {
      resolve(
        failure(
          new ValidationError(
            err instanceof Error
              ? `PDF export failed: ${err.message}`
              : "PDF export failed",
          ),
        ),
      );
    }
  });
}
