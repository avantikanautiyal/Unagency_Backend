/**
 * Coordinate conversion: slide_normalized → target units.
 *
 * DeckSpec stores x,y,width,height ∈ [0,1] relative to slide W/H.
 * Renderers must NOT mutate DeckSpec — conversion is ephemeral.
 *
 * Formulas (origin top-left):
 *   x_out = x_norm * slideWidth
 *   y_out = y_norm * slideHeight
 *   w_out = width_norm * slideWidth
 *   h_out = height_norm * slideHeight
 *
 * PPTX uses inches (PptxGenJS).
 * PDF uses points (PDFKit; 72pt = 1in).
 */

import type { DeckBounds, DeckDimensions } from "../../artifacts/presentation/coordinates";
import { renderError } from "../errors";

/** Base slide width in inches for PPTX (height derived from aspect). */
export const PPTX_BASE_WIDTH_IN = 10;

/** Base slide width in points for PDF (height derived from aspect). */
export const PDF_BASE_WIDTH_PT = 720; // 10in * 72

export type PhysicalRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  rotationDeg: number;
};

export type SlidePhysicalSize = {
  width: number;
  height: number;
  unit: "in" | "pt";
  aspectRatio: string;
  widthUnits: number;
  heightUnits: number;
};

export function assertSupportedDimensions(dims: DeckDimensions): void {
  if (
    !Number.isFinite(dims.widthUnits) ||
    !Number.isFinite(dims.heightUnits) ||
    dims.widthUnits <= 0 ||
    dims.heightUnits <= 0
  ) {
    throw renderError(
      "UNSUPPORTED_DIMENSIONS",
      `Invalid deck dimensions: ${dims.widthUnits}×${dims.heightUnits}`,
      { dimensions: dims },
    );
  }
  if (dims.coordinateSystem !== "slide_normalized") {
    throw renderError(
      "UNSUPPORTED_DIMENSIONS",
      `Unsupported coordinate system: ${dims.coordinateSystem}`,
      { dimensions: dims },
    );
  }
  const ratio = dims.widthUnits / dims.heightUnits;
  // Guard pathological aspect ratios
  if (ratio < 0.2 || ratio > 5) {
    throw renderError(
      "UNSUPPORTED_DIMENSIONS",
      `Aspect ratio out of supported range: ${dims.aspectRatio} (${ratio})`,
      { dimensions: dims },
    );
  }
}

export function slideSizeInches(dims: DeckDimensions): SlidePhysicalSize {
  assertSupportedDimensions(dims);
  const width = PPTX_BASE_WIDTH_IN;
  const height = (dims.heightUnits / dims.widthUnits) * width;
  return {
    width,
    height,
    unit: "in",
    aspectRatio: dims.aspectRatio,
    widthUnits: dims.widthUnits,
    heightUnits: dims.heightUnits,
  };
}

export function slideSizePoints(dims: DeckDimensions): SlidePhysicalSize {
  assertSupportedDimensions(dims);
  const width = PDF_BASE_WIDTH_PT;
  const height = (dims.heightUnits / dims.widthUnits) * width;
  return {
    width,
    height,
    unit: "pt",
    aspectRatio: dims.aspectRatio,
    widthUnits: dims.widthUnits,
    heightUnits: dims.heightUnits,
  };
}

export function normalizedToPhysical(
  bounds: DeckBounds,
  slide: SlidePhysicalSize,
): PhysicalRect {
  return {
    x: bounds.x * slide.width,
    y: bounds.y * slide.height,
    w: bounds.width * slide.width,
    h: bounds.height * slide.height,
    rotationDeg: bounds.rotation ?? 0,
  };
}
