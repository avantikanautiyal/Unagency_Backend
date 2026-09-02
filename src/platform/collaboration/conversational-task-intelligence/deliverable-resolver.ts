/**
 * Priority 4.6 — Deliverable resolver with service capability checks.
 */

import type { DownloadFormat, ServiceOutputSpec } from "../../config/service-output-map";
import type {
  DeliverableFormat,
  ResolvedDeliverable,
  SpecFieldProvenance,
} from "./execution-specification";

const DELIVERABLE_TO_DOWNLOAD: Partial<Record<DeliverableFormat, DownloadFormat>> = {
  PDF: "pdf",
  PPTX: "pptx",
  DOCX: "docx",
  HTML: "html",
  ZIP: "zip",
  PNG: "png",
  JPG: "jpg",
  TXT: "txt",
  MP4: "mp4",
};

/** Editable text is supported when text modality is available. */
export function serviceSupportsDeliverable(
  format: DeliverableFormat,
  spec: ServiceOutputSpec,
): boolean {
  if (format === "EDITABLE_TEXT") {
    return (
      spec.modalities.includes("text") ||
      spec.modalities.includes("document") ||
      spec.kind === "text" ||
      spec.kind === "document" ||
      spec.kind === "dynamic"
    );
  }
  const download = DELIVERABLE_TO_DOWNLOAD[format];
  if (download && spec.supportedDownloadFormats.includes(download)) {
    return true;
  }
  // Export formats materializable from text/document content via export pipeline.
  if (
    (format === "PDF" || format === "DOCX" || format === "PPTX" || format === "HTML") &&
    (spec.modalities.includes("text") ||
      spec.kind === "text" ||
      spec.kind === "document" ||
      spec.kind === "presentation" ||
      spec.kind === "dynamic")
  ) {
    return true;
  }
  if (!download) return false;
  return spec.supportedDownloadFormats.includes(download);
}

export type DeliverableResolutionResult = {
  readonly deliverables: readonly ResolvedDeliverable[];
  readonly unsupported: readonly DeliverableFormat[];
  readonly resolutionState: "RESOLVED" | "UNSUPPORTED_DELIVERABLE";
};

export function resolveDeliverables(input: {
  readonly requested: readonly DeliverableFormat[];
  readonly serviceDefaultFormats?: readonly DeliverableFormat[];
  readonly serviceSpec: ServiceOutputSpec;
  readonly explicitOnly?: boolean;
}): DeliverableResolutionResult {
  const requested = input.requested.length
    ? input.requested
    : input.explicitOnly
      ? []
      : (input.serviceDefaultFormats ?? []);

  if (requested.length === 0) {
    return Object.freeze({
      deliverables: Object.freeze([]),
      unsupported: Object.freeze([]),
      resolutionState: "RESOLVED",
    });
  }

  const deliverables: ResolvedDeliverable[] = [];
  const unsupported: DeliverableFormat[] = [];

  for (const format of requested) {
    const provenance: SpecFieldProvenance = input.requested.includes(format)
      ? { source: "EXPLICIT_USER", explicit: true }
      : { source: "DEFAULT", explicit: false };

    const supported = serviceSupportsDeliverable(format, input.serviceSpec);
    if (!supported) {
      unsupported.push(format);
    }

    // Explicit user deliverables are always recorded in the spec — never silently dropped.
    deliverables.push(
      Object.freeze({
        format,
        required: true,
        editable: format === "EDITABLE_TEXT",
        provenance,
      }),
    );
  }

  return Object.freeze({
    deliverables: Object.freeze(deliverables),
    unsupported: Object.freeze(unsupported),
    resolutionState:
      unsupported.length > 0 ? "UNSUPPORTED_DELIVERABLE" : "RESOLVED",
  });
}

export function defaultDeliverablesForService(
  spec: ServiceOutputSpec,
): readonly DeliverableFormat[] {
  const formats: DeliverableFormat[] = [];
  if (spec.kind === "text" || spec.modalities.includes("text")) {
    formats.push("EDITABLE_TEXT");
  }
  for (const df of spec.supportedDownloadFormats) {
    const upper = df.toUpperCase() as DeliverableFormat;
    if (upper === "JPG" && formats.includes("JPG")) continue;
    if (!formats.includes(upper)) formats.push(upper);
  }
  return Object.freeze(formats);
}

export function deliverableToOutputKindOverride(
  deliverables: readonly ResolvedDeliverable[],
): string | undefined {
  const formats = deliverables.map((d) => d.format);
  if (formats.includes("PPTX") || formats.includes("PDF") && formats.length === 1) {
    // PDF alone could be document or presentation — don't override
  }
  if (formats.includes("PPTX")) return "presentation";
  if (formats.includes("DOCX") || formats.includes("PDF")) return "document";
  if (formats.includes("HTML")) return "email";
  if (formats.includes("PNG") || formats.includes("JPG")) return "image";
  if (formats.includes("MP4")) return "video";
  if (formats.includes("ZIP")) return "deferred_website";
  return undefined;
}

export function resolvedDeliverableField(
  format: DeliverableFormat,
  explicit: boolean,
): ResolvedDeliverable {
  return Object.freeze({
    format,
    required: true,
    editable: format === "EDITABLE_TEXT",
    provenance: explicit
      ? { source: "EXPLICIT_USER", explicit: true }
      : { source: "DEFAULT", explicit: false },
  });
}

