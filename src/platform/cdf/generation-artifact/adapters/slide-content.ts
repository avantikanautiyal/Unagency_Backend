/**
 * Legacy / provider output → presentation.slide-content
 */

import {
  PRESENTATION_ARTIFACT_KEYS,
  presentationSchemaId,
} from "../../artifacts/presentation/keys";
import type {
  PresentationSlideContentData,
  SlideContentBlockType,
} from "../../artifacts/presentation/types";
import { generationArtifactError } from "../errors";
import { asString, isRecord, requireRecord, unwrapProviderEnvelope } from "../parse";
import { stableBlockId, stableSlideId } from "../stable-ids";

const BLOCK_TYPES = new Set<SlideContentBlockType>([
  "heading",
  "paragraph",
  "bullets",
  "table",
  "metric",
  "quote",
  "callout",
  "image_prompt",
  "other",
]);

export function normalizePresentationSlideContent(
  raw: unknown,
): PresentationSlideContentData {
  const root = unwrapProviderEnvelope(
    requireRecord(raw, "presentation.slide-content"),
  );

  if (
    root.schemaId ===
    presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.slideContent)
  ) {
    return root as unknown as PresentationSlideContentData;
  }

  // Legacy PresentationPlan / single deck slides
  const slidesRaw = Array.isArray(root.slides)
    ? root.slides
    : isRecord(root.deck) && Array.isArray(root.deck.slides)
      ? root.deck.slides
      : null;

  if (!slidesRaw || slidesRaw.length < 1) {
    throw generationArtifactError(
      "ARTIFACT_NORMALIZATION_FAILED",
      "presentation.slide-content: slides[] required",
    );
  }

  const slides = slidesRaw.map((item, order) => {
    if (!isRecord(item)) {
      throw generationArtifactError(
        "GENERATION_OUTPUT_MALFORMED",
        "slide-content slides must be objects",
      );
    }
    const title = asString(item.title) || asString(item.heading);
    if (!title) {
      throw generationArtifactError(
        "ARTIFACT_NORMALIZATION_FAILED",
        `slide-content slide[${order}] missing title`,
      );
    }

    const blocks: PresentationSlideContentData["slides"][0]["blocks"] = [];

    if (Array.isArray(item.blocks)) {
      item.blocks.forEach((b, bi) => {
        if (!isRecord(b)) return;
        const typeRaw = asString(b.type) || "other";
        const type = (
          BLOCK_TYPES.has(typeRaw as SlideContentBlockType)
            ? typeRaw
            : "other"
        ) as SlideContentBlockType;
        if (!("content" in b)) {
          throw generationArtifactError(
            "ARTIFACT_NORMALIZATION_FAILED",
            `block missing content on slide ${order}`,
          );
        }
        blocks.push({
          id: stableBlockId(order, bi, type, asString(b.id)),
          type,
          content: b.content,
          hierarchy: typeof b.hierarchy === "number" ? b.hierarchy : bi + 1,
        });
      });
    } else {
      // Map legacy bullets / body / visualCue → content blocks (WHAT, not WHERE)
      let bi = 0;
      blocks.push({
        id: stableBlockId(order, bi++, "heading"),
        type: "heading",
        content: title,
        hierarchy: 1,
      });
      const subtitle = asString(item.subtitle);
      if (subtitle) {
        blocks.push({
          id: stableBlockId(order, bi++, "paragraph"),
          type: "paragraph",
          content: subtitle,
          hierarchy: 2,
        });
      }
      const bullets = Array.isArray(item.bullets)
        ? item.bullets.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        : [];
      if (bullets.length) {
        blocks.push({
          id: stableBlockId(order, bi++, "bullets"),
          type: "bullets",
          content: bullets,
          hierarchy: 2,
        });
      }
      const body = asString(item.body) || asString(item.content) || asString(item.text);
      if (body && !bullets.length) {
        blocks.push({
          id: stableBlockId(order, bi++, "paragraph"),
          type: "paragraph",
          content: body,
          hierarchy: 2,
        });
      }
      const visualCue = asString(item.visualCue);
      if (visualCue) {
        blocks.push({
          id: stableBlockId(order, bi++, "image_prompt"),
          type: "image_prompt",
          content: visualCue,
          hierarchy: 3,
        });
      }
    }

    if (blocks.length < 1) {
      throw generationArtifactError(
        "ARTIFACT_NORMALIZATION_FAILED",
        `slide-content slide[${order}] has no content blocks`,
      );
    }

    return {
      id: stableSlideId(order, asString(item.id)),
      order,
      title,
      subtitle: asString(item.subtitle),
      blocks,
      notes: asString(item.notes),
    };
  });

  return {
    schemaId: presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.slideContent),
    slides,
  };
}
