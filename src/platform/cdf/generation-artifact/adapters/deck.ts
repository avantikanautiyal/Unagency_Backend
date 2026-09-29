/**
 * Legacy PresentationRoutes / PresentationPlan → presentation.deck (DeckSpec)
 * Does NOT render PPTX/PDF. Does NOT invent vault assets from visualCue text.
 */

import { isCdfCanonicalArtifactId } from "../../artifacts/ids";
import { DEFAULT_DECK_DIMENSIONS } from "../../artifacts/presentation/coordinates";
import {
  PRESENTATION_ARTIFACT_KEYS,
  presentationSchemaId,
} from "../../artifacts/presentation/keys";
import type {
  DeckElement,
  PresentationDeckData,
} from "../../artifacts/presentation/types";
import { generationArtifactError } from "../errors";
import {
  asString,
  assertVaultAssetIds,
  isRecord,
  requireRecord,
  unwrapProviderEnvelope,
} from "../parse";
import { stableElementId, stableSlideId } from "../stable-ids";

export function normalizePresentationDeck(
  raw: unknown,
  opts: {
    designSystemRef: { artifactId: string; version: number };
    routeIndex?: number;
    vaultAssetIds?: string[];
  },
): PresentationDeckData {
  if (!isCdfCanonicalArtifactId(opts.designSystemRef.artifactId)) {
    throw generationArtifactError(
      "ARTIFACT_NORMALIZATION_FAILED",
      "deck: designSystemRef.artifactId must be cdfart_*",
    );
  }
  if (
    !Number.isInteger(opts.designSystemRef.version) ||
    opts.designSystemRef.version < 1
  ) {
    throw generationArtifactError(
      "ARTIFACT_NORMALIZATION_FAILED",
      "deck: designSystemRef.version must be >= 1",
    );
  }

  const vaultAssetIds = assertVaultAssetIds(opts.vaultAssetIds);
  let root = unwrapProviderEnvelope(requireRecord(raw, "presentation.deck"));

  if (root.schemaId === presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.deck)) {
    const data = root as unknown as PresentationDeckData;
    data.designSystemRef = {
      artifactId: opts.designSystemRef.artifactId,
      version: opts.designSystemRef.version,
      artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
    };
    return data;
  }

  // Pick one route from PresentationRoutes
  if (Array.isArray(root.routes)) {
    const idx = opts.routeIndex ?? 0;
    const route = root.routes[idx];
    if (!isRecord(route)) {
      throw generationArtifactError(
        "ARTIFACT_NORMALIZATION_FAILED",
        `deck: routes[${idx}] missing`,
      );
    }
    root = route;
  }

  if (isRecord(root.deck)) {
    root = { ...root, ...root.deck };
  }

  const title =
    asString(root.deckTitle) ||
    asString(root.title) ||
    asString(root.name);
  if (!title) {
    throw generationArtifactError(
      "ARTIFACT_NORMALIZATION_FAILED",
      "deck: title/deckTitle required",
    );
  }

  const slidesRaw = Array.isArray(root.slides) ? root.slides : null;
  if (!slidesRaw || slidesRaw.length < 1) {
    throw generationArtifactError(
      "ARTIFACT_NORMALIZATION_FAILED",
      "deck: slides[] required",
    );
  }

  const slides = slidesRaw.map((item, order) => {
    if (!isRecord(item)) {
      throw generationArtifactError(
        "GENERATION_OUTPUT_MALFORMED",
        "deck slides must be objects",
      );
    }
    const slideTitle = asString(item.title) || asString(item.heading);
    if (!slideTitle) {
      throw generationArtifactError(
        "ARTIFACT_NORMALIZATION_FAILED",
        `deck slide[${order}] missing title`,
      );
    }

    // Already DeckSpec elements?
    if (Array.isArray(item.elements)) {
      return {
        id: stableSlideId(order, asString(item.id)),
        order,
        layoutRef: asString(item.layout) || asString(item.layoutRef),
        elements: item.elements as DeckElement[],
        notes: asString(item.notes),
      };
    }

    const elements: DeckElement[] = [];
    elements.push({
      id: stableElementId(order, "title", asString(item.titleElementId)),
      type: "text",
      content: slideTitle,
      bounds: { x: 0.08, y: 0.1, width: 0.84, height: 0.12 },
      zIndex: 2,
      style: { fontRole: "title", textAlign: "left" },
    });

    const bullets = Array.isArray(item.bullets)
      ? item.bullets.filter(
          (b): b is string => typeof b === "string" && b.trim().length > 0,
        )
      : [];
    const body =
      bullets.length > 0
        ? bullets.map((b) => `• ${b}`).join("\n")
        : asString(item.body) || asString(item.content) || asString(item.text);

    if (body) {
      elements.push({
        id: stableElementId(order, "body"),
        type: "text",
        content: body,
        bounds: { x: 0.08, y: 0.28, width: 0.55, height: 0.5 },
        zIndex: 2,
        style: { fontRole: "body" },
      });
    }

    // visualCue is a prompt string — never treat as Vault ObjectId
    const visualCue = asString(item.visualCue);
    const vaultForSlide = vaultAssetIds[order] || vaultAssetIds[0];
    if (vaultForSlide) {
      elements.push({
        id: stableElementId(order, "image"),
        type: "image",
        vaultAssetId: vaultForSlide,
        alt: visualCue || "Slide image",
        bounds: { x: 0.66, y: 0.25, width: 0.26, height: 0.45 },
        zIndex: 1,
      });
    } else if (visualCue) {
      // Preserve cue as text annotation element (not an asset)
      elements.push({
        id: stableElementId(order, "visual_cue"),
        type: "text",
        content: `[visualCue] ${visualCue}`,
        bounds: { x: 0.08, y: 0.82, width: 0.84, height: 0.08 },
        zIndex: 1,
        style: { fontRole: "body", opacity: 0.7 },
      });
    }

    elements.push({
      id: stableElementId(order, "accent"),
      type: "shape",
      shape: "rect",
      bounds: { x: 0.08, y: 0.22, width: 0.1, height: 0.008 },
      zIndex: 0,
      style: { fill: { kind: "token", value: "color.accent" } },
    });

    return {
      id: stableSlideId(order, asString(item.id)),
      order,
      layoutRef: asString(item.layout) || "content_bullets",
      elements,
      notes: asString(item.notes),
    };
  });

  return {
    schemaId: presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.deck),
    metadata: {
      title,
      subtitle: asString(root.deckSubtitle) || asString(root.subtitle),
      dimensions: { ...DEFAULT_DECK_DIMENSIONS },
    },
    designSystemRef: {
      artifactId: opts.designSystemRef.artifactId,
      version: opts.designSystemRef.version,
      artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
    },
    slides,
  };
}
