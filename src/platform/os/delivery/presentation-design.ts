/**
 * Designer-template renderer for presentation exports.
 *
 * Every slide is laid out once as inch-based primitives on a 10 × 5.625in
 * canvas, then painted by both the PPTX and the PDF writer (PDF at 72pt/in),
 * so the two files match. Three themes follow the chosen design route:
 * Clean Minimal, Bold Executive and Modern Editorial.
 */

import PDFDocument from "pdfkit";
import PptxGenJS from "pptxgenjs";
import type {
  PresentationPlan,
  PresentationSlide,
  PresentationSlideImage,
} from "./document-export-service";

export type PresentationDesignStyle = "minimal" | "executive" | "editorial";

export type PresentationDesignOptions = {
  readonly brandName?: string;
  readonly brandColors?: readonly string[];
  readonly designStyle?: PresentationDesignStyle;
};

const W = 10;
const H = 5.625;
const M = 0.6;
const PT = 72;
const DEFAULT_ACCENT = "FF0056";

type Box = { x: number; y: number; w: number; h: number };
type FontRole = "heading" | "body" | "bodyBold";
type TextPrim = Box & {
  kind: "text";
  text: string;
  size: number;
  color: string;
  font: FontRole;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  spacing?: number;
};
type Prim =
  | (Box & { kind: "rect"; fill: string; opacity?: number })
  | (Box & { kind: "ellipse"; fill?: string; line?: string; lineWidth?: number; opacity?: number })
  | (Box & { kind: "image"; image: PresentationSlideImage })
  | TextPrim;
type SlideScene = { bg: string; prims: Prim[]; notes?: string };

type DeckTheme = {
  style: PresentationDesignStyle;
  bg: string;
  surface: string;
  text: string;
  soft: string;
  accent: string;
  /** Accent adjusted for legible text on `bg` / `surface`. */
  accentInk: string;
  onAccent: string;
  dark: string;
  onDark: string;
  darkSoft: string;
  line: string;
  fonts: Record<FontRole, { pptx: string; pdf: string; bold: boolean }>;
};

// ── colour ────────────────────────────────────────────────────────────────

function normalizeHex(raw: string | undefined): string | undefined {
  const t = raw?.trim().replace(/^#/, "") ?? "";
  if (/^[0-9a-f]{3}$/i.test(t)) {
    return t.split("").map((c) => c + c).join("").toUpperCase();
  }
  return /^[0-9a-f]{6}$/i.test(t) ? t.toUpperCase() : undefined;
}

function rgb(hex: string): [number, number, number] {
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function saturation(hex: string): number {
  const [r, g, b] = rgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

function readableOn(color: string, bg: string): string {
  const toward = luminance(bg) > 0.5 ? 0 : 1;
  let [r, g, b] = rgb(color);
  let hex = color;
  for (let i = 0; i < 20 && contrast(hex, bg) < 3.5; i += 1) {
    [r, g, b] = [r, g, b].map((c) => c + (toward - c) * 0.12) as [number, number, number];
    hex = [r, g, b].map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
  }
  return hex;
}

function resolveTheme(options?: PresentationDesignOptions): DeckTheme {
  const theme = resolveBaseTheme(options);
  return { ...theme, accentInk: readableOn(theme.accent, theme.bg) };
}

function resolveBaseTheme(options?: PresentationDesignOptions): Omit<DeckTheme, "accentInk"> {
  const hexes = (options?.brandColors ?? [])
    .map((c) => normalizeHex(c))
    .filter((c): c is string => Boolean(c));
  const accent =
    hexes.find((c) => saturation(c) >= 0.3 && luminance(c) > 0.03 && luminance(c) < 0.9) ??
    hexes.find((c) => luminance(c) > 0.03 && luminance(c) < 0.9) ??
    DEFAULT_ACCENT;
  const brandDark = hexes.find((c) => luminance(c) < 0.02);
  const onAccent = luminance(accent) > 0.45 ? "111111" : "FFFFFF";
  const sans = {
    heading: { pptx: "Arial", pdf: "Helvetica-Bold", bold: true },
    body: { pptx: "Arial", pdf: "Helvetica", bold: false },
    bodyBold: { pptx: "Arial", pdf: "Helvetica-Bold", bold: true },
  };
  const style = options?.designStyle ?? "editorial";
  if (style === "executive") {
    return {
      style,
      bg: brandDark ?? "0B0B0F",
      surface: "18181E",
      text: "FFFFFF",
      soft: "A1A1AA",
      accent,
      onAccent,
      dark: "000000",
      onDark: "FFFFFF",
      darkSoft: "C4C4CC",
      line: "2A2A33",
      fonts: sans,
    };
  }
  if (style === "minimal") {
    return {
      style,
      bg: "FFFFFF",
      surface: "F4F4F5",
      text: "111111",
      soft: "6B7280",
      accent,
      onAccent,
      dark: brandDark ?? "111111",
      onDark: "FFFFFF",
      darkSoft: "D4D4D8",
      line: "E4E4E7",
      fonts: sans,
    };
  }
  return {
    style: "editorial",
    bg: "F6F3EC",
    surface: "FFFFFF",
    text: "141414",
    soft: "57534E",
    accent,
    onAccent,
    dark: brandDark ?? "141414",
    onDark: "FFFFFF",
    darkSoft: "D6D3D1",
    line: "D6D3D1",
    fonts: { ...sans, heading: { pptx: "Georgia", pdf: "Times-Bold", bold: true } },
  };
}

/** Map a design route title/description to one of the three themes. */
export function inferPresentationDesignStyle(text: string): PresentationDesignStyle {
  const t = text.toLowerCase();
  if (/editorial|magazine/.test(t)) return "editorial";
  if (/executive|dark background|high[- ]contrast/.test(t)) return "executive";
  if (/minimal|white ?space|\bclean\b/.test(t)) return "minimal";
  return "editorial";
}

// ── text fitting ──────────────────────────────────────────────────────────

type Measurer = InstanceType<typeof PDFDocument>;

function fitSize(
  measurer: Measurer,
  theme: DeckTheme,
  text: string,
  font: FontRole,
  box: Box,
  max: number,
  min: number
): number {
  // PowerPoint lines run slightly taller than pdfkit's — keep some headroom.
  const limit = box.h * PT * 0.92;
  for (let size = max; size > min; size -= 1) {
    measurer.font(theme.fonts[font].pdf).fontSize(size);
    if (measurer.heightOfString(text, { width: box.w * PT }) <= limit) return size;
  }
  return min;
}

// ── slide builders ────────────────────────────────────────────────────────

type BuildCtx = {
  theme: DeckTheme;
  measurer: Measurer;
  brand: string;
  index: number;
  total: number;
};

class SceneBuilder {
  readonly prims: Prim[] = [];

  constructor(private readonly ctx: BuildCtx) {}

  rect(box: Box, fill: string, opacity?: number): void {
    this.prims.push({ kind: "rect", ...box, fill, ...(opacity != null ? { opacity } : {}) });
  }

  circle(box: Box, style: { fill?: string; line?: string; lineWidth?: number; opacity?: number }): void {
    this.prims.push({ kind: "ellipse", ...box, ...style });
  }

  /** Image with a tinted plate underneath so a failed decode never leaves a hole. */
  image(box: Box, image: PresentationSlideImage, plate: string): void {
    this.rect(box, plate);
    this.prims.push({ kind: "image", ...box, image });
  }

  text(
    text: string,
    box: Box,
    style: {
      max: number;
      min?: number;
      color: string;
      font?: FontRole;
      align?: TextPrim["align"];
      valign?: TextPrim["valign"];
      spacing?: number;
    }
  ): void {
    const clean = text.trim();
    if (!clean) return;
    const font = style.font ?? "body";
    const size = fitSize(
      this.ctx.measurer,
      this.ctx.theme,
      clean,
      font,
      box,
      style.max,
      style.min ?? Math.min(style.max, 9)
    );
    this.prims.push({
      kind: "text",
      ...box,
      text: clean,
      size,
      color: style.color,
      font,
      ...(style.align ? { align: style.align } : {}),
      ...(style.valign ? { valign: style.valign } : {}),
      ...(style.spacing ? { spacing: style.spacing } : {}),
    });
  }

  label(text: string, box: Box, color: string): void {
    this.text(text.toUpperCase(), box, { max: 9, min: 7, color, font: "bodyBold", spacing: 2 });
  }

  footer(onDark: boolean): void {
    const { theme, brand, index, total } = this.ctx;
    const color = onDark ? theme.darkSoft : theme.soft;
    this.label(brand, { x: M, y: 5.18, w: 5, h: 0.2 }, color);
    this.text(`${pad(index)} / ${pad(total)}`, { x: W - M - 1.4, y: 5.18, w: 1.4, h: 0.2 }, {
      max: 8,
      min: 7,
      color,
      font: "bodyBold",
      align: "right",
    });
  }
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function splitBullets(bullets: readonly string[], max: number): string[] {
  return bullets.map((b) => b.trim()).filter(Boolean).slice(0, max);
}

/** Cover and title_hero share the hero composition. */
function heroScene(
  ctx: BuildCtx,
  title: string,
  subtitle: string,
  kicker: string,
  image: PresentationSlideImage | undefined
): SlideScene {
  const { theme } = ctx;
  const b = new SceneBuilder(ctx);
  if (theme.style === "executive") {
    if (image) {
      b.image({ x: 0, y: 0, w: W, h: H }, image, theme.bg);
      b.rect({ x: 0, y: 0, w: W, h: H }, "000000", 0.5);
      b.rect({ x: 0, y: 0, w: 6.4, h: H }, "000000", 0.45);
    } else {
      b.circle({ x: 6.1, y: -1.2, w: 5.6, h: 5.6 }, { fill: theme.accent, opacity: 0.9 });
      b.circle({ x: 5.2, y: 2.6, w: 3.6, h: 3.6 }, { line: theme.onDark, lineWidth: 1, opacity: 0.35 });
    }
    b.rect({ x: M, y: 1.45, w: 0.9, h: 0.07 }, theme.accent);
    b.text(title, { x: M, y: 1.7, w: 6, h: 2.1 }, { max: 44, min: 22, color: theme.onDark, font: "heading" });
    b.text(subtitle, { x: M, y: 3.9, w: 5.6, h: 0.85 }, { max: 15, min: 10, color: theme.darkSoft });
    b.label(kicker, { x: M, y: 5.0, w: 6, h: 0.25 }, theme.accent);
    return { bg: theme.bg, prims: b.prims };
  }
  if (theme.style === "minimal") {
    if (image) {
      b.image({ x: 5.6, y: 0, w: 4.4, h: H }, image, theme.surface);
    } else {
      b.rect({ x: 6.4, y: 0, w: 3.6, h: H }, theme.surface);
      b.circle({ x: 7.1, y: 1.7, w: 2.2, h: 2.2 }, { fill: theme.accent });
    }
    b.rect({ x: M, y: 0.62, w: 0.2, h: 0.2 }, theme.accent);
    b.label(kicker, { x: M + 0.35, y: 0.6, w: 4.2, h: 0.25 }, theme.soft);
    b.text(title, { x: M, y: 1.5, w: 4.6, h: 2.1 }, { max: 40, min: 22, color: theme.text, font: "heading", valign: "bottom" });
    b.text(subtitle, { x: M, y: 3.8, w: 4.4, h: 0.85 }, { max: 14, min: 10, color: theme.soft });
    b.rect({ x: M, y: 4.95, w: 4.6, h: 0.012 }, theme.line);
    return { bg: theme.bg, prims: b.prims };
  }
  // editorial
  if (image) {
    b.rect({ x: 5.65, y: 0.8, w: 3.95, h: 4.4 }, theme.accent);
    b.image({ x: 5.4, y: 0.55, w: 3.95, h: 4.4 }, image, theme.surface);
  } else {
    b.circle({ x: 5.9, y: 0.7, w: 4.3, h: 4.3 }, { fill: theme.accent });
    b.circle({ x: 5.3, y: 1.3, w: 3.3, h: 3.3 }, { line: theme.text, lineWidth: 1.25 });
  }
  b.label(kicker, { x: M, y: 0.55, w: 4.5, h: 0.25 }, theme.soft);
  b.rect({ x: M, y: 0.88, w: 0.6, h: 0.045 }, theme.accent);
  b.text(title, { x: M, y: 1.2, w: 4.5, h: 2.4 }, { max: 44, min: 22, color: theme.text, font: "heading", valign: "bottom" });
  b.text(subtitle, { x: M, y: 3.8, w: 4.4, h: 0.9 }, { max: 14, min: 10, color: theme.soft });
  b.rect({ x: M, y: 4.95, w: 4.5, h: 0.012 }, theme.line);
  return { bg: theme.bg, prims: b.prims };
}

function sectionScene(
  ctx: BuildCtx,
  slide: PresentationSlide,
  sectionNo: number,
  image: PresentationSlideImage | undefined
): SlideScene {
  const { theme } = ctx;
  const b = new SceneBuilder(ctx);
  const lead = slide.bullets[0] ?? "";
  if (theme.style === "executive") {
    if (image) {
      b.image({ x: 0, y: 0, w: W, h: H }, image, theme.bg);
      b.rect({ x: 0, y: 0, w: W, h: H }, "000000", 0.6);
    } else {
      b.circle({ x: 6.6, y: 1.4, w: 5, h: 5 }, { fill: theme.accent, opacity: 0.85 });
    }
    b.text(pad(sectionNo), { x: M, y: 0.45, w: 3, h: 1.6 }, { max: 96, min: 60, color: theme.accentInk, font: "heading" });
    b.rect({ x: M, y: 2.55, w: 0.9, h: 0.07 }, theme.accent);
    b.text(slide.title, { x: M, y: 2.75, w: 7.2, h: 1.4 }, { max: 36, min: 20, color: theme.onDark, font: "heading" });
    b.text(lead, { x: M, y: 4.25, w: 6.8, h: 0.8 }, { max: 14, min: 10, color: theme.darkSoft });
    return { bg: theme.bg, prims: b.prims };
  }
  if (theme.style === "minimal") {
    if (image) {
      b.image({ x: 6.0, y: 0.6, w: 3.4, h: 4.4 }, image, theme.surface);
    } else {
      b.rect({ x: 6.0, y: 0.6, w: 3.4, h: 4.4 }, theme.surface);
      b.circle({ x: 6.95, y: 2.05, w: 1.5, h: 1.5 }, { fill: theme.accent });
    }
    b.text(pad(sectionNo), { x: M, y: 0.7, w: 3, h: 1.4 }, { max: 80, min: 50, color: theme.accentInk, font: "heading" });
    b.text(slide.title, { x: M, y: 2.3, w: 4.9, h: 1.6 }, { max: 34, min: 20, color: theme.text, font: "heading" });
    b.text(lead, { x: M, y: 4.0, w: 4.8, h: 0.9 }, { max: 14, min: 10, color: theme.soft });
    return { bg: theme.bg, prims: b.prims };
  }
  // editorial — accent panel with a big folio number
  b.rect({ x: 0, y: 0, w: 4.2, h: H }, theme.accent);
  b.text(pad(sectionNo), { x: M, y: 0.5, w: 3.2, h: 1.7 }, { max: 96, min: 60, color: theme.onAccent, font: "heading" });
  if (image) {
    b.image({ x: 4.2, y: 0, w: W - 4.2, h: H }, image, theme.surface);
    b.text(slide.title, { x: M, y: 2.4, w: 3.1, h: 1.9 }, { max: 30, min: 16, color: theme.onAccent, font: "heading" });
    b.text(lead, { x: M, y: 4.35, w: 3.1, h: 0.85 }, { max: 12, min: 9, color: theme.onAccent });
  } else {
    b.label("Section", { x: M, y: 2.4, w: 3, h: 0.25 }, theme.onAccent);
    b.text(slide.title, { x: 4.8, y: 1.5, w: 4.6, h: 1.9 }, { max: 34, min: 20, color: theme.text, font: "heading", valign: "bottom" });
    b.rect({ x: 4.8, y: 3.6, w: 0.6, h: 0.045 }, theme.accent);
    b.text(lead, { x: 4.8, y: 3.8, w: 4.4, h: 0.9 }, { max: 14, min: 10, color: theme.soft });
    b.circle({ x: 8.3, y: 4.0, w: 2.4, h: 2.4 }, { line: theme.accent, lineWidth: 1.25 });
  }
  return { bg: theme.bg, prims: b.prims };
}

function contentScene(
  ctx: BuildCtx,
  slide: PresentationSlide,
  image: PresentationSlideImage | undefined
): SlideScene {
  const { theme } = ctx;
  const b = new SceneBuilder(ctx);
  const onDark = theme.style === "executive";
  const bullets = splitBullets(slide.bullets, image ? 5 : 6);
  const textW = image ? 4.9 : W - 2 * M;

  b.label(`${pad(ctx.index)} — ${slide.title.split(/\s+/).slice(0, 3).join(" ")}`, { x: M, y: 0.42, w: textW, h: 0.22 }, theme.accentInk);
  b.text(slide.title, { x: M, y: 0.68, w: textW, h: 0.95 }, { max: 28, min: 16, color: theme.text, font: "heading" });

  if (image) {
    if (theme.style === "editorial") {
      b.rect({ x: 6.15, y: 0.8, w: 3.35, h: 4.3 }, theme.accent);
      b.image({ x: 5.9, y: 0.55, w: 3.35, h: 4.3 }, image, theme.surface);
    } else {
      b.image({ x: 5.9, y: 0, w: W - 5.9, h: H }, image, theme.surface);
    }
    const top = 1.8;
    const rowH = (4.95 - top) / Math.max(bullets.length, 3);
    bullets.forEach((bullet, i) => {
      const y = top + i * rowH;
      b.text(pad(i + 1), { x: M, y, w: 0.5, h: 0.3 }, { max: 12, min: 10, color: theme.accentInk, font: "bodyBold" });
      b.text(bullet, { x: M + 0.55, y, w: textW - 0.55, h: rowH - 0.1 }, { max: 14, min: 9, color: theme.text });
    });
    b.footer(onDark);
    return { bg: theme.bg, prims: b.prims, ...(slide.notes ? { notes: slide.notes } : {}) };
  }

  // No image → numbered card grid
  const n = Math.max(bullets.length, 1);
  const cols = n <= 3 ? n : n === 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const gap = 0.2;
  const top = 1.85;
  const areaH = 4.95 - top;
  const cardW = (W - 2 * M - gap * (cols - 1)) / cols;
  const cardH = (areaH - gap * (rows - 1)) / rows;
  bullets.forEach((bullet, i) => {
    const x = M + (i % cols) * (cardW + gap);
    const y = top + Math.floor(i / cols) * (cardH + gap);
    b.rect({ x, y, w: cardW, h: cardH }, theme.surface);
    if (theme.style === "editorial") b.rect({ x, y, w: 0.06, h: cardH }, theme.accent);
    else b.rect({ x, y, w: cardW, h: 0.06 }, theme.accent);
    b.text(pad(i + 1), { x: x + 0.22, y: y + 0.2, w: 1, h: 0.32 }, { max: 13, min: 10, color: theme.accentInk, font: "bodyBold" });
    b.text(bullet, { x: x + 0.22, y: y + 0.58, w: cardW - 0.44, h: cardH - 0.75 }, { max: 14, min: 9, color: theme.text });
  });
  b.footer(onDark);
  return { bg: theme.bg, prims: b.prims, ...(slide.notes ? { notes: slide.notes } : {}) };
}

function statementScene(
  ctx: BuildCtx,
  slide: PresentationSlide,
  image: PresentationSlideImage | undefined
): SlideScene {
  const { theme } = ctx;
  const b = new SceneBuilder(ctx);
  const statement = slide.bullets[0]?.trim() || slide.title;
  const support = splitBullets(slide.bullets.slice(1), 3).join("  ·  ");
  if (theme.style === "executive") {
    // Accent-flooded statement slide
    const textW = image ? 5.0 : 8.4;
    if (image) b.image({ x: 6.0, y: 0, w: 4, h: H }, image, theme.bg);
    b.rect({ x: 0, y: 0, w: image ? 6.0 : W, h: H }, theme.accent);
    if (!image) b.circle({ x: 7.4, y: 2.9, w: 3.6, h: 3.6 }, { line: theme.onAccent, lineWidth: 1, opacity: 0.4 });
    b.label(slide.title, { x: M, y: 0.6, w: textW, h: 0.25 }, theme.onAccent);
    b.text(statement, { x: M, y: 1.1, w: textW, h: 3.0 }, { max: 34, min: 16, color: theme.onAccent, font: "heading", valign: "middle" });
    b.text(support, { x: M, y: 4.3, w: textW, h: 0.7 }, { max: 12, min: 9, color: theme.onAccent });
    return { bg: theme.accent, prims: b.prims, ...(slide.notes ? { notes: slide.notes } : {}) };
  }
  const imageLeft = theme.style === "editorial";
  const textX = image ? (imageLeft ? 4.6 : M) : M + 0.4;
  const textW = image ? 4.8 : W - 2 * M - 0.8;
  if (image) {
    b.image(imageLeft ? { x: 0, y: 0, w: 4.0, h: H } : { x: 6.0, y: 0, w: 4.0, h: H }, image, theme.surface);
  } else if (theme.style === "minimal") {
    b.rect({ x: 0, y: 0, w: 0.14, h: H }, theme.accent);
  }
  b.text("“", { x: textX - 0.05, y: 0.35, w: 1.2, h: 1.2 }, { max: 96, min: 72, color: theme.accentInk, font: "heading" });
  b.label(slide.title, { x: textX, y: 1.45, w: textW, h: 0.25 }, theme.soft);
  b.text(statement, { x: textX, y: 1.8, w: textW, h: 2.5 }, { max: 32, min: 16, color: theme.text, font: "heading" });
  b.rect({ x: textX, y: 4.4, w: 0.6, h: 0.045 }, theme.accent);
  b.text(support, { x: textX, y: 4.55, w: textW, h: 0.55 }, { max: 12, min: 9, color: theme.soft });
  return { bg: theme.bg, prims: b.prims, ...(slide.notes ? { notes: slide.notes } : {}) };
}

function closingScene(
  ctx: BuildCtx,
  slide: PresentationSlide,
  image: PresentationSlideImage | undefined
): SlideScene {
  const { theme } = ctx;
  const b = new SceneBuilder(ctx);
  const onAccentBg = theme.style === "executive";
  const bg = onAccentBg ? theme.accent : theme.dark;
  const ink = onAccentBg ? theme.onAccent : theme.onDark;
  const soft = onAccentBg ? theme.onAccent : theme.darkSoft;
  const textW = image ? 5.0 : 6.0;
  if (image) {
    if (theme.style === "editorial") {
      b.rect({ x: 6.25, y: 0.8, w: 3.25, h: 4.3 }, theme.accent);
      b.image({ x: 6.0, y: 0.55, w: 3.25, h: 4.3 }, image, theme.surface);
    } else {
      b.image({ x: 6.0, y: 0, w: 4, h: H }, image, bg);
    }
  } else {
    b.circle({ x: 6.8, y: -0.9, w: 4.2, h: 4.2 }, { fill: onAccentBg ? theme.dark : theme.accent, opacity: 0.9 });
    b.circle({ x: 7.9, y: 2.6, w: 3.2, h: 3.2 }, { line: ink, lineWidth: 1, opacity: 0.35 });
  }
  b.rect({ x: M, y: 1.2, w: 0.9, h: 0.07 }, onAccentBg ? theme.onAccent : theme.accent);
  b.text(slide.title, { x: M, y: 1.45, w: textW, h: 1.7 }, { max: 44, min: 22, color: ink, font: "heading" });
  b.text(splitBullets(slide.bullets, 4).join("\n"), { x: M, y: 3.3, w: textW, h: 1.5 }, { max: 15, min: 10, color: soft });
  b.label(ctx.brand, { x: M, y: 5.0, w: 5, h: 0.25 }, onAccentBg ? theme.onAccent : theme.accent);
  return { bg, prims: b.prims, ...(slide.notes ? { notes: slide.notes } : {}) };
}

/** Flip a hero composition: visuals move left, the text column moves right. */
function mirrorHero(scene: SlideScene): SlideScene {
  const inTextColumn = (p: Prim) =>
    p.kind === "text" || (p.kind === "rect" && p.x < W / 2 && p.w <= 4.7);
  const textRight = Math.max(...scene.prims.filter(inTextColumn).map((p) => p.x + p.w));
  const shift = W - M - textRight;
  return {
    ...scene,
    prims: scene.prims.map((p) =>
      inTextColumn(p) ? { ...p, x: p.x + shift } : { ...p, x: W - p.x - p.w }
    ),
  };
}

function buildScenes(
  plan: PresentationPlan,
  images: readonly (PresentationSlideImage | undefined)[],
  options?: PresentationDesignOptions
): SlideScene[] {
  const theme = resolveTheme(options);
  const measurer = new PDFDocument({ size: [W * PT, H * PT], margin: 0 });
  const brand = options?.brandName?.trim() || "UNAGENCY";
  const total = plan.slides.length + 1;
  const ctx = (index: number): BuildCtx => ({ theme, measurer, brand, index, total });

  const heroIndex = plan.slides.findIndex((s, i) => s.layout === "title_hero" && images[i]);
  const coverImage = images[heroIndex] ?? images.find(Boolean);
  const scenes: SlideScene[] = [
    heroScene(ctx(1), plan.title, plan.subtitle ?? "", brand, coverImage),
  ];

  let sectionNo = 0;
  plan.slides.forEach((slide, i) => {
    const c = ctx(i + 2);
    const image = images[i];
    switch (slide.layout ?? "content_bullets") {
      case "title_hero": {
        const scene = mirrorHero(heroScene(c, slide.title, slide.bullets[0] ?? "", `${pad(c.index)} — ${brand}`, image));
        scenes.push(slide.notes ? { ...scene, notes: slide.notes } : scene);
        break;
      }
      case "section_divider":
        sectionNo += 1;
        scenes.push({ ...sectionScene(c, slide, sectionNo, image), ...(slide.notes ? { notes: slide.notes } : {}) });
        break;
      case "key_message":
        scenes.push(statementScene(c, slide, image));
        break;
      case "closing":
        scenes.push(closingScene(c, slide, image));
        break;
      default:
        scenes.push(contentScene(c, slide, image));
    }
  });
  return scenes;
}

// ── writers ───────────────────────────────────────────────────────────────

type PptxSlide = {
  background?: unknown;
  addShape: (type: string, opts: Record<string, unknown>) => void;
  addText: (text: string, opts: Record<string, unknown>) => void;
  addImage: (opts: Record<string, unknown>) => void;
  addNotes?: (notes: string) => void;
};

function transparency(opacity?: number): number | undefined {
  return opacity == null ? undefined : Math.round((1 - opacity) * 100);
}

export async function renderDesignedPresentationPptx(
  plan: PresentationPlan,
  images: readonly (PresentationSlideImage | undefined)[],
  options?: PresentationDesignOptions
): Promise<Buffer> {
  const scenes = buildScenes(plan, images, options);
  const theme = resolveTheme(options);
  const pptx = new PptxGenJS();
  pptx.author = "Unagency";
  pptx.title = plan.title;
  pptx.defineLayout({ name: "WIDESCREEN", width: W, height: H });
  pptx.layout = "WIDESCREEN";

  for (const scene of scenes) {
    const s = pptx.addSlide() as unknown as PptxSlide;
    s.background = { color: scene.bg };
    for (const p of scene.prims) {
      const box = { x: p.x, y: p.y, w: p.w, h: p.h };
      if (p.kind === "rect") {
        const fill = { color: p.fill, ...(p.opacity != null ? { transparency: transparency(p.opacity) } : {}) };
        s.addShape("rect", { ...box, fill, line: { color: p.fill, ...(fill.transparency != null ? { transparency: fill.transparency } : {}) } });
      } else if (p.kind === "ellipse") {
        s.addShape("ellipse", {
          ...box,
          fill: p.fill
            ? { color: p.fill, ...(p.opacity != null ? { transparency: transparency(p.opacity) } : {}) }
            : { color: "FFFFFF", transparency: 100 },
          line: p.line
            ? { color: p.line, width: p.lineWidth ?? 1, ...(p.opacity != null ? { transparency: transparency(p.opacity) } : {}) }
            : { color: p.fill ?? "FFFFFF", transparency: p.fill ? transparency(p.opacity) ?? 0 : 100 },
        });
      } else if (p.kind === "image") {
        try {
          s.addImage({
            data: `image/${p.image.ext ?? "png"};base64,${p.image.data}`,
            ...box,
            sizing: { type: "cover", w: p.w, h: p.h },
          });
        } catch (err) {
          console.warn(`[presentation-export] pptx image failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        const font = theme.fonts[p.font];
        s.addText(p.text, {
          ...box,
          fontSize: p.size,
          fontFace: font.pptx,
          bold: font.bold,
          color: p.color,
          align: p.align ?? "left",
          valign: p.valign ?? "top",
          margin: 0,
          ...(p.spacing ? { charSpacing: p.spacing } : {}),
        });
      }
    }
    if (scene.notes?.trim()) {
      try {
        s.addNotes?.(scene.notes.trim());
      } catch {
        // optional
      }
    }
  }

  const out = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}

export async function renderDesignedPresentationPdf(
  plan: PresentationPlan,
  images: readonly (PresentationSlideImage | undefined)[],
  options?: PresentationDesignOptions
): Promise<Buffer> {
  const scenes = buildScenes(plan, images, options);
  const theme = resolveTheme(options);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [W * PT, H * PT], margin: 0, autoFirstPage: false });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const openedImages = new Map<string, unknown>();

    for (const scene of scenes) {
      doc.addPage({ size: [W * PT, H * PT], margin: 0 });
      doc.rect(0, 0, W * PT, H * PT).fill(`#${scene.bg}`);
      for (const p of scene.prims) {
        const x = p.x * PT;
        const y = p.y * PT;
        const w = p.w * PT;
        const h = p.h * PT;
        if (p.kind === "rect") {
          doc.save();
          if (p.opacity != null) doc.fillOpacity(p.opacity);
          doc.rect(x, y, w, h).fill(`#${p.fill}`);
          doc.restore();
        } else if (p.kind === "ellipse") {
          doc.save();
          const shape = doc.ellipse(x + w / 2, y + h / 2, w / 2, h / 2);
          if (p.fill) {
            if (p.opacity != null) doc.fillOpacity(p.opacity);
            shape.fill(`#${p.fill}`);
          } else if (p.line) {
            if (p.opacity != null) doc.strokeOpacity(p.opacity);
            shape.lineWidth(p.lineWidth ?? 1).stroke(`#${p.line}`);
          }
          doc.restore();
        } else if (p.kind === "image") {
          try {
            doc.save();
            doc.rect(x, y, w, h).clip();
            let opened = openedImages.get(p.image.data);
            if (!opened) {
              opened = (doc as unknown as { openImage(src: Buffer): unknown }).openImage(
                Buffer.from(p.image.data, "base64")
              );
              openedImages.set(p.image.data, opened);
            }
            doc.image(opened as never, x, y, {
              cover: [w, h],
              align: "center",
              valign: "center",
            } as never);
            doc.restore();
          } catch (err) {
            doc.restore();
            console.warn(`[presentation-export] pdf image failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        } else {
          doc.font(theme.fonts[p.font].pdf).fontSize(p.size);
          const opts = {
            width: w,
            align: p.align ?? "left",
            ...(p.spacing ? { characterSpacing: p.spacing } : {}),
          };
          const textH = doc.heightOfString(p.text, opts);
          const offset =
            p.valign === "middle" ? Math.max(0, (h - textH) / 2) : p.valign === "bottom" ? Math.max(0, h - textH) : 0;
          doc
            .fillColor(`#${p.color}`)
            .text(p.text, x, y + offset, { ...opts, height: h - offset + 2, ellipsis: true });
        }
      }
    }
    doc.end();
  });
}
