/**
 * LLM emission schemas for CDF text_choice / routes-style artifacts.
 * Align with Artifact.data validators — do not invent parallel SoTs.
 *
 * Production fields come from the shared creative-direction vocabulary +
 * capability declaration — not service-specific property lists.
 */

import {
  FULL_VISUAL_PRODUCTION_SEMANTICS,
  buildCreativeDirectionRoutesSchema,
} from "../../cdf/creative-direction/production-semantics";

/** social-media.routes — exactly 3 creative directions (M9A). */
export const SOCIAL_MEDIA_ROUTES_STRUCTURED_SCHEMA =
  buildCreativeDirectionRoutesSchema({
    requiredConceptFields: [
      "name",
      "creativeIdea",
      "visualTreatment",
      "headlineAngle",
      "rationale",
    ],
    productionSemantics: FULL_VISUAL_PRODUCTION_SEMANTICS,
  });

/** packaging.routes — exactly 3 design directions. */
export const PACKAGING_ROUTES_STRUCTURED_SCHEMA =
  buildCreativeDirectionRoutesSchema({
    requiredConceptFields: [
      "name",
      "shelfIdea",
      "visualDirection",
      "designRationale",
      "hierarchyThought",
    ],
    optionalConceptFields: ["typographyDirection"],
    productionSemantics: FULL_VISUAL_PRODUCTION_SEMANTICS,
  });

/**
 * Generic creative-direction routes emission — shared contract for text_choice
 * phases that declare productionSemantics without a service-specific schema.
 * Concept fields beyond `name` are optional; textLines / capabilities guide fill.
 */
export const GENERIC_CREATIVE_DIRECTION_ROUTES_STRUCTURED_SCHEMA =
  buildCreativeDirectionRoutesSchema({
    requiredConceptFields: ["name"],
    optionalConceptFields: [
      "creativeIdea",
      "visualTreatment",
      "headlineAngle",
      "rationale",
      "shelfIdea",
      "visualDirection",
      "designRationale",
      "hierarchyThought",
    ],
    productionSemantics: FULL_VISUAL_PRODUCTION_SEMANTICS,
  });

/** Contract name for the shared generic routes schema. */
export const CDF_CREATIVE_DIRECTIONS_CONTRACT_NAME =
  "CdfCreativeDirections" as const;
