/**
 * Legacy / provider output → presentation.storyline
 */

import {
  PRESENTATION_ARTIFACT_KEYS,
  presentationSchemaId,
} from "../../artifacts/presentation/keys";
import type { PresentationStorylineData } from "../../artifacts/presentation/types";
import { generationArtifactError } from "../errors";
import { asString, isRecord, requireRecord, unwrapProviderEnvelope } from "../parse";
import { stableSectionId, stableSlideId } from "../stable-ids";

export function normalizePresentationStoryline(
  raw: unknown,
): PresentationStorylineData {
  const root = unwrapProviderEnvelope(requireRecord(raw, "presentation.storyline"));

  if (root.schemaId === presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.storyline)) {
    return root as unknown as PresentationStorylineData;
  }

  // Structured legacy: { objective, audience, slides: [{ title, purpose, keyMessage }] }
  const slidesRaw = Array.isArray(root.slides)
    ? root.slides
    : Array.isArray(root.slideIntentions)
      ? root.slideIntentions
      : null;

  if (!slidesRaw || slidesRaw.length < 1) {
    throw generationArtifactError(
      "ARTIFACT_NORMALIZATION_FAILED",
      "presentation.storyline: slides[] or slideIntentions[] required (refuse to invent narrative)",
    );
  }

  const sectionsIn = Array.isArray(root.sections) ? root.sections : [];
  const slides = slidesRaw.map((item, order) => {
    if (!isRecord(item)) {
      throw generationArtifactError(
        "GENERATION_OUTPUT_MALFORMED",
        "presentation.storyline: slide entries must be objects",
      );
    }
    const title = asString(item.title) || asString(item.name);
    if (!title) {
      throw generationArtifactError(
        "ARTIFACT_NORMALIZATION_FAILED",
        `presentation.storyline: slide[${order}] missing title`,
      );
    }
    return {
      id: stableSlideId(order, asString(item.id)),
      order,
      title,
      purpose: asString(item.purpose) || asString(item.intent),
      keyMessage: asString(item.keyMessage) || asString(item.message),
      sectionId: asString(item.sectionId),
      transitionNote: asString(item.transitionNote) || asString(item.transition),
    };
  });

  const sections =
    sectionsIn.length > 0
      ? sectionsIn.map((sec, order) => {
          if (!isRecord(sec)) {
            throw generationArtifactError(
              "GENERATION_OUTPUT_MALFORMED",
              "presentation.storyline: sections must be objects",
            );
          }
          const title = asString(sec.title) || `Section ${order + 1}`;
          const id = stableSectionId(order, title, asString(sec.id));
          const slideIds = Array.isArray(sec.slideIds)
            ? (sec.slideIds as unknown[]).filter(
                (x): x is string => typeof x === "string",
              )
            : slides.filter((s) => s.sectionId === id).map((s) => s.id);
          return {
            id,
            title,
            purpose: asString(sec.purpose),
            order: typeof sec.order === "number" ? sec.order : order,
            slideIds: slideIds.length ? slideIds : [slides[order]?.id].filter(Boolean) as string[],
          };
        })
      : [
          {
            id: stableSectionId(0, "Narrative"),
            title: "Narrative",
            purpose: "Primary narrative arc",
            order: 0,
            slideIds: slides.map((s) => s.id),
          },
        ];

  // Assign default section if missing
  for (const s of slides) {
    if (!s.sectionId) s.sectionId = sections[0]!.id;
  }

  const optionsRaw = Array.isArray(root.options) ? root.options : undefined;
  const options = optionsRaw
    ?.map((item, i) => {
      if (!isRecord(item)) return null;
      return {
        id: asString(item.id) || `opt_${i + 1}`,
        title: asString(item.title) || asString(item.name),
        summary: asString(item.summary) || asString(item.description),
      };
    })
    .filter((x): x is { id: string; title: string; summary: string } =>
      Boolean(x && (x.title || x.summary)),
    );

  return {
    schemaId: presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.storyline),
    objective: asString(root.objective) || asString(root.goal),
    audience: asString(root.audience),
    narrativeStrategy:
      asString(root.narrativeStrategy) || asString(root.strategy),
    sections,
    slides,
    ...(options && options.length ? { options } : {}),
    notes: asString(root.notes),
  };
}
