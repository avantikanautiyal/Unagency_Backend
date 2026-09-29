/**
 * Ensure pitch-deck / presentation creates always carry server schema so
 * Direct tool runtime enters the concepts → full-deck expansion gate.
 */

import {
  PRESENTATION_ROUTE_CONCEPTS_SCHEMA,
  PRESENTATION_ROUTES_STRUCTURED_SCHEMA,
} from "../os/delivery/presentation-schemas";
import { shouldOmitCdfStructuredStamp } from "../cdf/phase-scoped-create";
import { isCanonicalStructuredPhaseMetadata } from "../cdf/structured-output-contract";

function structuredNameFrom(meta: Readonly<Record<string, unknown>>): string {
  const so = meta.structuredOutput;
  if (so && typeof so === "object" && typeof (so as { name?: unknown }).name === "string") {
    return String((so as { name: string }).name).trim();
  }
  return "";
}

function hasUsablePresentationConceptsSchema(
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
    "concepts" in (props as Record<string, unknown>)
  );
}

const PRESENTATION_CONCEPTS_STRUCTURED_OUTPUT = {
  name: "PresentationRouteConcepts",
  schema: PRESENTATION_ROUTE_CONCEPTS_SCHEMA as unknown as Record<
    string,
    unknown
  >,
  strict: true,
} as const;

const PRESENTATION_ROUTES_STRUCTURED_OUTPUT = {
  name: "PresentationRoutes",
  schema: PRESENTATION_ROUTES_STRUCTURED_SCHEMA as unknown as Record<
    string,
    unknown
  >,
  strict: true,
} as const;

/** True when this create must run PresentationRouteConcepts → full deck expand. */
export function isPresentationDirectCreate(
  metadata: Readonly<Record<string, unknown>> | undefined
): boolean {
  if (!metadata) return false;
  // Phase 2 canonical full-deck: not the legacy concepts→routes create.
  if (metadata.cdfOmitConceptsExpansion === true) return false;
  if (metadata.cdfCanonicalFullDeck === true) return false;
  // Canonical structured CDF phases use phase artifact schemas — never concepts→deck.
  if (isCanonicalStructuredPhaseMetadata(metadata)) return false;
  const service = String(metadata.service ?? "").toLowerCase();
  const subtype = String(metadata.subtype ?? "").toLowerCase();
  const outputKind = String(metadata.outputKind ?? "").toLowerCase();
  const name = structuredNameFrom(metadata).toLowerCase();
  if (subtype === "gifs") return false;
  // Visual deliverables (performance ads, social posts, etc.) must never enter
  // the presentation concepts → deck expansion gate.
  if (
    outputKind === "image" ||
    outputKind === "video" ||
    outputKind === "edited_image" ||
    outputKind === "animation" ||
    outputKind === "image_mockup" ||
    outputKind === "image_3d_mockup"
  ) {
    return false;
  }
  return (
    service === "presentations" ||
    outputKind === "presentation" ||
    name === "presentationrouteconcepts"
  );
}

/**
 * Stamp presentation expand + authoritative structured schema on metadata.
 * Safe to call repeatedly — idempotent for pitch-deck creates.
 */
export function stampPresentationCreateMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined
): Record<string, unknown> {
  const meta: Record<string, unknown> = { ...(metadata ?? {}) };
  if (shouldOmitCdfStructuredStamp(meta)) return meta;
  // Sealed CDF authority: never rewrite outputKind; phase contract stamps SO.
  if (meta.cdfExecutionAuthorityApplied === true) return meta;

  // Phase 2: canonical full-deck stamps PresentationRoutes directly (no concepts).
  if (
    meta.cdfOmitConceptsExpansion === true ||
    meta.cdfCanonicalFullDeck === true
  ) {
    meta.outputKind = "presentation";
    meta.presentationExpandMode = "canonical";
    meta.deliverableRequired = true;
    meta.structuredOutput = { ...PRESENTATION_ROUTES_STRUCTURED_OUTPUT };
    return meta;
  }

  if (!isPresentationDirectCreate(meta)) return meta;

  const subtype =
    typeof meta.subtype === "string" ? meta.subtype.trim().toLowerCase() : "";

  meta.outputKind = "presentation";
  meta.presentationExpandMode = subtype === "gifs" ? "lazy" : "full";
  meta.deliverableRequired = subtype !== "gifs";

  if (!hasUsablePresentationConceptsSchema(meta)) {
    meta.structuredOutput = { ...PRESENTATION_CONCEPTS_STRUCTURED_OUTPUT };
  } else {
    const so = meta.structuredOutput as Record<string, unknown>;
    if (typeof so.name !== "string" || !so.name.trim()) {
      meta.structuredOutput = {
        ...so,
        name: "PresentationRouteConcepts",
      };
    }
  }

  return meta;
}
