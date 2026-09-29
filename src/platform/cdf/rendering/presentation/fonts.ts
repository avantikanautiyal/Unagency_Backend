/**
 * Font resolution policy (M5B).
 *
 * DesignSystem.fontRoles provide family names. PDFKit embeds only standard fonts
 * unless custom font files are registered — M5B documents explicit safe fallbacks.
 */

import { renderError } from "../errors";

export type PdfStandardFont =
  | "Helvetica"
  | "Helvetica-Bold"
  | "Times-Roman"
  | "Times-Bold"
  | "Courier"
  | "Courier-Bold";

export type ResolvedFont = {
  requestedFamily: string;
  pptxFontFace: string;
  pdfFont: PdfStandardFont;
  usedFallback: boolean;
  fallbackReason?: string;
};

const SANS = new Set(
  [
    "helvetica",
    "arial",
    "inter",
    "roboto",
    "system",
    "sans-serif",
    "sf pro",
    "segoe ui",
    "verdana",
    "tahoma",
  ].map((s) => s.toLowerCase()),
);

const SERIF = new Set(
  ["times", "times new roman", "georgia", "garamond", "serif"].map((s) =>
    s.toLowerCase(),
  ),
);

const MONO = new Set(
  ["courier", "courier new", "menlo", "monaco", "monospace", "consolas"].map(
    (s) => s.toLowerCase(),
  ),
);

function pickPdfBase(family: string): {
  base: "Helvetica" | "Times-Roman" | "Courier";
  fallback: boolean;
} {
  const f = family.trim().toLowerCase();
  if (!f) return { base: "Helvetica", fallback: true };
  if (SANS.has(f) || f.includes("sans")) return { base: "Helvetica", fallback: f !== "helvetica" };
  if (SERIF.has(f) || f.includes("serif")) return { base: "Times-Roman", fallback: !f.includes("times") };
  if (MONO.has(f) || f.includes("mono")) return { base: "Courier", fallback: !f.includes("courier") };
  // Unmapped — safe documented sans fallback (logged by caller)
  return { base: "Helvetica", fallback: true };
}

function withWeight(
  base: "Helvetica" | "Times-Roman" | "Courier",
  weight?: number | string,
): PdfStandardFont {
  const bold =
    (typeof weight === "number" && weight >= 600) ||
    (typeof weight === "string" && /bold|700|800|900/i.test(weight));
  if (base === "Helvetica") return bold ? "Helvetica-Bold" : "Helvetica";
  if (base === "Times-Roman") return bold ? "Times-Bold" : "Times-Roman";
  return bold ? "Courier-Bold" : "Courier";
}

export type ResolveFontInput = {
  family: string;
  weight?: number | string;
  /** When true, unmapped families throw FONT_NOT_FOUND instead of falling back. */
  strictFonts?: boolean;
};

export function resolveFont(input: ResolveFontInput): ResolvedFont {
  const family = (input.family || "Helvetica").trim();
  const mapped = pickPdfBase(family);
  const known =
    SANS.has(family.toLowerCase()) ||
    SERIF.has(family.toLowerCase()) ||
    MONO.has(family.toLowerCase()) ||
    family.toLowerCase() === "helvetica";

  if (input.strictFonts && mapped.fallback && !known) {
    throw renderError(
      "FONT_NOT_FOUND",
      `Font family not safely renderable under strictFonts: ${family}`,
      { family },
    );
  }

  const usedFallback = mapped.fallback;
  if (usedFallback) {
    console.info(
      JSON.stringify({
        scope: "cdf.rendering.font",
        event: "font_fallback",
        requestedFamily: family,
        pdfFont: withWeight(mapped.base, input.weight),
        pptxFontFace: family || "Arial",
      }),
    );
  }

  return {
    requestedFamily: family,
    pptxFontFace: family || "Arial",
    pdfFont: withWeight(mapped.base, input.weight),
    usedFallback,
    fallbackReason: usedFallback
      ? `Mapped '${family}' → PDF standard ${mapped.base} (documented M5B policy)`
      : undefined,
  };
}
