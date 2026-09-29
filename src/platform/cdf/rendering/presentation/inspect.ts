/**
 * Inspect helpers for M5B tests — extract text from generated PPTX/PDF bytes.
 */

import { analyzePptxBytes } from "../../../os/evaluation/artifact-evaluation/ooxml-analyzer";
import { analyzePdfBytes } from "../../../os/evaluation/artifact-evaluation/pdf-analyzer";

function stripXmlTags(xml: string): string {
  return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function extractPptxSlideTexts(bytes: Uint8Array): Promise<{
  isValidPptx: boolean;
  slideCount: number;
  texts: string[];
  joined: string;
}> {
  const buf = Buffer.from(bytes);
  const analysis = await analyzePptxBytes(buf);
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/i.test(p))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)/i)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)/i)?.[1] ?? 0);
      return na - nb;
    });
  const texts: string[] = [];
  for (const path of slidePaths) {
    const xml = await zip.files[path]!.async("string");
    texts.push(stripXmlTags(xml));
  }
  return {
    isValidPptx: Boolean(analysis.isValidPptx),
    slideCount: analysis.slideCount ?? slidePaths.length,
    texts,
    joined: texts.join("\n"),
  };
}

export function extractPdfLiteralTexts(bytes: Uint8Array): {
  isValidPdf: boolean;
  pageCount?: number;
  literals: string[];
  joined: string;
} {
  const buf = Buffer.from(bytes);
  const analysis = analyzePdfBytes(buf);
  const text = buf.toString("latin1");
  const parenLiterals =
    text.match(/\(([^\\()]{1,400})\)/g)?.map((m) => m.slice(1, -1)) ?? [];

  // Reconstruct TJ arrays so kerning splits don't insert spaces:
  // [<546865205072> 20 <6f62> 10 <6c656d>] TJ  → "The Problem"
  const tjLiterals: string[] = [];
  const tjArrays = text.match(/\[[\s\S]*?\]\s*TJ/g) ?? [];
  for (const arr of tjArrays) {
    const parts = [...arr.matchAll(/<([0-9A-Fa-f]+)>/g)].map((m) => {
      const hex = m[1]!;
      if (hex.length % 2 !== 0) return "";
      try {
        return Buffer.from(hex, "hex").toString("latin1");
      } catch {
        return "";
      }
    });
    const joinedParts = parts.join("").replace(/\u0000/g, "");
    if (joinedParts) tjLiterals.push(joinedParts);
  }

  const literals = [...parenLiterals, ...tjLiterals]
    .map((l) => l.replace(/\u0000/g, ""))
    .filter(Boolean);
  const joined = literals.join(" ").replace(/\s+/g, " ");
  return {
    isValidPdf: Boolean(analysis.isValidPdf),
    pageCount: analysis.pageCount,
    literals,
    joined,
  };
}

export async function assertPptxContainsText(
  bytes: Uint8Array,
  expected: string,
): Promise<void> {
  const { isValidPptx, joined } = await extractPptxSlideTexts(bytes);
  if (!isValidPptx) throw new Error("PPTX not parseable");
  if (!joined.includes(expected)) {
    throw new Error(`PPTX missing expected text: ${expected}`);
  }
}

export function assertPdfContainsText(bytes: Uint8Array, expected: string): void {
  const { isValidPdf, joined } = extractPdfLiteralTexts(bytes);
  if (!isValidPdf) throw new Error("PDF not parseable");
  if (!joined.includes(expected)) {
    throw new Error(`PDF missing expected text: ${expected}`);
  }
}
