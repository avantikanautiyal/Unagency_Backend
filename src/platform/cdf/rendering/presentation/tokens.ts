/**
 * Design-token + color resolution against an exact Design System version.
 */

import type {
  DesignTokenRef,
  PresentationDesignSystemData,
} from "../../artifacts/presentation/types";

export function resolveTokenOrLiteral(
  value: DesignTokenRef | string | undefined,
  designSystem: PresentationDesignSystemData | undefined,
  fallback = "#000000",
): string {
  if (value == null) return fallback;
  if (typeof value === "string") {
    if (value.startsWith("color.") || value.includes(".")) {
      const fromDs = designSystem?.colors?.[value];
      if (fromDs) return normalizeHex(fromDs, fallback);
    }
    return normalizeHex(value, fallback);
  }
  if (value.kind === "literal") return normalizeHex(value.value, fallback);
  const token = designSystem?.colors?.[value.value];
  if (token) return normalizeHex(token, fallback);
  return fallback;
}

export function normalizeHex(raw: string, fallback: string): string {
  const t = raw.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t)) {
    if (t.length === 4) {
      return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`.toUpperCase();
    }
    return t.toUpperCase();
  }
  if (/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t)) {
    return normalizeHex(`#${t}`, fallback);
  }
  return fallback;
}

/** PPTX colors are 6-hex without #. */
export function pptxHex(raw: string, fallback = "000000"): string {
  const n = normalizeHex(raw, `#${fallback}`).replace(/^#/, "");
  return n.toUpperCase();
}
