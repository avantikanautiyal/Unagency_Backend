/**
 * Ensure email / newsletter creates always carry server EmailPlan schema
 * (parity with presentation + document stamps).
 */

import { EMAIL_PLAN_STRUCTURED_SCHEMA } from "../os/delivery/email-schemas";
import { shouldOmitCdfStructuredStamp } from "../cdf/phase-scoped-create";

function structuredNameFrom(meta: Readonly<Record<string, unknown>>): string {
  const so = meta.structuredOutput;
  if (so && typeof so === "object" && typeof (so as { name?: unknown }).name === "string") {
    return String((so as { name: string }).name).trim();
  }
  return "";
}

function hasUsableEmailPlanSchema(
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
    "html" in (props as Record<string, unknown>) &&
    "subject" in (props as Record<string, unknown>)
  );
}

const EMAIL_PLAN_STRUCTURED_OUTPUT = {
  name: "EmailPlan",
  schema: EMAIL_PLAN_STRUCTURED_SCHEMA as unknown as Record<string, unknown>,
  strict: true,
} as const;

/** True when this create must run EmailPlan → HTML email export. */
export function isEmailDirectCreate(
  metadata: Readonly<Record<string, unknown>> | undefined
): boolean {
  if (!metadata) return false;
  const service = String(metadata.service ?? "").toLowerCase();
  const outputKind = String(metadata.outputKind ?? "").toLowerCase();
  const name = structuredNameFrom(metadata).toLowerCase();
  if (
    service === "presentations" ||
    outputKind === "presentation" ||
    outputKind === "document" ||
    outputKind === "image" ||
    outputKind === "video"
  ) {
    return false;
  }
  return (
    service === "email" ||
    outputKind === "email" ||
    name === "emailplan"
  );
}

/**
 * Stamp authoritative EmailPlan schema on metadata.
 * Safe to call repeatedly — idempotent for email creates.
 */
export function stampEmailCreateMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined
): Record<string, unknown> {
  const meta: Record<string, unknown> = { ...(metadata ?? {}) };
  if (!isEmailDirectCreate(meta)) return meta;
  if (shouldOmitCdfStructuredStamp(meta)) return meta;

  meta.outputKind = "email";
  meta.deliverableRequired = true;

  if (!hasUsableEmailPlanSchema(meta)) {
    meta.structuredOutput = { ...EMAIL_PLAN_STRUCTURED_OUTPUT };
  } else {
    const so = meta.structuredOutput as Record<string, unknown>;
    if (typeof so.name !== "string" || !so.name.trim()) {
      meta.structuredOutput = {
        ...so,
        name: "EmailPlan",
      };
    }
  }

  return meta;
}
