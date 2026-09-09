/**
 * UNAGENCY Format & Production Specification — edition identity.
 *
 * Source documents (same date family, Edition 1.0):
 * - UNAGENCY Format & Production Specification / 05 Sep 2026
 * - UNAGENCY Service & Hygiene Reference / 05 Sep 2026
 * - UNAGENCY Visual Field Guide / 05 Sep 2026
 *
 * Phase 0 locks Hygiene Reference structures (gates, weighted checks, prompt
 * blocks, productionRuleId binding) as first-class contracts.
 * Phase 1 injects Spec into provider prompts.
 * Phase 2 expands service-default catalog to all 15 services with structured hygiene.
 * Phase 3 enforces Spec on release (PASS/REVISE/REVIEW/HOLD) + delivery gate.
 * Phase 4 syncs Admin QC + FE pixel register from the same Spec catalog.
 * Phase 5 hardens with rollout flag, telemetry, R/H pre-gen hold, and canary.
 * Phase 6 encodes Visual Field Guide identity/layout/recipes into instruct + evidence.
 */

/** Semver for the Format & Production Spec catalog package. */
export const FORMAT_PRODUCTION_SPEC_EDITION = "1.0.0" as const;

export const FORMAT_PRODUCTION_SPEC_DOC_DATE = "2026-09-05" as const;

/** Stable catalog provenance used by overlays / existing consumers. */
export const FORMAT_PRODUCTION_SPEC_PROVENANCE =
  `format-spec@${FORMAT_PRODUCTION_SPEC_EDITION}` as const;

/** Document edition label from the Service & Hygiene Reference PDF. */
export const SERVICE_HYGIENE_REFERENCE_EDITION = "1.0" as const;

export const SERVICE_HYGIENE_REFERENCE_DOC_DATE = "2026-09-05" as const;

export const SERVICE_HYGIENE_REFERENCE_PROVENANCE =
  `hygiene-ref@${SERVICE_HYGIENE_REFERENCE_EDITION}` as const;

/** Document edition label from the Visual Field Guide PDF. */
export const VISUAL_FIELD_GUIDE_EDITION = "1.0" as const;

export const VISUAL_FIELD_GUIDE_DOC_DATE = "2026-09-05" as const;

export const VISUAL_FIELD_GUIDE_PROVENANCE =
  `visual-field-guide@${VISUAL_FIELD_GUIDE_EDITION}` as const;

/**
 * Combined stack provenance for prompt blocks + execution bindings.
 * Instruct and enforce must share this identity.
 */
export const PRODUCTION_SPEC_STACK_PROVENANCE =
  `${FORMAT_PRODUCTION_SPEC_PROVENANCE}+${SERVICE_HYGIENE_REFERENCE_PROVENANCE}+${VISUAL_FIELD_GUIDE_PROVENANCE}` as const;
