/**
 * Ensure print brochure / document creates always carry server DocumentPlan schema.
 */

import { DOCUMENT_PLAN_STRUCTURED_SCHEMA } from "../os/delivery/document-schemas";
import { shouldOmitCdfStructuredStamp } from "../cdf/phase-scoped-create";

function structuredNameFrom(meta: Readonly<Record<string, unknown>>): string {
  const so = meta.structuredOutput;
  if (so && typeof so === "object" && typeof (so as { name?: unknown }).name === "string") {
    return String((so as { name: string }).name).trim();
  }
  return "";
}

function hasUsableDocumentPlanSchema(
  meta: Readonly<Record<string, unknown>>
): boolean {
  const so = meta.structuredOutput;
  if (!so || typeof so !== "object") return false;
  const schema = (so as { schema?: unknown }).schema;
  if (!schema || typeof schema !== "object") return false;
  const props = (schema as Record<string, unknown>).properties;
  return (
    typeof props === "object" &&
    props !== null &&
    "sections" in (props as Record<string, unknown>)
  );
}

const DOCUMENT_PLAN_STRUCTURED_OUTPUT = {
  name: "DocumentPlan",
  schema: DOCUMENT_PLAN_STRUCTURED_SCHEMA as unknown as Record<string, unknown>,
  strict: true,
} as const;

/** True when this create must run DocumentPlan structured output → PDF/DOCX export. */
export function isDocumentDirectCreate(
  metadata: Readonly<Record<string, unknown>> | undefined
): boolean {
  if (!metadata) return false;
  const service = String(metadata.service ?? "").toLowerCase();
  const subtype = String(metadata.subtype ?? "").toLowerCase();
  const outputKind = String(metadata.outputKind ?? "").toLowerCase();
  const name = structuredNameFrom(metadata).toLowerCase();
  if (service === "presentations" || outputKind === "presentation") return false;
  return (
    outputKind === "document" ||
    name === "documentplan" ||
    (service === "print" &&
      /brochure|leaflet|guideline|report|catalog/i.test(subtype))
  );
}

/**
 * Stamp authoritative DocumentPlan schema on metadata.
 * Safe to call repeatedly — idempotent for document creates.
 */
export function stampDocumentCreateMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined
): Record<string, unknown> {
  const meta: Record<string, unknown> = { ...(metadata ?? {}) };
  if (!isDocumentDirectCreate(meta)) return meta;
  if (shouldOmitCdfStructuredStamp(meta)) return meta;

  meta.outputKind = "document";
  meta.deliverableRequired = true;

  if (!hasUsableDocumentPlanSchema(meta)) {
    meta.structuredOutput = { ...DOCUMENT_PLAN_STRUCTURED_OUTPUT };
  } else {
    const so = meta.structuredOutput as Record<string, unknown>;
    if (typeof so.name !== "string" || !so.name.trim()) {
      meta.structuredOutput = {
        ...so,
        name: "DocumentPlan",
      };
    }
  }

  return meta;
}
