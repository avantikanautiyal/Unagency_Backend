/**
 * Social Media coordinate / dimension systems (M9A).
 *
 * Do NOT reuse Presentation slide_normalized — Social Media CDF uses pixel
 * canvases from production-spec / user-entered size, not deck slides.
 *
 * Systems:
 * 1) social_pixel — absolute pixel width × height for a single creative frame
 *    - Units: CSS/device-independent pixels as used by format-production-spec
 *    - Fields: widthPx, heightPx (positive integers)
 *    - Origin for on-image layout elements: UNRESOLVED (legacy is whole-frame raster)
 *
 * Platform masters (evidence in format-production-spec / identity-system):
 *   1080×1080, 1080×1350, 1080×1920, 1920×1080, etc.
 * Those are documented defaults — not hard-coded as the only valid canvases.
 *
 * Carousel multi-frame geometry, story/reel timelines, and normalized
 * on-image element boxes are UNRESOLVED in the CDF creative path (single image).
 */

export const SOCIAL_MEDIA_PIXEL_COORDINATE_SYSTEM = "social_pixel" as const;

export type SocialMediaPixelCoordinateSystem =
  typeof SOCIAL_MEDIA_PIXEL_COORDINATE_SYSTEM;

export type SocialMediaPixelCanvas = {
  widthPx: number;
  heightPx: number;
  coordinateSystem: SocialMediaPixelCoordinateSystem;
  /**
   * Where the canvas came from in the size-reference / production path.
   * Optional — absent means unspecified / provider-defined.
   */
  source?:
    | "user_entered"
    | "platform_default"
    | "reference_asset"
    | "production_spec"
    | "unspecified";
  /** Human label e.g. "1080x1350" — informational only. */
  label?: string;
  /**
   * On-image element placement boxes are UNRESOLVED for current raster SoT.
   * When true, consumers must not assume element_* coordinates exist.
   */
  elementLayoutUnresolved?: true;
};

export function isValidPositivePx(n: unknown): n is number {
  return (
    typeof n === "number" &&
    Number.isFinite(n) &&
    Number.isInteger(n) &&
    n > 0
  );
}

export function isValidSocialMediaPixelCanvas(
  c: SocialMediaPixelCanvas,
): boolean {
  return (
    c.coordinateSystem === SOCIAL_MEDIA_PIXEL_COORDINATE_SYSTEM &&
    isValidPositivePx(c.widthPx) &&
    isValidPositivePx(c.heightPx)
  );
}
