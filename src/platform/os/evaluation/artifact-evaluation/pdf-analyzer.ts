/**
 * PDF artifact analysis — validates actual PDF bytes and estimates page count.
 */

import type { DocumentArtifactEvidence } from "./types";

export function analyzePdfBytes(bytes: Buffer, sectionCount?: number): DocumentArtifactEvidence {
  const evidence: string[] = [];
  const header = bytes.subarray(0, 5).toString("utf8");
  const isValidPdf = header.startsWith("%PDF-");

  if (!isValidPdf) {
    return Object.freeze({
      evaluated: true,
      isValidPdf: false,
      byteSize: bytes.length,
      sectionCount,
      confidence: "measured",
      evidence: Object.freeze(["invalid PDF header"]),
    });
  }

  const text = bytes.toString("latin1");
  const pageMatches = text.match(/\/Type\s*\/Page\b/g);
  const countMatch = text.match(/\/Count\s+(\d+)/);
  const pageCount = countMatch
    ? Number(countMatch[1])
    : pageMatches?.length ?? undefined;

  const titleMatch = text.match(/\/Title\s*\(([^)]+)\)/);
  const titlePresent = Boolean(titleMatch?.[1]?.trim());
  const streamTextMatches = text.match(/\(([^()\\]{3,120})\)/g) ?? [];
  const extractedTextLength = streamTextMatches
    .map((m) => m.slice(1, -1).trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim().length;

  evidence.push(`PDF valid, estimated pages=${pageCount ?? "unknown"}`);
  if (titlePresent) evidence.push(`title metadata present`);
  if (extractedTextLength > 0) evidence.push(`extracted text length=${extractedTextLength}`);
  if (sectionCount != null) {
    evidence.push(`structured sections=${sectionCount}`);
  }

  return Object.freeze({
    evaluated: true,
    isValidPdf: true,
    pageCount,
    byteSize: bytes.length,
    sectionCount,
    textLength: extractedTextLength,
    titlePresent,
    confidence: "measured",
    evidence: Object.freeze(evidence),
  });
}

export function analyzeDocumentLayout(
  doc: DocumentArtifactEvidence,
): { score: number; evidence: readonly string[] } {
  const evidence: string[] = [];
  let score = 0;
  if (!doc.isValidPdf) {
    return Object.freeze({ score: 0, evidence: Object.freeze(["invalid PDF artifact"]) });
  }
  score += 40;
  evidence.push("valid PDF artifact");
  if (doc.pageCount && doc.pageCount >= 1) {
    score += 30;
    evidence.push(`page count=${doc.pageCount}`);
  }
  if (doc.byteSize > 2_500) {
    score += 20;
    evidence.push(`designed PDF size=${doc.byteSize} bytes`);
  }
  if ((doc.sectionCount ?? 0) >= 3) {
    score += 10;
    evidence.push(`sections=${doc.sectionCount}`);
  }
  return Object.freeze({
    score: Math.min(100, score),
    evidence: Object.freeze([...evidence, "structural PDF heuristic — not semantic quality assessment"]),
  });
}
