/**
 * Renderer-independent coordinate model for DeckSpec (M3B).
 *
 * System: slide_normalized
 * - Origin: top-left of the slide
 * - x, y, width, height are fractions of slide width / height in [0, 1]
 * - rotation: degrees clockwise from upright
 *
 * Renderers convert to PPTX EMUs, PDF points, or CSS pixels using slide
 * dimensions (widthUnits × heightUnits) from DeckSpec.metadata.dimensions.
 */

export const DECK_COORDINATE_SYSTEM = "slide_normalized" as const;

export type DeckCoordinateSystem = typeof DECK_COORDINATE_SYSTEM;

export type DeckBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees clockwise; optional. */
  rotation?: number;
};

export type DeckDimensions = {
  /** Logical canvas width (default 16 for 16:9). */
  widthUnits: number;
  /** Logical canvas height (default 9 for 16:9). */
  heightUnits: number;
  aspectRatio: string;
  coordinateSystem: DeckCoordinateSystem;
};

export const DEFAULT_DECK_DIMENSIONS: DeckDimensions = {
  widthUnits: 16,
  heightUnits: 9,
  aspectRatio: "16:9",
  coordinateSystem: DECK_COORDINATE_SYSTEM,
};

export function isValidNormalizedBounds(b: DeckBounds): boolean {
  if (
    typeof b.x !== "number" ||
    typeof b.y !== "number" ||
    typeof b.width !== "number" ||
    typeof b.height !== "number"
  ) {
    return false;
  }
  if (
    !Number.isFinite(b.x) ||
    !Number.isFinite(b.y) ||
    !Number.isFinite(b.width) ||
    !Number.isFinite(b.height)
  ) {
    return false;
  }
  if (b.width < 0 || b.height < 0) return false;
  if (b.x < 0 || b.y < 0 || b.x > 1 || b.y > 1) return false;
  if (b.x + b.width > 1.0001 || b.y + b.height > 1.0001) return false;
  if (b.rotation != null && !Number.isFinite(b.rotation)) return false;
  return true;
}
