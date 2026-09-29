/**
 * Phase-aware requirement filtering for Context Resolver (M2B).
 * Uses canonical phase contract categories/dependencies — not service-specific hacks.
 */

import type { CdfPhaseDefinition } from "../canonical";
import type { CdfRequirement } from "../requirements/types";

const ALWAYS: ReadonlySet<string> = new Set([
  "brief.raw",
  "slide_count",
  "audience",
  "platform",
  "dimensions",
  "presentation_type",
  "industry",
]);

const COLOR_KEYS = new Set([
  "primary_background",
  "text_color",
  "accent_color",
  "brand_colors",
]);

/** Categories typically needed by generation modality / ux families. */
function categoriesForPhase(phase: CdfPhaseDefinition): Set<string> {
  const cats = new Set<string>([
    "content",
    "constraint",
    "forbidden_content",
    "mandatory_content",
    "quantity",
    "audience",
    "brand",
    "platform",
    "format",
    "preference",
  ]);

  const m = phase.generationModality;
  const ux = phase.uxType;

  if (
    m === "image" ||
    m === "video" ||
    m === "structured" ||
    ux === "visual" ||
    ux === "deck" ||
    ux === "mockup" ||
    ux === "multi_visual"
  ) {
    cats.add("color");
    cats.add("visual");
    cats.add("style");
    cats.add("tone");
    cats.add("typography");
    cats.add("layout");
    cats.add("dimension");
  }

  if (ux === "text_approval" || ux === "structured_approval" || m === "text") {
    cats.add("tone");
    cats.add("style");
    cats.add("structure");
  }

  if (ux === "config" || ux === "selection" || ux === "text_choice") {
    cats.add("preference");
  }

  if (phase.refinement.enabled) {
    cats.add("constraint");
  }

  cats.add("reference");
  cats.add("asset");
  cats.add("delivery");
  cats.add("technical");
  return cats;
}

/**
 * Filter active requirements to those relevant for this phase.
 * Excludes superseded (caller should pass active-only).
 * Never includes selection.* / approval.* as generic content — handled separately.
 */
export function filterRequirementsForPhase(
  requirements: CdfRequirement[],
  phase: CdfPhaseDefinition,
): CdfRequirement[] {
  const cats = categoriesForPhase(phase);
  const out: CdfRequirement[] = [];

  for (const r of requirements) {
    if (r.status !== "active") continue;
    if (r.key.startsWith("selection.") || r.key.startsWith("approval.")) {
      continue;
    }
    if (r.key.startsWith("brief.message.")) {
      // Supporting only — include brief.raw as authoritative content anchor
      continue;
    }
    if (r.key === "refinement.instruction") {
      // Current refine handled via input.refinePrompt
      continue;
    }
    if (ALWAYS.has(r.key) || COLOR_KEYS.has(r.key) || r.key.startsWith("tone.")) {
      out.push(r);
      continue;
    }
    if (r.key === "mandatory_sections" || r.key.startsWith("forbidden.")) {
      out.push(r);
      continue;
    }
    if (cats.has(r.category)) {
      out.push(r);
    }
  }

  // Deterministic order
  return out.sort((a, b) =>
    a.key === b.key
      ? a.requirementId.localeCompare(b.requirementId)
      : a.key.localeCompare(b.key),
  );
}

/** Keys that block generation when conflicted for this phase. */
export function isBlockingConflictKey(
  key: string,
  phase: CdfPhaseDefinition,
): boolean {
  if (key === "slide_count" || key === "dimensions" || key === "platform") {
    return true;
  }
  if (COLOR_KEYS.has(key) && phase.generationModality !== "none") {
    return true;
  }
  return key === "mandatory_sections";
}
