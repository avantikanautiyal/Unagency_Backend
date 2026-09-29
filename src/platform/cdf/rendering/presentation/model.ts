/**
 * Shared DeckSpec → canonical render primitives (format-agnostic).
 * PPTX and PDF adapters consume this model — no second creative SoT.
 */

import type {
  DeckElement,
  DeckSpec,
  PresentationDesignSystemData,
} from "../../artifacts/presentation/types";
import { renderError } from "../errors";
import {
  normalizedToPhysical,
  slideSizeInches,
  slideSizePoints,
  type PhysicalRect,
  type SlidePhysicalSize,
} from "./coords";
import { resolveFont, type ResolvedFont } from "./fonts";
import { resolveTokenOrLiteral } from "./tokens";

export type RenderPrimitiveKind =
  | "text"
  | "image"
  | "shape"
  | "table"
  | "background";

export type TextPrimitive = {
  kind: "text";
  id: string;
  zIndex: number;
  rect: PhysicalRect;
  content: string;
  color: string;
  font: ResolvedFont;
  fontSizePt: number;
  align: "left" | "center" | "right" | "justify";
  opacity: number;
};

export type ImagePrimitive = {
  kind: "image";
  id: string;
  zIndex: number;
  rect: PhysicalRect;
  vaultAssetId: string;
  bytes: Uint8Array;
  opacity: number;
  alt?: string;
};

export type ShapePrimitive = {
  kind: "shape";
  id: string;
  zIndex: number;
  rect: PhysicalRect;
  shape: "rect" | "ellipse" | "line";
  fill?: string;
  stroke?: string;
  strokeWidth: number;
  opacity: number;
  cornerRadius?: number;
};

export type TablePrimitive = {
  kind: "table";
  id: string;
  zIndex: number;
  rect: PhysicalRect;
  rows: string[][];
  color: string;
  font: ResolvedFont;
  fontSizePt: number;
  opacity: number;
};

export type BackgroundPrimitive = {
  kind: "background";
  id: string;
  zIndex: number;
  color: string;
};

export type SlidePrimitive =
  | TextPrimitive
  | ImagePrimitive
  | ShapePrimitive
  | TablePrimitive
  | BackgroundPrimitive;

export type CanonicalSlideRenderModel = {
  slideId: string;
  order: number;
  notes?: string;
  primitives: SlidePrimitive[];
};

export type CanonicalDeckRenderModel = {
  title: string;
  subtitle?: string;
  slideSize: SlidePhysicalSize;
  slides: CanonicalSlideRenderModel[];
  designSystemName?: string;
  designSystemArtifactId: string;
  designSystemVersion: number;
  fontFallbacksUsed: string[];
};

function asDesignSystem(
  data: Record<string, unknown> | undefined,
): PresentationDesignSystemData | undefined {
  if (!data) return undefined;
  if (!data.colors || typeof data.colors !== "object") return undefined;
  if (!data.fontRoles || typeof data.fontRoles !== "object") return undefined;
  return data as unknown as PresentationDesignSystemData;
}

function asDeckSpec(data: Record<string, unknown>): DeckSpec {
  if (!data.metadata || !data.slides || !data.designSystemRef) {
    throw renderError("INVALID_DECK_SPEC", "DeckSpec missing metadata/slides/designSystemRef");
  }
  return data as unknown as DeckSpec;
}

function sortElements(elements: DeckElement[]): DeckElement[] {
  return [...elements].sort((a, b) => {
    if (a.zIndex !== b.zIndex) return a.zIndex - b.zIndex;
    return a.id.localeCompare(b.id);
  });
}

function flattenElements(elements: DeckElement[]): DeckElement[] {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const out: DeckElement[] = [];
  const visited = new Set<string>();

  function visit(el: DeckElement): void {
    if (visited.has(el.id)) return;
    visited.add(el.id);
    if (el.type === "group") {
      for (const childId of el.childIds) {
        const child = byId.get(childId);
        if (!child) {
          throw renderError(
            "INVALID_DECK_SPEC",
            `Group ${el.id} references missing child ${childId}`,
          );
        }
        visit(child);
      }
      return;
    }
    out.push(el);
  }

  for (const el of sortElements(elements)) visit(el);
  return sortElements(out);
}

export type BuildModelInput = {
  deckData: Record<string, unknown>;
  designSystemData?: Record<string, unknown>;
  resolvedAssets: ReadonlyMap<string, Uint8Array>;
  unit: "in" | "pt";
  strictFonts?: boolean;
  /** When true, chart/graphic/path throw; when false still throw (safe subset only). */
  allowUnsupported?: boolean;
};

export function buildCanonicalDeckRenderModel(
  input: BuildModelInput,
): CanonicalDeckRenderModel {
  const deck = asDeckSpec(input.deckData);
  const ds = asDesignSystem(input.designSystemData);
  const slideSize =
    input.unit === "in"
      ? slideSizeInches(deck.metadata.dimensions)
      : slideSizePoints(deck.metadata.dimensions);

  const fontFallbacksUsed: string[] = [];
  const slides = [...deck.slides]
    .sort((a, b) => a.order - b.order)
    .map((slide) => {
      const primitives: SlidePrimitive[] = [];

      if (slide.background) {
        primitives.push({
          kind: "background",
          id: `${slide.id}__bg`,
          zIndex: -1,
          color: resolveTokenOrLiteral(slide.background, ds, "#FFFFFF"),
        });
      }

      for (const el of flattenElements(slide.elements)) {
        if (el.visible === false) continue;
        const rect = normalizedToPhysical(el.bounds, slideSize);
        const opacity = el.style?.opacity ?? 1;

        if (el.type === "text") {
          const roleName = el.style?.fontRole ?? "body";
          const role = ds?.fontRoles?.[roleName] ?? ds?.fontRoles?.body;
          const family = role?.family ?? "Helvetica";
          const weight = el.style?.fontWeight ?? role?.weight;
          const font = resolveFont({
            family,
            weight,
            strictFonts: input.strictFonts,
          });
          if (font.usedFallback) fontFallbacksUsed.push(font.fallbackReason ?? family);
          const fontSizePt =
            typeof el.style?.fontSize === "number"
              ? el.style.fontSize
              : typeof role?.size === "number"
                ? role.size
                : 16;
          primitives.push({
            kind: "text",
            id: el.id,
            zIndex: el.zIndex,
            rect,
            content: el.content,
            color: resolveTokenOrLiteral(el.style?.color, ds, "#0B0B0F"),
            font,
            fontSizePt,
            align: el.style?.textAlign ?? "left",
            opacity,
          });
          continue;
        }

        if (el.type === "image") {
          const bytes = input.resolvedAssets.get(el.vaultAssetId);
          if (!bytes) {
            throw renderError(
              "ASSET_NOT_FOUND",
              `Required image asset missing: ${el.vaultAssetId}`,
              { vaultAssetId: el.vaultAssetId, elementId: el.id },
            );
          }
          primitives.push({
            kind: "image",
            id: el.id,
            zIndex: el.zIndex,
            rect,
            vaultAssetId: el.vaultAssetId,
            bytes,
            opacity,
            alt: el.alt,
          });
          continue;
        }

        if (el.type === "shape") {
          if (el.shape === "path" || el.shape === "other") {
            throw renderError(
              "UNSUPPORTED_DECK_ELEMENT",
              `Shape kind '${el.shape}' is not representable in M5B`,
              { elementId: el.id, shape: el.shape },
            );
          }
          primitives.push({
            kind: "shape",
            id: el.id,
            zIndex: el.zIndex,
            rect,
            shape: el.shape,
            fill: el.style?.fill
              ? resolveTokenOrLiteral(el.style.fill, ds)
              : undefined,
            stroke: el.style?.stroke
              ? resolveTokenOrLiteral(el.style.stroke, ds)
              : undefined,
            strokeWidth: el.style?.strokeWidth ?? 0,
            opacity,
            cornerRadius: el.style?.cornerRadius,
          });
          continue;
        }

        if (el.type === "table") {
          const role = ds?.fontRoles?.body;
          const font = resolveFont({
            family: role?.family ?? "Helvetica",
            weight: role?.weight,
            strictFonts: input.strictFonts,
          });
          if (font.usedFallback) fontFallbacksUsed.push(font.fallbackReason ?? font.requestedFamily);
          primitives.push({
            kind: "table",
            id: el.id,
            zIndex: el.zIndex,
            rect,
            rows: el.rows.map((r) => [...r]),
            color: resolveTokenOrLiteral(el.style?.color, ds, "#0B0B0F"),
            font,
            fontSizePt:
              typeof el.style?.fontSize === "number"
                ? el.style.fontSize
                : role?.size ?? 12,
            opacity,
          });
          continue;
        }

        if (el.type === "chart") {
          throw renderError(
            "UNSUPPORTED_DECK_ELEMENT",
            "Chart elements lack typed series data in M3B — not fabricated by M5B",
            { elementId: el.id, chartType: el.chartType },
          );
        }

        if (el.type === "graphic") {
          throw renderError(
            "UNSUPPORTED_DECK_ELEMENT",
            "Graphic elements require structured primitives or vault assets — not implemented in M5B safe subset",
            { elementId: el.id, graphicKind: el.graphicKind },
          );
        }
      }

      return {
        slideId: slide.id,
        order: slide.order,
        notes: slide.notes,
        primitives: primitives.sort((a, b) => {
          if (a.zIndex !== b.zIndex) return a.zIndex - b.zIndex;
          return a.id.localeCompare(b.id);
        }),
      };
    });

  return {
    title: deck.metadata.title,
    subtitle: deck.metadata.subtitle,
    slideSize,
    slides,
    designSystemName: ds?.name,
    designSystemArtifactId: deck.designSystemRef.artifactId,
    designSystemVersion: deck.designSystemRef.version,
    fontFallbacksUsed: [...new Set(fontFallbacksUsed)],
  };
}
