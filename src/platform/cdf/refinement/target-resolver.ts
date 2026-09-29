/**
 * Resolve natural-language targets to exact DeckSpec IDs (M6).
 */

import type { DeckElement, DeckSpec, DeckSlide } from "../artifacts/presentation/types";
import { refinementError } from "./errors";
import type { ParsedRefinementIntent } from "./instruction-parser";
import type { CdfResolvedRefinementTarget } from "./types";

function slideByNumber(slides: DeckSlide[], n: number): DeckSlide | undefined {
  const ordered = [...slides].sort((a, b) => a.order - b.order);
  return ordered[n - 1];
}

function isTitleLike(el: DeckElement): boolean {
  if (el.type !== "text") return false;
  const id = el.id.toLowerCase();
  const role = String(el.style?.fontRole ?? "").toLowerCase();
  if (id.includes("subtitle") || role === "subtitle") return false;
  return (
    id.includes("title") ||
    id.includes("headline") ||
    role === "title" ||
    role === "headline"
  );
}

function isSubtitleLike(el: DeckElement): boolean {
  if (el.type !== "text") return false;
  const id = el.id.toLowerCase();
  const role = String(el.style?.fontRole ?? "").toLowerCase();
  return id.includes("subtitle") || role === "subtitle";
}

function matchElements(
  slide: DeckSlide,
  hint: ParsedRefinementIntent["elementHint"],
): DeckElement[] {
  const els = slide.elements.filter((e) => e.visible !== false);
  switch (hint) {
    case "title":
    case "headline":
      return els.filter(isTitleLike);
    case "subtitle":
      return els.filter(isSubtitleLike);
    case "image":
      return els.filter((e) => e.type === "image");
    case "logo":
      return els.filter(
        (e) =>
          e.type === "image" &&
          (e.id.toLowerCase().includes("logo") ||
            (e.type === "image" && (e.alt ?? "").toLowerCase().includes("logo"))),
      );
    case "shape":
      return els.filter((e) => e.type === "shape");
    case "text":
      return els.filter((e) => e.type === "text");
    default:
      return [];
  }
}

export type TargetResolutionResult =
  | { status: "resolved"; target: CdfResolvedRefinementTarget }
  | {
      status: "requires_clarification";
      reason: string;
      candidates: string[];
    };

export function resolveRefinementTarget(input: {
  deck: DeckSpec;
  artifactId: string;
  artifactVersion: number;
  artifactKey: string;
  intent: ParsedRefinementIntent;
  preferredTargetPath?: string;
}): TargetResolutionResult {
  const { deck, intent } = input;

  if (input.preferredTargetPath) {
    const [slideId, elementId] = input.preferredTargetPath.split(".");
    const slide = deck.slides.find((s) => s.id === slideId);
    const el = slide?.elements.find((e) => e.id === elementId);
    if (slide && el) {
      return {
        status: "resolved",
        target: {
          artifactId: input.artifactId,
          artifactVersion: input.artifactVersion,
          artifactKey: input.artifactKey,
          slideId: slide.id,
          elementId: el.id,
          path: `${slide.id}.${el.id}`,
          targetKind:
            el.type === "text"
              ? "text_element"
              : el.type === "image"
                ? "image_element"
                : el.type === "shape"
                  ? "shape_element"
                  : el.type === "group"
                    ? "group"
                    : el.type === "table"
                      ? "table"
                      : "property",
        },
      };
    }
  }

  if (intent.scope === "artifact" && intent.op === "SET_TEXT_COLOR") {
    // Multi-slide title color — resolve as artifact-scoped (applied to all title-like)
    return {
      status: "resolved",
      target: {
        artifactId: input.artifactId,
        artifactVersion: input.artifactVersion,
        artifactKey: input.artifactKey,
        path: "artifact.titles",
        targetKind: "artifact",
      },
    };
  }

  if (intent.slideNumber == null) {
    const candidates: string[] = [];
    for (const slide of [...deck.slides].sort((a, b) => a.order - b.order)) {
      for (const el of matchElements(slide, intent.elementHint ?? "title")) {
        candidates.push(`${slide.id}.${el.id}`);
      }
    }
    if (candidates.length === 0) {
      throw refinementError(
        "TARGET_NOT_FOUND",
        `No matching elements for hint=${intent.elementHint ?? "unknown"}`,
      );
    }
    return {
      status: "requires_clarification",
      reason: "AMBIGUOUS_TARGET",
      candidates,
    };
  }

  const slide = slideByNumber(deck.slides, intent.slideNumber);
  if (!slide) {
    throw refinementError(
      "TARGET_NOT_FOUND",
      `Slide ${intent.slideNumber} not found (deck has ${deck.slides.length} slides)`,
      { slideNumber: intent.slideNumber },
    );
  }

  if (!intent.elementHint && intent.scope === "slide") {
    return {
      status: "resolved",
      target: {
        artifactId: input.artifactId,
        artifactVersion: input.artifactVersion,
        artifactKey: input.artifactKey,
        slideId: slide.id,
        path: slide.id,
        targetKind: "slide",
      },
    };
  }

  const matches = matchElements(slide, intent.elementHint ?? "title");
  if (matches.length === 0) {
    throw refinementError(
      "TARGET_NOT_FOUND",
      `No ${intent.elementHint ?? "element"} on ${slide.id}`,
      { slideId: slide.id },
    );
  }
  if (matches.length > 1) {
    return {
      status: "requires_clarification",
      reason: "AMBIGUOUS_TARGET",
      candidates: matches.map((m) => `${slide.id}.${m.id}`),
    };
  }

  const el = matches[0]!;
  return {
    status: "resolved",
    target: {
      artifactId: input.artifactId,
      artifactVersion: input.artifactVersion,
      artifactKey: input.artifactKey,
      slideId: slide.id,
      elementId: el.id,
      path: `${slide.id}.${el.id}`,
      targetKind:
        el.type === "text"
          ? "text_element"
          : el.type === "image"
            ? "image_element"
            : el.type === "shape"
              ? "shape_element"
              : "property",
    },
  };
}
