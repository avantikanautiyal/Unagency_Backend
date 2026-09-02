/**
 * Build designed PPTX + PDF bytes from structured PresentationPlan / DocumentPlan.
 * Pitch decks use slide layouts (not a plain text dump).
 */

import PDFDocument from "pdfkit";
import PptxGenJS from "pptxgenjs";

export type PresentationSlideLayout =
  | "title_hero"
  | "section_divider"
  | "content_bullets"
  | "key_message"
  | "closing";

export type PresentationSlide = {
  readonly title: string;
  readonly bullets: readonly string[];
  readonly notes?: string;
  readonly layout?: PresentationSlideLayout;
  readonly visualCue?: string;
};

export type PresentationPlan = {
  readonly title: string;
  readonly subtitle?: string;
  readonly slides: readonly PresentationSlide[];
};

export type PresentationRoutePlan = {
  readonly title: string;
  readonly description: string;
  readonly deck: PresentationPlan;
};

export type DocumentSection = {
  readonly heading: string;
  readonly body: string;
};

export type DocumentPlan = {
  readonly title: string;
  readonly summary?: string;
  readonly sections: readonly DocumentSection[];
};

const ACCENT = "FF0056";
const INK = "0B0B0F";
const INK_SOFT = "F7F4F0";
const MUTED = "6B7280";
const WHITE = "FFFFFF";

export type PresentationExportOptions = {
  readonly brandName?: string;
  readonly brandColors?: readonly string[];
};

function pptxColor(raw: string | undefined, fallback: string): string {
  if (!raw?.trim()) return fallback;
  const t = raw.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(t)) {
    return t
      .split("")
      .map((c) => c + c)
      .join("")
      .toUpperCase();
  }
  if (/^[0-9a-f]{6}$/i.test(t)) return t.toUpperCase();
  return fallback;
}

function pdfHex(raw: string | undefined, fallback: string): string {
  if (!raw?.trim()) return fallback;
  const t = raw.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t)) return t.toUpperCase();
  if (/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t)) return `#${t}`.toUpperCase();
  return fallback;
}

function resolvePresentationExportTheme(options?: PresentationExportOptions) {
  const colors = options?.brandColors?.filter((c) => typeof c === "string" && c.trim()) ?? [];
  return {
    accent: pptxColor(colors[0], ACCENT),
    ink: pptxColor(colors[1], INK),
    inkSoft: pptxColor(colors[2], INK_SOFT),
    muted: MUTED,
    white: WHITE,
    pdfAccent: pdfHex(colors[0], `#${ACCENT}`),
    pdfInk: pdfHex(colors[1], `#${INK}`),
    pdfInkSoft: pdfHex(colors[2], `#${INK_SOFT}`),
  };
}

const LAYOUTS = new Set<string>([
  "title_hero",
  "section_divider",
  "content_bullets",
  "key_message",
  "closing",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function normalizeSlide(item: unknown): PresentationSlide | null {
  if (!isRecord(item)) return null;
  const slideTitle = firstNonEmptyString(item.title, item.heading, item.name) ?? "";
  const bulletSources = [
    item.bullets,
    item.bulletPoints,
    item.points,
    item.keyPoints,
  ];
  let bullets: string[] = [];
  for (const source of bulletSources) {
    if (!Array.isArray(source)) continue;
    bullets = source
      .filter((b): b is string => typeof b === "string" && b.trim().length > 0)
      .map((b) => b.trim());
    if (bullets.length > 0) break;
  }
  if (bullets.length === 0) {
    const body = firstNonEmptyString(item.body, item.content, item.text);
    if (body) bullets = [body];
  }
  if (bullets.length === 1) {
    bullets = [bullets[0]!, bullets[0]!];
  }
  if (!slideTitle || bullets.length === 0) return null;
  const layoutRaw =
    typeof item.layout === "string" ? item.layout.trim() : "content_bullets";
  const layout = (
    LAYOUTS.has(layoutRaw) ? layoutRaw : "content_bullets"
  ) as PresentationSlideLayout;
  return {
    title: slideTitle,
    bullets,
    layout,
    ...(typeof item.notes === "string" && item.notes.trim()
      ? { notes: item.notes.trim() }
      : {}),
    ...(typeof item.visualCue === "string" && item.visualCue.trim()
      ? { visualCue: item.visualCue.trim() }
      : {}),
  };
}

function parseSlide(item: unknown): PresentationSlide | null {
  return normalizeSlide(item);
}

function parseSlides(slidesRaw: unknown): PresentationSlide[] {
  if (!Array.isArray(slidesRaw)) return [];
  const slides: PresentationSlide[] = [];
  for (const item of slidesRaw) {
    const slide = parseSlide(item);
    if (slide) slides.push(slide);
  }
  return slides;
}

export function parsePresentationPlan(data: unknown): PresentationPlan | null {
  if (!isRecord(data)) return null;
  // Nested deck from a route object
  if (isRecord(data.deck)) {
    return parsePresentationPlan(data.deck);
  }
  const title =
    (typeof data.deckTitle === "string" && data.deckTitle.trim()) ||
    (typeof data.title === "string" && data.title.trim()) ||
    "";
  const slides = parseSlides(data.slides);
  if (!title || slides.length === 0) return null;
  const subtitle =
    (typeof data.deckSubtitle === "string" && data.deckSubtitle.trim()) ||
    (typeof data.subtitle === "string" && data.subtitle.trim()) ||
    undefined;
  return {
    title,
    ...(subtitle ? { subtitle } : {}),
    slides,
  };
}

/** Unwrap schema-name or vendor envelope keys around `{ routes: [...] }`. */
function unwrapPresentationRoutesEnvelope(
  data: Record<string, unknown>
): Record<string, unknown> {
  if (Array.isArray(data.routes)) return data;
  const envelopeKeys = [
    "PresentationRoutes",
    "presentationRoutes",
    "presentation_routes",
    "PresentationRoute",
    "data",
    "result",
    "output",
    "response",
  ];
  for (const key of envelopeKeys) {
    const nested = data[key];
    if (!isRecord(nested)) continue;
    const unwrapped = unwrapPresentationRoutesEnvelope(nested);
    if (Array.isArray(unwrapped.routes)) return unwrapped;
  }
  return data;
}

/**
 * Normalize provider near-miss presentation JSON toward exportable routes.
 * Models often omit deckTitle/layout or nest slides under `deck`.
 */
export function recoverPresentationRoutesPayload(data: unknown): unknown {
  let normalized: unknown = data;
  if (typeof normalized === "string" && normalized.trim()) {
    try {
      normalized = JSON.parse(normalized) as unknown;
    } catch {
      return data;
    }
  }
  if (!isRecord(normalized)) return data;
  const unwrapped = unwrapPresentationRoutesEnvelope(normalized);
  if (parsePresentationRoutes(unwrapped)) return unwrapped;

  const routesRaw = Array.isArray(unwrapped.routes) ? unwrapped.routes : null;
  if (!routesRaw) {
    const single = parsePresentationPlan(unwrapped);
    if (single && single.slides.length > 0) {
      return {
        routes: [
          {
            title: single.title,
            description: single.subtitle ?? single.title,
            deckTitle: single.title,
            deckSubtitle: single.subtitle ?? "",
            slides: single.slides,
          },
        ],
      };
    }
    return unwrapped;
  }

  const routes: Record<string, unknown>[] = [];
  for (const item of routesRaw) {
    if (!isRecord(item)) continue;
    const title =
      firstNonEmptyString(item.title, item.name, item.deckTitle) ?? "Route";
    const description =
      firstNonEmptyString(item.description, item.summary, item.subtitle) ??
      title;
    const deckTitle =
      firstNonEmptyString(item.deckTitle, item.title, item.name) ?? title;
    const deckSubtitle =
      firstNonEmptyString(item.deckSubtitle, item.subtitle) ?? "";

    let slidesRaw: unknown = item.slides;
    if (!Array.isArray(slidesRaw) && isRecord(item.deck)) {
      slidesRaw = item.deck.slides;
    }

    const slides: PresentationSlide[] = [];
    if (Array.isArray(slidesRaw)) {
      for (const slideItem of slidesRaw) {
        const slide = normalizeSlide(slideItem);
        if (slide) slides.push(slide);
      }
    }
    if (slides.length === 0) continue;

    routes.push({
      title,
      description,
      deckTitle,
      deckSubtitle,
      slides,
    });
  }

  if (routes.length === 0) return unwrapped;
  const next: Record<string, unknown> = { ...unwrapped, routes };
  delete next.concepts;
  return next;
}

/** Exactly 3 pitch-deck creative routes (preferred product shape). */
export function parsePresentationRoutes(
  data: unknown
): PresentationRoutePlan[] | null {
  if (!isRecord(data) || !Array.isArray(data.routes)) return null;
  const routes: PresentationRoutePlan[] = [];
  for (const item of data.routes) {
    if (!isRecord(item)) continue;
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const description =
      typeof item.description === "string" ? item.description.trim() : "";
    const deck = parsePresentationPlan(item);
    if (!title || !deck) continue;
    routes.push({
      title,
      description: description || deck.subtitle || deck.title,
      deck,
    });
  }
  return routes.length > 0 ? routes : null;
}

/** True when payload has full slide decks ready for PDF/PPTX materialization. */
export function isExportablePresentationPayload(data: unknown): boolean {
  const recovered = recoverPresentationRoutesPayload(data);
  return Boolean(parsePresentationRoutes(recovered) || parsePresentationPlan(recovered));
}

/** True when payload stopped at Phase-A concepts (not exportable alone). */
export function isConceptsOnlyPresentationPayload(data: unknown): boolean {
  if (!isRecord(data) || !Array.isArray(data.concepts) || data.concepts.length === 0) {
    return false;
  }
  return !isExportablePresentationPayload(data);
}

export function parseDocumentPlan(data: unknown): DocumentPlan | null {
  if (!isRecord(data)) return null;
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const sectionsRaw = Array.isArray(data.sections) ? data.sections : [];
  const sections: DocumentSection[] = [];
  for (const item of sectionsRaw) {
    if (!isRecord(item)) continue;
    const heading = typeof item.heading === "string" ? item.heading.trim() : "";
    const body = typeof item.body === "string" ? item.body.trim() : "";
    if (!heading || !body) continue;
    sections.push({ heading, body });
  }
  if (!title || sections.length === 0) return null;
  return {
    title,
    ...(typeof data.summary === "string" && data.summary.trim()
      ? { summary: data.summary.trim() }
      : {}),
    sections,
  };
}

function applyNotes(
  slide: InstanceType<typeof PptxGenJS.prototype.addSlide> extends (
    ...args: never
  ) => infer R
    ? R
    : never,
  notes?: string
): void {
  if (notes?.trim()) {
    try {
      (slide as { addNotes?: (t: string) => void }).addNotes?.(notes.trim());
    } catch {
      // optional
    }
  }
}

function paintAccentBar(
  slide: {
  addShape: (
    type: string,
    opts: Record<string, unknown>
  ) => void;
},
  accent: string
): void {
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: 0.12,
    h: 5.625,
    fill: { color: accent },
    line: { color: accent },
  });
}

export async function buildPresentationPptx(
  plan: PresentationPlan,
  options?: PresentationExportOptions
): Promise<Buffer> {
  const theme = resolvePresentationExportTheme(options);
  const paintBar = (slide: Parameters<typeof paintAccentBar>[0]) =>
    paintAccentBar(slide, theme.accent);
  const ACCENT = theme.accent;
  const INK = theme.ink;
  const INK_SOFT = theme.inkSoft;
  const MUTED = theme.muted;
  const WHITE = theme.white;
  const brandFooter = options?.brandName?.trim() || "UNAGENCY";
  const pptx = new PptxGenJS();
  pptx.author = "Unagency";
  pptx.title = plan.title;
  pptx.defineLayout({ name: "WIDESCREEN", width: 10, height: 5.625 });
  pptx.layout = "WIDESCREEN";

  // Cover slide — designed hero, not a text dump
  {
    const s = pptx.addSlide();
    s.addShape("rect", {
      x: 0,
      y: 0,
      w: 10,
      h: 5.625,
      fill: { color: INK },
      line: { color: INK },
    });
    s.addShape("rect", {
      x: 0,
      y: 0,
      w: 0.18,
      h: 5.625,
      fill: { color: ACCENT },
      line: { color: ACCENT },
    });
    s.addShape("rect", {
      x: 0.6,
      y: 1.6,
      w: 1.4,
      h: 0.08,
      fill: { color: ACCENT },
      line: { color: ACCENT },
    });
    s.addText(plan.title, {
      x: 0.6,
      y: 2.0,
      w: 8.6,
      h: 1.2,
      fontSize: 36,
      bold: true,
      color: WHITE,
      fontFace: "Arial",
      valign: "middle",
    });
    if (plan.subtitle) {
      s.addText(plan.subtitle, {
        x: 0.6,
        y: 3.3,
        w: 8.2,
        h: 0.7,
        fontSize: 16,
        color: "C4C4CC",
        fontFace: "Arial",
      });
    }
    s.addText(brandFooter, {
      x: 0.6,
      y: 5.05,
      w: 4,
      h: 0.3,
      fontSize: 10,
      color: ACCENT,
      bold: true,
      fontFace: "Arial",
      charSpacing: 3,
    });
  }

  for (const slide of plan.slides) {
    const layout = slide.layout ?? "content_bullets";
    const s = pptx.addSlide();

    if (layout === "title_hero" || layout === "closing") {
      s.addShape("rect", {
        x: 0,
        y: 0,
        w: 10,
        h: 5.625,
        fill: { color: INK },
        line: { color: INK },
      });
      paintBar(s as never);
      s.addText(slide.title, {
        x: 0.7,
        y: layout === "closing" ? 1.8 : 1.5,
        w: 8.5,
        h: 1.2,
        fontSize: 32,
        bold: true,
        color: WHITE,
        fontFace: "Arial",
      });
      if (slide.bullets[0]) {
        s.addText(slide.bullets.join("\n"), {
          x: 0.7,
          y: 3.0,
          w: 8.2,
          h: 1.6,
          fontSize: 16,
          color: "C4C4CC",
          fontFace: "Arial",
          valign: "top",
        });
      }
    } else if (layout === "section_divider") {
      s.addShape("rect", {
        x: 0,
        y: 0,
        w: 10,
        h: 5.625,
        fill: { color: "14141A" },
        line: { color: "14141A" },
      });
      s.addShape("rect", {
        x: 0.6,
        y: 2.4,
        w: 1.2,
        h: 0.08,
        fill: { color: ACCENT },
        line: { color: ACCENT },
      });
      s.addText(slide.title, {
        x: 0.6,
        y: 2.7,
        w: 8.6,
        h: 1,
        fontSize: 28,
        bold: true,
        color: WHITE,
        fontFace: "Arial",
      });
      if (slide.bullets[0]) {
        s.addText(slide.bullets[0], {
          x: 0.6,
          y: 3.8,
          w: 8.2,
          h: 0.6,
          fontSize: 14,
          color: "A1A1AA",
          fontFace: "Arial",
        });
      }
    } else if (layout === "key_message") {
      s.addShape("rect", {
        x: 0,
        y: 0,
        w: 10,
        h: 5.625,
        fill: { color: INK_SOFT },
        line: { color: INK_SOFT },
      });
      paintBar(s as never);
      s.addText(slide.title, {
        x: 0.7,
        y: 1.4,
        w: 8.5,
        h: 0.6,
        fontSize: 14,
        bold: true,
        color: ACCENT,
        fontFace: "Arial",
        charSpacing: 2,
      });
      s.addText(slide.bullets[0] ?? "", {
        x: 0.7,
        y: 2.1,
        w: 8.5,
        h: 2.2,
        fontSize: 28,
        bold: true,
        color: INK,
        fontFace: "Arial",
        valign: "middle",
      });
      if (slide.bullets[1]) {
        s.addText(slide.bullets.slice(1).join(" · "), {
          x: 0.7,
          y: 4.5,
          w: 8.5,
          h: 0.5,
          fontSize: 13,
          color: MUTED,
          fontFace: "Arial",
        });
      }
    } else {
      // content_bullets — light editorial slide with accent rail
      s.addShape("rect", {
        x: 0,
        y: 0,
        w: 10,
        h: 5.625,
        fill: { color: WHITE },
        line: { color: WHITE },
      });
      paintBar(s as never);
      s.addShape("rect", {
        x: 0.7,
        y: 0.45,
        w: 0.9,
        h: 0.06,
        fill: { color: ACCENT },
        line: { color: ACCENT },
      });
      s.addText(slide.title, {
        x: 0.7,
        y: 0.7,
        w: 8.6,
        h: 0.7,
        fontSize: 26,
        bold: true,
        color: INK,
        fontFace: "Arial",
      });
      s.addText(
        slide.bullets.map((b) => ({ text: b, options: { bullet: true } })),
        {
          x: 0.85,
          y: 1.6,
          w: 8.3,
          h: 3.4,
          fontSize: 16,
          color: "1F2937",
          fontFace: "Arial",
          valign: "top",
          paraSpaceAfter: 10,
        }
      );
      if (slide.visualCue) {
        s.addText(slide.visualCue, {
          x: 0.7,
          y: 5.15,
          w: 8.5,
          h: 0.28,
          fontSize: 9,
          color: "9CA3AF",
          fontFace: "Arial",
          italic: true,
        });
      }
    }

    applyNotes(s as never, slide.notes);
  }

  const out = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}

export async function buildPresentationPdf(
  plan: PresentationPlan,
  options?: PresentationExportOptions
): Promise<Buffer> {
  const theme = resolvePresentationExportTheme(options);
  const INK = theme.ink;
  const ACCENT = theme.accent;
  const INK_SOFT = theme.inkSoft;
  const brandFooter = options?.brandName?.trim() || "UNAGENCY";
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 0,
      size: [842, 595], // landscape A4-ish for deck feel
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = 842;
    const pageH = 595;

    const drawCover = () => {
      doc.rect(0, 0, pageW, pageH).fill(`#${INK}`);
      doc.rect(0, 0, 14, pageH).fill(`#${ACCENT}`);
      doc
        .fillColor("#FFFFFF")
        .fontSize(32)
        .font("Helvetica-Bold")
        .text(plan.title, 48, 220, { width: 720 });
      if (plan.subtitle) {
        doc
          .fillColor("#C4C4CC")
          .fontSize(14)
          .font("Helvetica")
          .text(plan.subtitle, 48, 300, { width: 700 });
      }
      doc
        .fillColor(`#${ACCENT}`)
        .fontSize(10)
        .font("Helvetica-Bold")
        .text(brandFooter, 48, 540);
    };

    drawCover();

    for (const slide of plan.slides) {
      doc.addPage({ size: [pageW, pageH], margin: 0 });
      const layout = slide.layout ?? "content_bullets";
      if (
        layout === "title_hero" ||
        layout === "closing" ||
        layout === "section_divider"
      ) {
        doc.rect(0, 0, pageW, pageH).fill(`#${INK}`);
        doc.rect(0, 0, 14, pageH).fill(`#${ACCENT}`);
        doc
          .fillColor("#FFFFFF")
          .fontSize(26)
          .font("Helvetica-Bold")
          .text(slide.title, 48, 200, { width: 720 });
        doc
          .fillColor("#C4C4CC")
          .fontSize(13)
          .font("Helvetica")
          .text(slide.bullets.join("\n\n"), 48, 280, { width: 700 });
      } else if (layout === "key_message") {
        doc.rect(0, 0, pageW, pageH).fill(`#${INK_SOFT}`);
        doc.rect(0, 0, 14, pageH).fill(`#${ACCENT}`);
        doc
          .fillColor(`#${ACCENT}`)
          .fontSize(12)
          .font("Helvetica-Bold")
          .text(slide.title.toUpperCase(), 48, 160, { width: 720 });
        doc
          .fillColor(`#${INK}`)
          .fontSize(24)
          .font("Helvetica-Bold")
          .text(slide.bullets[0] ?? "", 48, 220, { width: 720 });
      } else {
        doc.rect(0, 0, pageW, pageH).fill("#FFFFFF");
        doc.rect(0, 0, 14, pageH).fill(`#${ACCENT}`);
        doc
          .fillColor(`#${INK}`)
          .fontSize(22)
          .font("Helvetica-Bold")
          .text(slide.title, 48, 48, { width: 720 });
        doc.fillColor("#1F2937").fontSize(13).font("Helvetica");
        let y = 110;
        for (const bullet of slide.bullets) {
          doc.text(`•  ${bullet}`, 56, y, { width: 700 });
          y += 28;
        }
      }
    }

    doc.end();
  });
}

export async function buildDocumentPdf(plan: DocumentPlan): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 54, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(22).fillColor("#111111").text(plan.title);
    if (plan.summary) {
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor("#444444").text(plan.summary);
    }
    doc.moveDown(1);

    for (const section of plan.sections) {
      doc.fontSize(14).fillColor("#111111").text(section.heading);
      doc.moveDown(0.3);
      doc.fontSize(11).fillColor("#222222").text(section.body, {
        align: "left",
        lineGap: 2,
      });
      doc.moveDown(0.9);
    }

    doc.end();
  });
}

function normalizeBrochureHex(raw: string | undefined, fallback: string): string {
  if (!raw?.trim()) return fallback;
  const t = raw.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t)) return t.toUpperCase();
  if (/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t)) return `#${t}`.toUpperCase();
  return fallback;
}

/**
 * Designed multi-page brochure/leaflet PDF (not a plain text report).
 * Keeps DocumentPlan as the content contract; layout is server-owned.
 */
export async function buildBrochurePdf(
  plan: DocumentPlan,
  options?: {
    readonly brandName?: string;
    readonly brandColors?: readonly string[];
    readonly subtype?: "brochures" | "leaflets";
  }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pageW = 595; // A4 portrait
    const pageH = 842;
    const doc = new PDFDocument({ margin: 0, size: [pageW, pageH] });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const primary = normalizeBrochureHex(options?.brandColors?.[0], `#${ACCENT}`);
    const secondary = normalizeBrochureHex(options?.brandColors?.[1], `#${INK}`);
    const surface = normalizeBrochureHex(options?.brandColors?.[2], `#${INK_SOFT}`);
    const brand =
      options?.brandName?.trim() ||
      plan.title.split(/\s+/)[0] ||
      "Brand";
    const isLeaflet = options?.subtype === "leaflets";

    // —— Cover / hero ——
    doc.rect(0, 0, pageW, pageH).fill(secondary);
    doc.rect(0, 0, pageW, 18).fill(primary);
    doc.rect(0, pageH - 120, pageW, 120).fill(primary);
    // Visual placement block (designed panel, not a mockup photo)
    doc.rect(40, 80, pageW - 80, 220).fill(surface);
    doc.rect(40, 80, 12, 220).fill(primary);
    doc
      .fillColor(primary)
      .fontSize(11)
      .font("Helvetica-Bold")
      .text(isLeaflet ? "LEAFLET" : "BROCHURE", 64, 100, { width: 400 });
    doc
      .fillColor(secondary)
      .fontSize(28)
      .font("Helvetica-Bold")
      .text(plan.title, 64, 140, { width: pageW - 140 });
    if (plan.summary) {
      doc
        .fillColor(`#${MUTED}`)
        .fontSize(12)
        .font("Helvetica")
        .text(plan.summary, 64, 240, { width: pageW - 140, lineGap: 3 });
    }
    doc
      .fillColor("#FFFFFF")
      .fontSize(14)
      .font("Helvetica-Bold")
      .text(brand, 48, pageH - 80, { width: pageW - 96 });
    doc
      .fillColor("#FFFFFF")
      .fontSize(10)
      .font("Helvetica")
      .text("Designed publication · Unagency", 48, pageH - 55);

    // —— Content pages (section layouts with hierarchy + whitespace) ——
    const sections = plan.sections.slice(0, isLeaflet ? 4 : 8);
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i]!;
      doc.addPage({ size: [pageW, pageH], margin: 0 });
      const even = i % 2 === 0;
      doc.rect(0, 0, pageW, pageH).fill(even ? "#FFFFFF" : surface);
      doc.rect(0, 0, 16, pageH).fill(primary);
      // Side visual band
      doc.rect(pageW - 100, 0, 100, pageH).fill(even ? surface : "#FFFFFF");
      doc.rect(pageW - 100, 60 + (i % 3) * 40, 100, 160).fill(primary);
      doc
        .fillColor(primary)
        .fontSize(10)
        .font("Helvetica-Bold")
        .text(`0${i + 1}`, 48, 48);
      doc
        .fillColor(secondary)
        .fontSize(22)
        .font("Helvetica-Bold")
        .text(section.heading, 48, 78, { width: pageW - 180 });
      doc
        .fillColor("#1F2937")
        .fontSize(12)
        .font("Helvetica")
        .text(section.body, 48, 130, {
          width: pageW - 180,
          lineGap: 4,
          align: "left",
        });
      doc
        .fillColor(`#${MUTED}`)
        .fontSize(9)
        .font("Helvetica")
        .text(brand, 48, pageH - 40);
    }

    // —— CTA / contact ——
    doc.addPage({ size: [pageW, pageH], margin: 0 });
    doc.rect(0, 0, pageW, pageH).fill(secondary);
    doc.rect(40, 200, pageW - 80, 280).fill(primary);
    doc
      .fillColor("#FFFFFF")
      .fontSize(24)
      .font("Helvetica-Bold")
      .text("Let's talk", 64, 240, { width: pageW - 128 });
    doc
      .fillColor("#FFFFFF")
      .fontSize(13)
      .font("Helvetica")
      .text(
        plan.summary?.trim() ||
          `Connect with ${brand} — the next step starts here.`,
        64,
        290,
        { width: pageW - 128, lineGap: 3 }
      );
    doc
      .fillColor("#FFFFFF")
      .fontSize(11)
      .font("Helvetica-Bold")
      .text(brand.toUpperCase(), 64, 400);
    doc
      .fillColor("#FFFFFF")
      .fontSize(10)
      .font("Helvetica")
      .text("Contact · CTA · Unagency", 64, 430);

    doc.end();
  });
}

/** Also produce a simple PPTX for document plans (one section per slide). */
export async function buildDocumentPptx(plan: DocumentPlan): Promise<Buffer> {
  const asPresentation: PresentationPlan = {
    title: plan.title,
    subtitle: plan.summary,
    slides: plan.sections.map((section) => ({
      title: section.heading,
      bullets: section.body
        .split(/\n+/)
        .map((line) => line.replace(/^[-•*]\s*/, "").trim())
        .filter(Boolean)
        .slice(0, 8),
      layout: "content_bullets" as const,
    })),
  };
  const slides = asPresentation.slides.map((s) =>
    s.bullets.length > 0
      ? s
      : { ...s, bullets: ["See document PDF for full detail."] }
  );
  return buildPresentationPptx({ ...asPresentation, slides });
}

/** Editable Word document for DocumentPlan downloads. */
export async function buildDocumentDocx(plan: DocumentPlan): Promise<Buffer> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import(
    "docx"
  );
  const children: InstanceType<typeof Paragraph>[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: plan.title, bold: true })],
    }),
  ];
  if (plan.summary?.trim()) {
    children.push(
      new Paragraph({
        spacing: { after: 240 },
        children: [
          new TextRun({ text: plan.summary.trim(), italics: true, size: 22 }),
        ],
      })
    );
  }
  for (const section of plan.sections) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 280, after: 120 },
        children: [new TextRun({ text: section.heading, bold: true })],
      }),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: section.body, size: 22 })],
      })
    );
  }
  const doc = new Document({
    creator: "Unagency",
    title: plan.title,
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
