/**
 * Render options validation (M5) — keep small and deterministic.
 */

import { renderError } from "./errors";
import type { CdfRenderOptions } from "./types";

export function normalizeRenderOptions(
  options?: CdfRenderOptions,
): CdfRenderOptions {
  const o = options ?? {};
  if (o.imageQuality != null) {
    if (
      typeof o.imageQuality !== "number" ||
      !Number.isFinite(o.imageQuality) ||
      o.imageQuality < 1 ||
      o.imageQuality > 100
    ) {
      throw renderError(
        "INVALID_RENDER_OPTIONS",
        "imageQuality must be a number between 1 and 100",
        { imageQuality: o.imageQuality },
      );
    }
  }
  if (o.widthPx != null && (typeof o.widthPx !== "number" || o.widthPx <= 0)) {
    throw renderError("INVALID_RENDER_OPTIONS", "widthPx must be a positive number", {
      widthPx: o.widthPx,
    });
  }
  if (o.heightPx != null && (typeof o.heightPx !== "number" || o.heightPx <= 0)) {
    throw renderError(
      "INVALID_RENDER_OPTIONS",
      "heightPx must be a positive number",
      { heightPx: o.heightPx },
    );
  }
  if (
    o.background != null &&
    o.background !== "preserve" &&
    o.background !== "transparent" &&
    o.background !== "white"
  ) {
    throw renderError(
      "INVALID_RENDER_OPTIONS",
      `Invalid background: ${String(o.background)}`,
    );
  }
  if (o.extras) {
    for (const [k, v] of Object.entries(o.extras)) {
      const t = typeof v;
      if (v !== null && t !== "string" && t !== "number" && t !== "boolean") {
        throw renderError(
          "INVALID_RENDER_OPTIONS",
          `extras.${k} must be a primitive`,
          { key: k },
        );
      }
    }
  }
  return {
    pageSize: o.pageSize,
    widthPx: o.widthPx,
    heightPx: o.heightPx,
    imageQuality: o.imageQuality,
    includeNotes: o.includeNotes,
    background: o.background,
    extras: o.extras ? { ...o.extras } : undefined,
  };
}
