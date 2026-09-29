/**
 * Build designed PPTX + PDF bytes from structured PresentationPlan / DocumentPlan.
 * Pitch decks use slide layouts (not a plain text dump).
 */

import PDFDocument from "pdfkit";
import { mapWithConcurrency } from "./best-effort-visual-image";
import {
  renderDesignedPresentationPdf,
  renderDesignedPresentationPptx,
  type PresentationDesignStyle,
} from "./presentation-design";

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

export type PresentationSlideImage = {
  /** Base64 image bytes (no data: prefix). */
  readonly data: string;
  readonly ext?: string;
};

export type PresentationExportOptions = {
  readonly brandName?: string;
  readonly brandColors?: readonly string[];
  /** Theme from the chosen design route (Clean Minimal / Bold Executive / Modern Editorial). */
  readonly designStyle?: PresentationDesignStyle;
  /**
   * Best-effort per-slide image from visualCue. Must never throw —
   * return undefined on failure so export still ships.
   */
  readonly resolveSlideImage?: (
    cue: string,
    slide: PresentationSlide
  ) => Promise<PresentationSlideImage | undefined>;
};

/** Image generations per deck — the rest use designed no-image layouts. */
const MAX_SLIDE_IMAGES = 5;
const SLIDE_IMAGE_CONCURRENCY = 3;
const SLIDE_IMAGE_PRIORITY: Record<PresentationSlideLayout, number> = {
  title_hero: 0,
  section_divider: 1,
  key_message: 2,
  closing: 3,
  content_bullets: 4,
};

async function resolveSlideImagesSafe(
  slides: readonly PresentationSlide[],
  resolve?: PresentationExportOptions["resolveSlideImage"]
): Promise<(PresentationSlideImage | undefined)[]> {
  const out: (PresentationSlideImage | undefined)[] = slides.map(() => undefined);
  if (!resolve) return out;
  const chosen = slides
    .map((slide, index) => ({ slide, index, cue: slide.visualCue?.trim() ?? "" }))
    .filter((item) => item.cue)
    .sort(
      (a, b) =>
        SLIDE_IMAGE_PRIORITY[a.slide.layout ?? "content_bullets"] -
          SLIDE_IMAGE_PRIORITY[b.slide.layout ?? "content_bullets"] || a.index - b.index
    )
    .slice(0, MAX_SLIDE_IMAGES);
  await mapWithConcurrency(chosen, SLIDE_IMAGE_CONCURRENCY, async ({ slide, index, cue }) => {
    try {
      out[index] = await resolve(cue, slide);
    } catch (err) {
      console.warn(
        `[presentation-export] slide image failed: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  });
  return out;
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

export async function buildPresentationPptx(
  plan: PresentationPlan,
  options?: PresentationExportOptions
): Promise<Buffer> {
  const slideImages = await resolveSlideImagesSafe(
    plan.slides,
    options?.resolveSlideImage
  );
  return renderDesignedPresentationPptx(plan, slideImages, options);
}

export async function buildPresentationPdf(
  plan: PresentationPlan,
  options?: PresentationExportOptions
): Promise<Buffer> {
  const slideImages = await resolveSlideImagesSafe(
    plan.slides,
    options?.resolveSlideImage
  );
  return renderDesignedPresentationPdf(plan, slideImages, options);
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
