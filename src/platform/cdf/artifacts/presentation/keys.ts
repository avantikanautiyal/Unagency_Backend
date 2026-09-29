/**
 * Presentation artifact keys (M3B) — align with M1 presentationArtifactFamily.
 */

export const PRESENTATION_ARTIFACT_KEYS = {
  source: "presentation.source",
  storyline: "presentation.storyline",
  slideContent: "presentation.slide-content",
  designRoute: "presentation.design-route",
  designSystem: "presentation.design-system",
  deck: "presentation.deck",
} as const;

export type PresentationArtifactKey =
  (typeof PRESENTATION_ARTIFACT_KEYS)[keyof typeof PRESENTATION_ARTIFACT_KEYS];

/** M1 CdfArtifactType mapping for each presentation key. */
export const PRESENTATION_ARTIFACT_TYPE_BY_KEY = {
  "presentation.source": "config_choice",
  "presentation.storyline": "structured_doc",
  "presentation.slide-content": "structured_doc",
  "presentation.design-route": "config_choice",
  /** Structured token system (not the selection gate UI). */
  "presentation.design-system": "structured_doc",
  "presentation.deck": "deck",
} as const;

export const PRESENTATION_SCHEMA_VERSION = "1";

export function presentationSchemaId(
  key: PresentationArtifactKey,
  version: string = PRESENTATION_SCHEMA_VERSION,
): string {
  const short = key.replace(/^presentation\./, "").replace(/-/g, "_");
  return `unagency.presentation.${short}.v${version}`;
}
