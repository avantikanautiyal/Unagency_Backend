/**
 * Resolve Visual Field Guide pack for a service (and optional placement context).
 */

import {
  VISUAL_FIELD_GUIDE_EDITION,
  VISUAL_FIELD_GUIDE_PROVENANCE,
} from "../edition";
import type { ProductionHygieneCheck } from "../types";
import {
  VISUAL_FINAL_HYGIENE_LINES,
  VISUAL_GOOD_PRACTICE,
} from "./good-practice";
import {
  VISUAL_FORMAT_LOGIC,
  VISUAL_IDENTITY_SYSTEM,
  VISUAL_LAYOUT_HYGIENE,
  VISUAL_PLACEMENT_HYGIENE,
} from "./identity-system";
import { getServiceVisualRecipe } from "./service-visual-recipes";
import type { ResolvedVisualFieldGuide } from "./types";

export type ResolveVisualFieldGuideInput = {
  readonly service?: string | null;
};

export function resolveVisualFieldGuide(
  input: ResolveVisualFieldGuideInput = {},
): ResolvedVisualFieldGuide {
  const recipe = getServiceVisualRecipe(input.service);
  const recipeGateChecks: ProductionHygieneCheck[] = [];
  if (recipe) {
    for (const c of [...recipe.checkFirst, ...recipe.checkLast]) {
      if (c.weight === "gate") recipeGateChecks.push(c);
    }
  }

  return Object.freeze({
    edition: VISUAL_FIELD_GUIDE_EDITION,
    provenance: VISUAL_FIELD_GUIDE_PROVENANCE,
    identity: VISUAL_IDENTITY_SYSTEM,
    layout: VISUAL_LAYOUT_HYGIENE,
    placement: VISUAL_PLACEMENT_HYGIENE,
    formatLogic: VISUAL_FORMAT_LOGIC,
    ...(recipe ? { recipe } : {}),
    goodPractice: VISUAL_GOOD_PRACTICE,
    recipeGateChecks: Object.freeze(recipeGateChecks),
  });
}

/** Prompt lines for Final hygiene (page 29). */
export function visualFinalHygienePromptLines(): readonly string[] {
  return VISUAL_FINAL_HYGIENE_LINES;
}
