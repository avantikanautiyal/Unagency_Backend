/**
 * Combine several raster images into one file — a multi-page PDF (one page
 * per image) or a PPTX deck (one full-bleed slide per image). Used by
 * multi-board download bundles (e.g. the Identity Kit).
 */

import PDFDocument from "pdfkit";
import PptxGenJS from "pptxgenjs";
import { failure, success, type Result } from "../../core/result";
import { ValidationError } from "../../core/errors";
import { formatFromMime, mimeForRasterFormat } from "./image-format-converter";
import { decodeRasterDimensions } from "./raster-pdf-export";

export type CombinedRasterSource = {
  readonly bytes: Buffer;
  readonly mimeType: string;
};

/** A4 long edge in pt — large boards are scaled down to fit a page. */
const MAX_PDF_EDGE = 842;
/** 16:9 slide in inches. */
const SLIDE_W = 13.333;
const SLIDE_H = 7.5;

function rasterOnly(sources: readonly CombinedRasterSource[]): CombinedRasterSource[] {
  return sources.filter((s) => formatFromMime(s.mimeType) != null);
}

function fitWithin(
  dims: { width: number; height: number } | undefined,
  maxW: number,
  maxH: number,
): { w: number; h: number } {
  const width = dims?.width ?? maxW;
  const height = dims?.height ?? maxH;
  const scale = Math.min(maxW / width, maxH / height);
  return { w: width * scale, h: height * scale };
}

export async function combineRastersAsPdf(
  sources: readonly CombinedRasterSource[],
): Promise<Result<Buffer>> {
  const images = rasterOnly(sources);
  if (images.length === 0) {
    return failure(new ValidationError("No raster images to combine as PDF"));
  }
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 0, autoFirstPage: false });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(success(Buffer.concat(chunks))));
    doc.on("error", (err) =>
      resolve(
        failure(
          new ValidationError(
            err instanceof Error ? `PDF export failed: ${err.message}` : "PDF export failed",
          ),
        ),
      ),
    );
    try {
      for (const image of images) {
        const dims = decodeRasterDimensions(image.bytes, image.mimeType);
        const { w, h } = fitWithin(dims, MAX_PDF_EDGE, MAX_PDF_EDGE);
        const pageW = Math.max(72, Math.round(w));
        const pageH = Math.max(72, Math.round(h));
        doc.addPage({ size: [pageW, pageH], margin: 0 });
        doc.image(image.bytes, 0, 0, { width: pageW, height: pageH });
      }
      doc.end();
    } catch (err) {
      resolve(
        failure(
          new ValidationError(
            err instanceof Error ? `PDF export failed: ${err.message}` : "PDF export failed",
          ),
        ),
      );
    }
  });
}

export async function combineRastersAsPptx(
  sources: readonly CombinedRasterSource[],
): Promise<Result<Buffer>> {
  const images = rasterOnly(sources);
  if (images.length === 0) {
    return failure(new ValidationError("No raster images to combine as PPTX"));
  }
  try {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    for (const image of images) {
      const format = formatFromMime(image.mimeType)!;
      const dims = decodeRasterDimensions(image.bytes, image.mimeType);
      const { w, h } = fitWithin(dims, SLIDE_W, SLIDE_H);
      const slide = pptx.addSlide();
      slide.background = { color: "FFFFFF" };
      slide.addImage({
        data: `${mimeForRasterFormat(format)};base64,${image.bytes.toString("base64")}`,
        x: (SLIDE_W - w) / 2,
        y: (SLIDE_H - h) / 2,
        w,
        h,
      });
    }
    const bytes = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
    return success(bytes);
  } catch (err) {
    return failure(
      new ValidationError(
        err instanceof Error ? `PPTX export failed: ${err.message}` : "PPTX export failed",
      ),
    );
  }
}
