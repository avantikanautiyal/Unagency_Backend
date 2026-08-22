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

function parseSlide(item: unknown): PresentationSlide | null {
  if (!isRecord(item)) return null;
  const slideTitle = typeof item.title === "string" ? item.title.trim() : "";
  const bullets = Array.isArray(item.bullets)
    ? item.bullets
        .filter((b): b is string => typeof b === "string" && b.trim().length > 0)
        .map((b) => b.trim())
    : [];
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

function paintAccentBar(slide: {
  addShape: (
    type: string,
    opts: Record<string, unknown>
  ) => void;
}): void {
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: 0.12,
    h: 5.625,
    fill: { color: ACCENT },
    line: { color: ACCENT },
  });
}

export async function buildPresentationPptx(
  plan: PresentationPlan
): Promise<Buffer> {
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
    s.addText("UNAGENCY", {
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
      paintAccentBar(s as never);
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
      paintAccentBar(s as never);
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
      paintAccentBar(s as never);
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
  plan: PresentationPlan
): Promise<Buffer> {
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
        .text("UNAGENCY", 48, 540);
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
