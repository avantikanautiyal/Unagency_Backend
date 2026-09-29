/**
 * 10-slide golden deck fixture for M6 targeted refinement tests.
 * Element IDs are deck-unique (schema rule) while remaining stable and role-clear.
 */

import { DEFAULT_DECK_DIMENSIONS } from "../artifacts/presentation/coordinates";
import {
  PRESENTATION_ARTIFACT_KEYS,
  presentationSchemaId,
} from "../artifacts/presentation/keys";
import type { PresentationDeckData } from "../artifacts/presentation/types";
import { FIXTURE_IDS } from "../artifacts/presentation/fixtures";

export function fixtureTenSlideDeck(
  designSystemArtifactId: string = FIXTURE_IDS.designSystemArtifactId,
): PresentationDeckData {
  const slides = Array.from({ length: 10 }, (_, i) => {
    const n = String(i + 1).padStart(2, "0");
    return {
      id: `slide_${n}`,
      order: i,
      layoutRef: i === 0 ? "layout_title" : "layout_content",
      background:
        i === 0
          ? ({ kind: "token" as const, value: "color.primary" })
          : undefined,
      elements: [
        {
          id: `element_title_${n}`,
          type: "text" as const,
          content:
            i === 6
              ? "Slide 7 Title"
              : i === 0
                ? "Acme Series A"
                : `Slide ${i + 1} Title`,
          bounds: { x: 0.08, y: 0.1, width: 0.8, height: 0.12 },
          zIndex: 2,
          style: {
            fontRole: "title",
            fontSize: 24,
            color: { kind: "token" as const, value: "color.on_surface" },
          },
        },
        {
          id: `element_subtitle_${n}`,
          type: "text" as const,
          content: `Subtitle for slide ${i + 1}`,
          bounds: { x: 0.08, y: 0.22, width: 0.7, height: 0.06 },
          zIndex: 2,
          style: { fontRole: "subtitle", fontSize: 16 },
        },
        {
          id: `element_body_${n}`,
          type: "text" as const,
          content: `Body copy for slide ${i + 1}`,
          bounds: { x: 0.08, y: 0.32, width: 0.55, height: 0.35 },
          zIndex: 2,
          style: { fontRole: "body", fontSize: 16 },
        },
        {
          id: `element_shape_${n}`,
          type: "shape" as const,
          shape: "rect" as const,
          bounds: { x: 0.08, y: 0.3, width: 0.12, height: 0.01 },
          zIndex: 1,
          style: {
            fill: { kind: "token" as const, value: "color.accent" },
          },
        },
        ...(i === 3 || i === 6
          ? [
              {
                id: `element_image_${n}`,
                type: "image" as const,
                vaultAssetId: FIXTURE_IDS.vaultImage,
                alt: i === 3 ? "Product UI" : "Diagram",
                bounds: { x: 0.66, y: 0.25, width: 0.26, height: 0.45 },
                zIndex: 1,
              },
            ]
          : []),
        ...(i === 2
          ? [
              {
                id: "element_logo_03",
                type: "image" as const,
                vaultAssetId: FIXTURE_IDS.vaultImage,
                alt: "logo",
                bounds: { x: 0.8, y: 0.04, width: 0.12, height: 0.08 },
                zIndex: 3,
              },
            ]
          : []),
        ...(i === 4
          ? [
              {
                id: "element_group_05",
                type: "group" as const,
                bounds: { x: 0.08, y: 0.7, width: 0.4, height: 0.15 },
                zIndex: 1,
                childIds: ["element_body_05"],
              },
            ]
          : []),
        ...(i === 5
          ? [
              {
                id: "element_table_06",
                type: "table" as const,
                bounds: { x: 0.08, y: 0.55, width: 0.8, height: 0.3 },
                zIndex: 1,
                rows: [
                  ["Metric", "Value"],
                  ["ARR", "$12M"],
                ],
              },
            ]
          : []),
      ],
      notes: i === 6 ? "Speaker note slide 7" : undefined,
    };
  });

  return {
    schemaId: presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.deck),
    metadata: {
      title: "M6 Golden Ten-Slide Deck",
      subtitle: "Refinement isolation fixture",
      locale: "en-US",
      dimensions: { ...DEFAULT_DECK_DIMENSIONS },
    },
    designSystemRef: {
      artifactId: designSystemArtifactId,
      version: 2,
      artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
    },
    slides: slides as PresentationDeckData["slides"],
    sourceRefs: {
      contextId: "ctx_m6_fixture",
      contextHash: "hash_m6_fixture",
      executionId: "exec_m6_fixture",
    },
  };
}
