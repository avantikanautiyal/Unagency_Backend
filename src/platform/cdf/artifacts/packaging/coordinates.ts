/**
 * Packaging coordinate systems (M8A).
 *
 * Do NOT use Presentation slide_normalized unless a surface is explicitly
 * modeled as a 2D panel canvas. Packaging production language uses physical mm.
 *
 * Systems:
 * 1) physical_mm — dieline / pack outer dimensions
 *    - Units: millimeters
 *    - Fields: widthMm, heightMm, depthMm (optional)
 *    - Origin / fold-path axes: UNRESOLVED until a geometry materializer exists
 *      (legacy runtime has no structured dieline SoT today)
 *    - Precision: finite numbers > 0; no silent unit conversion
 *
 * 2) panel_normalized — optional artwork placement on a named panel
 *    - Origin: top-left of the panel
 *    - x, y, width, height in [0, 1] of panel width/height
 *    - Same bounds rules as Presentation slide_normalized, but panel-scoped
 *
 * 3) view_camera — lightweight descriptive camera notes for views/3d
 *    - Not a full scene graph; azimuth/elevation degrees when present
 */

export const PACKAGING_PHYSICAL_COORDINATE_SYSTEM = "physical_mm" as const;
export const PACKAGING_PANEL_COORDINATE_SYSTEM = "panel_normalized" as const;
export const PACKAGING_VIEW_CAMERA_SYSTEM = "view_camera_degrees" as const;

export type PackagingPhysicalCoordinateSystem =
  typeof PACKAGING_PHYSICAL_COORDINATE_SYSTEM;
export type PackagingPanelCoordinateSystem =
  typeof PACKAGING_PANEL_COORDINATE_SYSTEM;

export type PackagingPhysicalDimensions = {
  widthMm: number;
  heightMm: number;
  depthMm?: number;
  coordinateSystem: PackagingPhysicalCoordinateSystem;
  /**
   * UNRESOLVED: fold/cut path origin & axis direction are not defined by
   * the current Packaging runtime. Do not invent SVG path semantics here.
   */
  geometryOriginUnresolved?: true;
};

export type PackagingPanelBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  coordinateSystem: PackagingPanelCoordinateSystem;
};

export type PackagingViewCamera = {
  coordinateSystem: typeof PACKAGING_VIEW_CAMERA_SYSTEM;
  /** Degrees; optional descriptive metadata only. */
  azimuthDeg?: number;
  elevationDeg?: number;
  distanceHint?: string;
};

export function isValidPositiveMm(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

export function isValidPanelNormalizedBounds(b: {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}): boolean {
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
