/**
 * Reference-file classification and document text extraction.
 *
 * Image generators only accept real images. Vault files attached to a visual
 * job can be PDFs, Word documents, ZIPs or slides — sent as an image they
 * fail with HTTP 400 at every provider. This module decides what a file
 * really is (stored type + leading bytes) and, for documents we can read,
 * pulls their text so it can inform the brief instead.
 *
 * Uses packages already installed: pdfjs-dist (PDF) and jszip (DOCX).
 */

import {
  isProviderImageMimeType,
  sniffFileType,
} from "../platform/providers/common/reference-image-guard";

export { isProviderImageMimeType, sniffFileType };

export const PDF_MIME_TYPE = "application/pdf";
export const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Text sent per document; keeps image prompts well under provider caps. */
export const DOCUMENT_EXCERPT_MAX_CHARS = 2_000;
/** Pages read from a PDF — the excerpt cap is reached long before this. */
const PDF_MAX_PAGES = 8;

function baseMime(mime: string | undefined): string {
  return (mime ?? "").toLowerCase().split(";")[0]?.trim() ?? "";
}

/**
 * image/audio/video: provider inputs. document: never sent as a file.
 * unsupported_image: an image type providers reject (SVG, HEIC, TIFF).
 * unknown: untyped bytes we cannot identify — left as before; the image
 * boundary guard still keeps them away from image models.
 */
export type ReferenceFileKind =
  | "image"
  | "audio"
  | "video"
  | "document"
  | "unsupported_image"
  | "unknown";

/**
 * What a resolved vault file really is. Leading bytes win over the stored
 * type, so a ZIP saved as ".png" is still treated as a document.
 */
export function classifyReferenceFile(input: {
  readonly mimeType?: string;
  readonly leadingBytes?: Uint8Array;
}): { kind: ReferenceFileKind; mimeType: string } {
  const stored = baseMime(input.mimeType) || "application/octet-stream";
  const sniffed = input.leadingBytes?.length ? sniffFileType(input.leadingBytes) : undefined;
  if (sniffed?.startsWith("image/")) return { kind: "image", mimeType: sniffed };
  if (sniffed === "application/pdf") return { kind: "document", mimeType: PDF_MIME_TYPE };
  if (sniffed === "application/zip") {
    // DOCX/PPTX/XLSX are ZIPs too — keep the more specific stored type.
    return {
      kind: "document",
      mimeType: stored.startsWith("application/") ? stored : "application/zip",
    };
  }
  if (isProviderImageMimeType(stored)) return { kind: "image", mimeType: stored };
  if (stored.startsWith("audio/")) return { kind: "audio", mimeType: stored };
  if (stored.startsWith("video/")) return { kind: "video", mimeType: stored };
  if (stored.startsWith("image/")) return { kind: "unsupported_image", mimeType: stored };
  if (stored === "application/octet-stream") return { kind: "unknown", mimeType: stored };
  return { kind: "document", mimeType: stored };
}

/** True for document types we can read text from. */
export function isExtractableDocumentMimeType(mime: string | undefined): boolean {
  const m = baseMime(mime);
  return (
    m === PDF_MIME_TYPE ||
    m === DOCX_MIME_TYPE ||
    m === "text/plain" ||
    m === "text/markdown"
  );
}

function normalizeExtractedText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function capExcerpt(text: string, maxChars = DOCUMENT_EXCERPT_MAX_CHARS): string {
  const clean = normalizeExtractedText(text);
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars);
  const lastBreak = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(". "));
  return `${(lastBreak > maxChars * 0.6 ? cut.slice(0, lastBreak + 1) : cut).trimEnd()} …`;
}

type PdfJsModule = {
    getDocument: (src: Record<string, unknown>) => {
      promise: Promise<{
        numPages: number;
        getPage: (n: number) => Promise<{
          getTextContent: () => Promise<{ items: Array<{ str?: string; hasEOL?: boolean }> }>;
          cleanup?: () => void;
        }>;
        destroy: () => Promise<void>;
      }>;
    };
};

let pdfjsModule: PdfJsModule | undefined;

/**
 * pdfjs prints "Cannot polyfill DOMMatrix/Path2D (canvas)" on load. Those
 * only matter for rendering, not text extraction, so keep them out of logs.
 */
function loadPdfJs(): PdfJsModule {
  if (pdfjsModule) return pdfjsModule;
  const { log, warn } = console;
  const quiet = (orig: (...a: unknown[]) => void) => (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("Cannot polyfill")) return;
    orig(...args);
  };
  console.log = quiet(log);
  console.warn = quiet(warn);
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    pdfjsModule = require("pdfjs-dist/legacy/build/pdf.js") as PdfJsModule;
  } finally {
    console.log = log;
    console.warn = warn;
  }
  return pdfjsModule;
}

async function extractPdfText(bytes: Buffer, maxChars: number): Promise<string> {
  const doc = await loadPdfJs().getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;
  try {
    let out = "";
    const pages = Math.min(doc.numPages, PDF_MAX_PAGES);
    for (let n = 1; n <= pages && out.length < maxChars * 2; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (typeof item.str === "string") out += item.str;
        out += item.hasEOL ? "\n" : " ";
      }
      out += "\n\n";
      page.cleanup?.();
    }
    return out;
  } finally {
    await doc.destroy().catch(() => undefined);
  }
}

async function extractDocxText(bytes: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const JSZip = require("jszip") as {
    loadAsync: (data: Buffer) => Promise<{
      file: (name: string) => { async: (type: "string") => Promise<string> } | null;
    }>;
  };
  const zip = await JSZip.loadAsync(bytes);
  const entry = zip.file("word/document.xml");
  if (!entry) return "";
  const xml = await entry.async("string");
  return xml
    .replace(/<w:tab\/>/g, " ")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Readable text from a document, capped to an excerpt. Undefined when the
 * type is unsupported, the file has no text layer, or parsing fails —
 * extraction never blocks generation.
 */
export async function extractDocumentExcerpt(input: {
  readonly mimeType: string;
  readonly bytes: Buffer;
  readonly maxChars?: number;
}): Promise<string | undefined> {
  const maxChars = input.maxChars ?? DOCUMENT_EXCERPT_MAX_CHARS;
  const mime = baseMime(input.mimeType);
  try {
    let raw = "";
    if (mime === "text/plain" || mime === "text/markdown") {
      raw = input.bytes.toString("utf8");
    } else if (mime === PDF_MIME_TYPE) {
      raw = await extractPdfText(input.bytes, maxChars);
    } else if (mime === DOCX_MIME_TYPE) {
      raw = await extractDocxText(input.bytes);
    } else {
      return undefined;
    }
    const excerpt = capExcerpt(raw, maxChars);
    return excerpt.length >= 20 ? excerpt : undefined;
  } catch (err) {
    console.warn(
      JSON.stringify({
        scope: "document_text_extractor",
        event: "extraction_failed",
        mimeType: mime,
        reason: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
      }),
    );
    return undefined;
  }
}
