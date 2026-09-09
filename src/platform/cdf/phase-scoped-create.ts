/**
 * CDF phase-scoped create hints — keep server stamps from forcing full
 * Presentation/Website/Email/Document schemas during early text phases.
 * Keep in sync with FE packages/api cdf-phase-generation EARLY/LATE sets.
 */

/** Phases that must stay text-only (no full deck / site / email plan). */
export const CDF_EARLY_TEXT_PHASE_IDS = new Set([
  "storyline",
  "slide-content",
  "sitemap",
  "page-structure",
  "full-copy",
  "structure",
  "full-script",
  "brand-platform",
  "tone-of-voice",
  "messaging",
  "output-mapping",
  "campaign-development",
  "campaign-strategy",
  "wireframe",
  // Conceptual / descriptive route phases — text cards only, not full product schemas.
  "territories",
  "copy-routes",
  "big-ideas",
  "theme-routes",
  "style-routes",
  "ui-routes",
  "script-routes",
  "routes",
  // PDF entry/gate + review stages that must stay text-only.
  "platform",
  "size-reference",
  "dieline",
  "format-size",
  "source",
  "master-select",
  "validate",
  "responsive",
  "placement",
  "select-touchpoints",
  "channel-select",
  "posm-family",
  "script-source",
]);

/** Late phases that intentionally use full structured schemas. */
export const CDF_LATE_STRUCTURED_PHASE_IDS = new Set([
  "full-deck",
  "email-design",
  "final",
]);

function phaseIdFrom(metadata: Readonly<Record<string, unknown>>): string {
  return typeof metadata.cdfPhaseId === "string"
    ? metadata.cdfPhaseId.trim().toLowerCase()
    : "";
}

/**
 * True when create prepass / direct stamps must not force structured
 * PresentationRouteConcepts / WebsiteRoutes / EmailPlan / DocumentPlan.
 */
export function shouldOmitCdfStructuredStamp(
  metadata: Readonly<Record<string, unknown>> | undefined
): boolean {
  if (!metadata) return false;
  if (metadata.cdfOmitStructuredOutput === true) return true;

  const phaseId = phaseIdFrom(metadata);
  if (!phaseId) return false;
  if (CDF_LATE_STRUCTURED_PHASE_IDS.has(phaseId)) return false;
  if (CDF_EARLY_TEXT_PHASE_IDS.has(phaseId)) return true;

  const expand =
    typeof metadata.presentationExpandMode === "string"
      ? metadata.presentationExpandMode.trim().toLowerCase()
      : "";
  if (expand === "lazy") return true;

  const generator =
    typeof metadata.cdfGenerator === "string"
      ? metadata.cdfGenerator.trim().toLowerCase()
      : "";
  return generator === "text";
}
