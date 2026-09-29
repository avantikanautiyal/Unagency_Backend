/**
 * Deterministic fixture renderer for M5 architecture tests.
 * NOT a PPTX/PDF/preview implementation — produces a stable JSON representation.
 */

import { PRESENTATION_ARTIFACT_KEYS } from "../../artifacts/presentation/keys";
import type {
  ArtifactRenderer,
  CdfRendererInput,
  CdfRendererOutput,
} from "../types";

export const FIXTURE_DECK_RENDERER_ID = "presentation-deck-fixture";
export const FIXTURE_DECK_RENDERER_VERSION = "1.0.0";

/**
 * Pure, deterministic representation of a DeckSpec for tests.
 * Includes exact artifact version in payload so tests can assert no "latest" drift.
 */
export function createPresentationDeckFixtureRenderer(): ArtifactRenderer {
  return {
    capability: {
      rendererId: FIXTURE_DECK_RENDERER_ID,
      rendererVersion: FIXTURE_DECK_RENDERER_VERSION,
      artifactKeys: [PRESENTATION_ARTIFACT_KEYS.deck],
      formats: ["fixture"],
      purposes: ["preview", "final"],
      description:
        "Deterministic M5 test renderer — not PPTX/PDF. M5B owns real formats.",
    },
    canRender({ artifactKey, format }) {
      return (
        artifactKey === PRESENTATION_ARTIFACT_KEYS.deck && format === "fixture"
      );
    },
    async render(input: CdfRendererInput): Promise<CdfRendererOutput> {
      const slides = Array.isArray(input.data.slides)
        ? input.data.slides
        : [];
      const assetIds = [...input.resolvedAssets.keys()].sort();
      const payload = {
        kind: "cdf.fixture.render",
        artifactId: input.artifactId,
        artifactVersion: input.artifactVersion,
        artifactKey: input.artifactKey,
        schemaVersion: input.schemaVersion,
        format: input.format,
        purpose: input.purpose,
        rendererId: input.rendererId,
        rendererVersion: input.rendererVersion,
        slideCount: slides.length,
        slideIds: slides.map((s) =>
          s && typeof s === "object" && "id" in s
            ? String((s as { id: unknown }).id)
            : "",
        ),
        resolvedVaultAssetIds: assetIds,
        options: input.options,
      };
      const text = `${JSON.stringify(payload)}\n`;
      return {
        bytes: new TextEncoder().encode(text),
        mimeType: "application/json",
      };
    },
  };
}
