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

function isImageCapableSpec(spec: ServiceOutputSpec): boolean {
  return (
    spec.kind === "image" ||
    spec.kind === "image_mockup" ||
    spec.kind === "image_3d_mockup" ||
    spec.modalities.includes("image")
  );
}

function dedupeDeliverableFormats(
  formats: readonly DeliverableFormat[],
): DeliverableFormat[] {
  return [...new Set(formats)];
}

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
  // Print-ready image deliverables (packaging, posters, ads) export to PDF at download.
  if (format === "PDF" && isImageCapableSpec(spec)) {
    return true;
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
  /** When true (default), explicit user formats are unioned with service defaults for download. */
  readonly mergeServiceDefaults?: boolean;
}): DeliverableResolutionResult {
  const explicitRequested = input.requested;
  const serviceDefaults = input.serviceDefaultFormats ?? [];
  const formatsToResolve =
    explicitRequested.length > 0
      ? input.mergeServiceDefaults === false
        ? [...explicitRequested]
        : dedupeDeliverableFormats([...explicitRequested, ...serviceDefaults])
      : input.explicitOnly
        ? []
        : [...serviceDefaults];

  if (formatsToResolve.length === 0) {
    return Object.freeze({
      deliverables: Object.freeze([]),
      unsupported: Object.freeze([]),
      resolutionState: "RESOLVED",
    });
  }

  const deliverables: ResolvedDeliverable[] = [];
  const unsupported: DeliverableFormat[] = [];

  for (const format of formatsToResolve) {
    const provenance: SpecFieldProvenance = explicitRequested.includes(format)
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
        required: explicitRequested.includes(format),
        editable: format === "EDITABLE_TEXT",
        provenance,
      }),
    );
  }

  const explicitUnsupported = explicitRequested.filter(
    (format) => !serviceSupportsDeliverable(format, input.serviceSpec),
  );
  const blockGeneration =
    explicitRequested.length > 0 &&
    explicitUnsupported.length === explicitRequested.length;

  return Object.freeze({
    deliverables: Object.freeze(deliverables),
    unsupported: Object.freeze(unsupported),
    resolutionState: blockGeneration ? "UNSUPPORTED_DELIVERABLE" : "RESOLVED",
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
  options?: { readonly service?: string },
): string | undefined {
  const formats = deliverables.map((d) => d.format);
  const service = options?.service?.trim().toLowerCase() ?? "";
  if (formats.includes("PPTX") || formats.includes("PDF") && formats.length === 1) {
    // PDF alone could be document or presentation — don't override
  }
  if (formats.includes("PPTX")) return "presentation";
  if (formats.includes("DOCX") || formats.includes("PDF")) return "document";
  if (formats.includes("HTML")) {
    return service === "website" || service.includes("landing")
      ? "deferred_website"
      : "email";
  }
  if (formats.includes("PNG") || formats.includes("JPG")) return "image";
  if (formats.includes("MP4")) return "video";
  if (formats.includes("ZIP")) return "deferred_website";
  return undefined;
}

export function deliverableFormatFromDownloadFormat(
  format: DownloadFormat,
): DeliverableFormat | undefined {
  const upper = format.toUpperCase() as DeliverableFormat;
  if (upper in DELIVERABLE_TO_DOWNLOAD || upper === "EDITABLE_TEXT") {
    return upper;
  }
  return undefined;
}

export function deliverableFormatFromExportFormat(
  format: string,
): DeliverableFormat | undefined {
  const normalized = format.trim().toLowerCase();
  if (normalized === "editable_text" || normalized === "editable text") {
    return "EDITABLE_TEXT";
  }
  return deliverableFormatFromDownloadFormat(normalized as DownloadFormat);
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

