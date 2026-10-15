/**
 * Download/Vault format exports beyond raster PNG↔JPG and raster→PDF:
 *   HTML (emailers, newsletters)  → PDF, PNG
 *   MP4 (short loops, GIFs)       → GIF
 *   Plain text / Markdown (copy)  → PDF, DOCX
 *
 * One table drives both validation (may this format be offered?) and the
 * conversion itself, so the two cannot drift.
 */

import { failure, success, type Result } from "../../core/result";
import { ValidationError } from "../../core/errors";

export type ExtendedExportFormat = "pdf" | "png" | "gif" | "docx";

type ExportedFile = { bytes: Buffer; contentType: string };

function baseMime(mime: string): string {
  return mime.toLowerCase().split(";")[0]?.trim() ?? "";
}

function isHtml(mime: string): boolean {
  const m = baseMime(mime);
  return m === "text/html" || m === "application/xhtml+xml";
}

function isText(mime: string): boolean {
  const m = baseMime(mime);
  return m === "text/plain" || m === "text/markdown";
}

function isVideo(mime: string): boolean {
  return baseMime(mime).startsWith("video/");
}

/** Extended formats a stored file of `sourceMime` can be exported to. */
export function extendedExportFormatsForMime(sourceMime: string): ExtendedExportFormat[] {
  if (isHtml(sourceMime)) return ["pdf", "png"];
  if (isVideo(sourceMime)) return ["gif"];
  if (isText(sourceMime)) return ["pdf", "docx"];
  return [];
}

export function canExportExtendedFormat(sourceMime: string, requested: string): boolean {
  const target = requested.trim().toLowerCase() as ExtendedExportFormat;
  return extendedExportFormatsForMime(sourceMime).includes(target);
}

async function withBrowser<T>(run: (page: import("puppeteer").Page) => Promise<T>): Promise<T> {
  const puppeteer = (await import("puppeteer")).default;
  // Same launch settings as invoice rendering, which already runs in production.
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"],
    ...(process.env.PRODUCTION_PATH_PUPPITER
      ? { executablePath: process.env.PRODUCTION_PATH_PUPPITER }
      : {}),
  });
  try {
    const page = await browser.newPage();
    return await run(page);
  } finally {
    await browser.close();
  }
}

async function exportHtml(bytes: Buffer, target: "pdf" | "png"): Promise<ExportedFile> {
  const html = bytes.toString("utf8");
  return withBrowser(async (page) => {
    // Email layouts are ~600px wide; render at desktop width so they centre.
    await page.setViewport({ width: 800, height: 1200, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30_000 });
    if (target === "pdf") {
      const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
      return { bytes: Buffer.from(pdf), contentType: "application/pdf" };
    }
    const png = await page.screenshot({ type: "png", fullPage: true });
    return { bytes: Buffer.from(png), contentType: "image/png" };
  });
}

/** Plain text / Markdown → document plan (title + headed sections). */
export function textToDocumentPlan(text: string): {
  title: string;
  sections: { heading: string; body: string }[];
} {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let title = "";
  const sections: { heading: string; body: string }[] = [];
  let current: { heading: string; body: string[] } | undefined;
  const flush = () => {
    if (current && (current.heading || current.body.join("").trim())) {
      sections.push({ heading: current.heading, body: current.body.join("\n").trim() });
    }
  };
  for (const raw of lines) {
    const heading = raw.match(/^\s{0,3}#{1,6}\s+(.*)$/);
    if (heading) {
      const text = heading[1]!.trim();
      if (!title) {
        title = text;
        continue;
      }
      flush();
      current = { heading: text, body: [] };
      continue;
    }
    if (!current) current = { heading: "", body: [] };
    current.body.push(raw.replace(/^\s*[-*]\s+/, "• ").replace(/\*\*(.+?)\*\*/g, "$1"));
  }
  flush();
  if (!title) {
    const first = sections[0]?.body.split("\n").find((l) => l.trim());
    title = (first ?? "Document").slice(0, 120);
  }
  return { title, sections: sections.length ? sections : [{ heading: "", body: text.trim() }] };
}

/** Brand styling for written-document PDFs. */
export type DocumentBrand = { readonly brandName?: string; readonly brandColors?: readonly string[] };

async function exportText(
  bytes: Buffer,
  target: "pdf" | "docx",
  brand?: DocumentBrand,
): Promise<ExportedFile> {
  const { buildDocumentPdf, buildDocumentDocx } = await import(
    "../../os/delivery/document-export-service"
  );
  const plan = textToDocumentPlan(bytes.toString("utf8"));
  if (target === "pdf") {
    return { bytes: await buildDocumentPdf(plan, brand), contentType: "application/pdf" };
  }
  return {
    bytes: await buildDocumentDocx(plan),
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
}

async function exportVideoAsGif(bytes: Buffer): Promise<ExportedFile> {
  const { convertMp4ToGif } = await import("../../providers/video/common/video-ffmpeg");
  return { bytes: await convertMp4ToGif({ videoBytes: bytes }), contentType: "image/gif" };
}

export async function exportExtendedFormat(input: {
  readonly bytes: Buffer;
  readonly sourceMime: string;
  readonly requested: string;
  readonly brand?: DocumentBrand;
}): Promise<Result<ExportedFile>> {
  const target = input.requested.trim().toLowerCase();
  if (!canExportExtendedFormat(input.sourceMime, target)) {
    return failure(
      new ValidationError(`Download format "${input.requested}" is not supported for this artifact`),
    );
  }
  try {
    if (isHtml(input.sourceMime)) {
      return success(await exportHtml(input.bytes, target as "pdf" | "png"));
    }
    if (isVideo(input.sourceMime)) return success(await exportVideoAsGif(input.bytes));
    return success(await exportText(input.bytes, target as "pdf" | "docx", input.brand));
  } catch (err) {
    return failure(
      new ValidationError(
        `Could not export this file as ${target.toUpperCase()}: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }
}
