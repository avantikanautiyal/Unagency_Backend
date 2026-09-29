/**
 * Multi-file download bundles (e.g. Logo Pack) — ZIP of tenant-owned
 * artifact blobs, with raster sources delivered as PNG, JPG and PDF.
 */

import { failure, success, type Result } from "../../core/result";
import { ValidationError } from "../../core/errors";
import {
  convertRasterImage,
  formatFromMime,
  mimeForRasterFormat,
  type RasterDownloadFormat,
} from "./image-format-converter";
import { wrapRasterImageAsPdf } from "./raster-pdf-export";

export type BundleFormat = RasterDownloadFormat | "pdf";

export const DEFAULT_BUNDLE_FORMATS: readonly BundleFormat[] = ["png", "jpg", "pdf"];

export type BundleSourceFile = {
  readonly name: string;
  readonly bytes: Buffer;
  readonly mimeType: string;
};

const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "video/mp4": "mp4",
};

/** File-system safe, human-readable entry / archive name. */
export function sanitizeBundleName(raw: string, fallback = "file"): string {
  const cleaned = raw
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
  return cleaned || fallback;
}

function uniqueName(base: string, used: Set<string>): string {
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export async function buildArtifactBundleZip(input: {
  readonly files: readonly BundleSourceFile[];
  readonly formats?: readonly BundleFormat[];
  readonly readme?: string;
}): Promise<Result<{ readonly bytes: Buffer; readonly entryNames: readonly string[] }>> {
  if (input.files.length === 0) {
    return failure(new ValidationError("Bundle has no files"));
  }
  const formats = input.formats?.length ? input.formats : DEFAULT_BUNDLE_FORMATS;
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const entryNames: string[] = [];
  const usedBases = new Set<string>();

  for (const file of input.files) {
    const base = uniqueName(sanitizeBundleName(file.name), usedBases);
    const mime = file.mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
    const sourceRaster = formatFromMime(mime);

    if (!sourceRaster) {
      const ext = EXTENSION_BY_MIME[mime] ?? "bin";
      const entry = `${base}.${ext}`;
      zip.file(entry, file.bytes);
      entryNames.push(entry);
      continue;
    }

    for (const format of formats) {
      const entry = `${base}.${format}`;
      if (format === "pdf") {
        const pdf = await wrapRasterImageAsPdf({ bytes: file.bytes, sourceMime: mime });
        if (!pdf.ok) return pdf;
        zip.file(entry, pdf.value.bytes);
      } else if (format === sourceRaster) {
        zip.file(entry, file.bytes);
      } else {
        const converted = convertRasterImage({
          bytes: file.bytes,
          sourceMime: mimeForRasterFormat(sourceRaster),
          targetFormat: format,
        });
        if (!converted.ok) return converted;
        zip.file(entry, converted.value.bytes);
      }
      entryNames.push(entry);
    }
  }

  if (input.readme?.trim()) {
    zip.file("README.txt", `${input.readme.trim()}\n`);
    entryNames.push("README.txt");
  }

  const bytes = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  return success({ bytes, entryNames });
}
