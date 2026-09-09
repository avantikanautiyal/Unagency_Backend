/**
 * P4.9.7 — Infer present deliverable formats from execution artifacts/metadata.
 */

import { downloadFormatsForMime } from "../../config/service-output-map";
import type { DeliverableFormat } from "./execution-specification";
import { deliverableFormatFromDownloadFormat } from "./deliverable-resolver";

const UPPER_FORMAT = new Set<DeliverableFormat>([
  "PDF",
  "PPTX",
  "DOCX",
  "HTML",
  "ZIP",
  "PNG",
  "JPG",
  "TXT",
  "EDITABLE_TEXT",
  "MP4",
]);

function toDeliverableFormat(value: string): DeliverableFormat | undefined {
  const upper = value.trim().toUpperCase() as DeliverableFormat;
  if (UPPER_FORMAT.has(upper)) return upper;
  return deliverableFormatFromDownloadFormat(value.trim().toLowerCase());
}

export function deliverableFormatsFromMime(mime: string): readonly DeliverableFormat[] {
  const formats = downloadFormatsForMime(mime);
  const out: DeliverableFormat[] = [];
  for (const df of formats) {
    const mapped = deliverableFormatFromDownloadFormat(df);
    if (mapped && !out.includes(mapped)) out.push(mapped);
  }
  if (mime.startsWith("text/html") && !out.includes("HTML")) out.push("HTML");
  if (mime.startsWith("text/plain") && !out.includes("TXT")) out.push("TXT");
  if (mime.startsWith("image/png") && !out.includes("PNG")) out.push("PNG");
  if (mime.startsWith("image/jpeg") && !out.includes("JPG")) out.push("JPG");
  if (mime === "application/pdf" && !out.includes("PDF")) out.push("PDF");
  return Object.freeze(out);
}

export function inferPresentDeliverableFormats(input: {
  readonly artifactMimes?: readonly string[];
  readonly downloadFormatLabels?: readonly string[];
  readonly hasPreviewText?: boolean;
}): readonly DeliverableFormat[] {
  const present = new Set<DeliverableFormat>();

  for (const mime of input.artifactMimes ?? []) {
    for (const format of deliverableFormatsFromMime(mime)) {
      present.add(format);
    }
  }

  for (const label of input.downloadFormatLabels ?? []) {
    const format = toDeliverableFormat(label);
    if (format) present.add(format);
  }

  if (input.hasPreviewText) {
    present.add("EDITABLE_TEXT");
  }

  return Object.freeze([...present]);
}

export function inferPresentDeliverableFormatsFromExecution(input: {
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly structuredData?: unknown;
  readonly previewText?: string;
}): readonly DeliverableFormat[] {
  const meta = input.metadata ?? {};
  const produced = meta.producedDeliverableFormats;
  if (Array.isArray(produced)) {
    const formats = produced
      .map((f) => (typeof f === "string" ? toDeliverableFormat(f) : undefined))
      .filter((f): f is DeliverableFormat => Boolean(f));
    if (formats.length) return Object.freeze(formats);
  }

  const downloadFormatLabels: string[] = [];
  const structured =
    input.structuredData &&
    typeof input.structuredData === "object" &&
    !Array.isArray(input.structuredData)
      ? (input.structuredData as Record<string, unknown>)
      : undefined;
  if (Array.isArray(structured?.downloadFormats)) {
    for (const label of structured.downloadFormats) {
      if (typeof label === "string") downloadFormatLabels.push(label);
    }
  }

  return inferPresentDeliverableFormats({
    downloadFormatLabels,
    hasPreviewText: Boolean(input.previewText?.trim()),
  });
}
