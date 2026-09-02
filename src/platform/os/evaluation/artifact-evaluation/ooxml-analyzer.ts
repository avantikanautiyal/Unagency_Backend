/**
 * Priority 4.2 — Objective OOXML artifact analysis (PPTX/DOCX) via ZIP structure inspection.
 */

import type { DocumentArtifactEvidence, PresentationArtifactEvidence } from "./types";

function stripXmlTags(xml: string): string {
  return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function loadZipEntries(bytes: Buffer): Promise<Map<string, Buffer> | undefined> {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(bytes);
    const entries = new Map<string, Buffer>();
    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      entries.set(path, Buffer.from(await file.async("arraybuffer")));
    }
    return entries;
  } catch {
    return undefined;
  }
}

export async function analyzePptxBytes(bytes: Buffer): Promise<PresentationArtifactEvidence> {
  const evidence: string[] = [];
  const entries = await loadZipEntries(bytes);
  if (!entries) {
    return Object.freeze({
      evaluated: true,
      isValidPptx: false,
      byteSize: bytes.length,
      confidence: "measured",
      evidence: Object.freeze(["PPTX ZIP parse failed"]),
    });
  }

  const hasContentTypes = entries.has("[Content_Types].xml");
  const hasPresentation = [...entries.keys()].some((p) => p === "ppt/presentation.xml");
  const slidePaths = [...entries.keys()].filter((p) => /^ppt\/slides\/slide\d+\.xml$/i.test(p));
  const isValidPptx = hasContentTypes && hasPresentation && slidePaths.length > 0;

  if (!isValidPptx) {
    return Object.freeze({
      evaluated: true,
      isValidPptx: false,
      byteSize: bytes.length,
      confidence: "measured",
      evidence: Object.freeze([
        `contentTypes=${hasContentTypes}`,
        `presentation=${hasPresentation}`,
        `slides=${slidePaths.length}`,
      ]),
    });
  }

  let emptySlides = 0;
  for (const slidePath of slidePaths) {
    const xml = entries.get(slidePath)?.toString("utf8") ?? "";
    const text = stripXmlTags(xml);
    if (text.length < 2) emptySlides += 1;
  }

  evidence.push(`PPTX valid, slides=${slidePaths.length}`);
  if (emptySlides > 0) evidence.push(`empty_slides=${emptySlides}`);

  const pdfCompanion = entries.has("docProps/core.xml");
  if (pdfCompanion) evidence.push("core properties present");

  return Object.freeze({
    evaluated: true,
    isValidPptx: true,
    slideCount: slidePaths.length,
    emptySlideCount: emptySlides,
    byteSize: bytes.length,
    confidence: "measured",
    evidence: Object.freeze(evidence),
  });
}

export async function analyzeDocxBytes(
  bytes: Buffer,
  sectionCount?: number,
): Promise<DocumentArtifactEvidence & { readonly isValidDocx: boolean; readonly textLength?: number; readonly headingCount?: number }> {
  const evidence: string[] = [];
  const entries = await loadZipEntries(bytes);
  if (!entries) {
    return Object.freeze({
      evaluated: true,
      isValidPdf: false,
      isValidDocx: false,
      byteSize: bytes.length,
      sectionCount,
      confidence: "measured",
      evidence: Object.freeze(["DOCX ZIP parse failed"]),
    });
  }

  const documentXml = entries.get("word/document.xml");
  const hasContentTypes = entries.has("[Content_Types].xml");
  const isValidDocx = Boolean(documentXml && hasContentTypes);

  if (!isValidDocx) {
    return Object.freeze({
      evaluated: true,
      isValidPdf: false,
      isValidDocx: false,
      byteSize: bytes.length,
      sectionCount,
      confidence: "measured",
      evidence: Object.freeze(["invalid DOCX structure"]),
    });
  }

  const xml = documentXml!.toString("utf8");
  const text = stripXmlTags(xml);
  const headingMatches = xml.match(/w:pStyle w:val="Heading\d+"/gi) ?? [];
  const titleMatch = xml.match(/<w:t[^>]*>([^<]{1,200})<\/w:t>/i);

  evidence.push(`DOCX valid, textLength=${text.length}`);
  if (headingMatches.length > 0) evidence.push(`headings=${headingMatches.length}`);
  if (titleMatch?.[1]) evidence.push(`first_text="${titleMatch[1].slice(0, 40)}"`);
  if (sectionCount != null) evidence.push(`structured sections=${sectionCount}`);

  return Object.freeze({
    evaluated: true,
    isValidPdf: false,
    isValidDocx: true,
    byteSize: bytes.length,
    textLength: text.length,
    headingCount: headingMatches.length,
    sectionCount,
    confidence: "measured",
    evidence: Object.freeze(evidence),
  });
}
