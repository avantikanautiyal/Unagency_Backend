/**
 * Ensure print brochure / document creates always carry server DocumentPlan schema.
 */

import { DOCUMENT_PLAN_STRUCTURED_SCHEMA } from "../os/delivery/document-schemas";
import { shouldOmitCdfStructuredStamp } from "../cdf/phase-scoped-create";
import { resolveCdfPhaseExecutionContract } from "../cdf/canonical";

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

const VISUAL_OUTPUT_KINDS = new Set([
  "image",
  "video",
  "edited_image",
  "animation",
  "image_mockup",
  "image_3d_mockup",
]);

/**
 * True when sealed CDF/product identity rejects DocumentPlan classification.
 * Product subtype (print+leaflet) must never override image/text/structured CDF.
 */
export function metadataRejectsDocumentPlanClassification(
  metadata: Readonly<Record<string, unknown>> | undefined,
  opts?: { capabilityId?: string | null },
): boolean {
  if (!metadata) return false;

  const outputKind = String(metadata.outputKind ?? "")
    .trim()
    .toLowerCase();
  if (VISUAL_OUTPUT_KINDS.has(outputKind)) return true;
  // Sealed non-document kinds (CDF text_choice / structured / website / …).
  if (outputKind && outputKind !== "document") return true;

  const modality = String(
    metadata.cdfGenerationModality ??
      metadata.cdfAuthorityGenerationModality ??
      "",
  )
    .trim()
    .toLowerCase();
  if (
    modality === "image" ||
    modality === "video" ||
    modality === "hybrid" ||
    modality === "text" ||
    modality === "structured"
  ) {
    return true;
  }

  const capability = String(
    opts?.capabilityId ?? metadata.capabilityId ?? "",
  )
    .trim()
    .toLowerCase();
  if (capability.startsWith("image.") || capability.startsWith("video.")) {
    return true;
  }

  const serviceId =
    typeof metadata.cdfServiceId === "string"
      ? metadata.cdfServiceId
      : typeof metadata.serviceId === "string"
        ? metadata.serviceId
        : null;
  const phaseId =
    typeof metadata.cdfPhaseId === "string" ? metadata.cdfPhaseId : null;
  if (serviceId && phaseId) {
    const contract = resolveCdfPhaseExecutionContract({ serviceId, phaseId });
    const cm = contract?.generationModality;
    if (
      cm === "image" ||
      cm === "video" ||
      cm === "hybrid" ||
      cm === "text" ||
      cm === "structured"
    ) {
      return true;
    }
  }

  return false;
}

/** True when this create must run DocumentPlan structured output → PDF/DOCX export. */
export function isDocumentDirectCreate(
  metadata: Readonly<Record<string, unknown>> | undefined,
  opts?: { capabilityId?: string | null },
): boolean {
  if (!metadata) return false;
  if (metadataRejectsDocumentPlanClassification(metadata, opts)) return false;

  const service = String(metadata.service ?? "").toLowerCase();
  const subtype = String(metadata.subtype ?? "").toLowerCase();
  const outputKind = String(metadata.outputKind ?? "").toLowerCase();
  const name = structuredNameFrom(metadata).toLowerCase();
  if (service === "presentations" || outputKind === "presentation") return false;

  // Explicit DocumentPlan identity.
  if (outputKind === "document" || name === "documentplan") return true;

  // Legacy product subtype only when outputKind is unset (not sealed elsewhere).
  if (outputKind) return false;
  return (
    service === "print" &&
    /brochure|leaflet|guideline|report|catalog/i.test(subtype)
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
  if (meta.cdfExecutionAuthorityApplied === true) return meta;
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
