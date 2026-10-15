/**
 * Compose designed page images into one screen-quality PDF.
 *
 *   pages       — one page per image, in reading order (sized to the image).
 *   bi-fold     — printer spreads: outside [4 | 1], inside [2 | 3].
 *   tri-fold /
 *   z-fold      — printer spreads: outside [5 | 6 | 1], inside [2 | 3 | 4].
 *   storyboard  — landscape sheets, 4 frames per sheet with scene notes.
 */

import PDFDocument from "pdfkit";

export type PagesPdfLayout = "pages" | "bi-fold" | "tri-fold" | "z-fold" | "storyboard";

export type PagesPdfPage = {
  readonly bytes: Buffer;
  readonly caption?: string;
};

/** Panels per printed sheet, as 1-based page numbers (left → right). */
export function sheetsForLayout(layout: PagesPdfLayout, pageCount: number): number[][] {
  if (layout === "bi-fold" && pageCount === 4) return [[4, 1], [2, 3]];
  if ((layout === "tri-fold" || layout === "z-fold") && pageCount === 6) {
    return [[5, 6, 1], [2, 3, 4]];
  }
  return Array.from({ length: pageCount }, (_, i) => [i + 1]);
}

type OpenedImage = { readonly width: number; readonly height: number };

/** pdfkit's openImage exists at runtime but is missing from its typings. */
function openImage(doc: PDFKit.PDFDocument, bytes: Buffer): OpenedImage {
  return (doc as unknown as { openImage(src: Buffer): OpenedImage }).openImage(bytes);
}

/** Screen-quality panel height in PDF points. */
const PANEL_HEIGHT = 700;

export async function composePagesPdf(input: {
  readonly title: string;
  readonly layout: PagesPdfLayout;
  readonly pages: readonly PagesPdfPage[];
}): Promise<Buffer> {
  if (input.pages.length === 0) throw new Error("No pages to compose");
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false, info: { Title: input.title } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      if (input.layout === "storyboard") {
        drawStoryboard(doc, input.pages);
      } else {
        for (const sheet of sheetsForLayout(input.layout, input.pages.length)) {
          const images = sheet.map((n) => openImage(doc, input.pages[n - 1]!.bytes));
          // Every panel scaled to the same height; panels sit edge to edge.
          const widths = images.map((img) => (img.width / img.height) * PANEL_HEIGHT);
          const sheetWidth = widths.reduce((a, b) => a + b, 0);
          doc.addPage({ size: [sheetWidth, PANEL_HEIGHT], margin: 0 });
          let x = 0;
          images.forEach((img, i) => {
            doc.image(img as never, x, 0, { width: widths[i]!, height: PANEL_HEIGHT });
            x += widths[i]!;
          });
        }
      }
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function drawStoryboard(doc: PDFKit.PDFDocument, pages: readonly PagesPdfPage[]): void {
  const pageW = 842; // A4 landscape
  const pageH = 595;
  const margin = 28;
  const gap = 18;
  const captionH = 54;
  const cellW = (pageW - margin * 2 - gap) / 2;
  const cellH = (pageH - margin * 2 - gap) / 2;
  const frameH = cellH - captionH;
  for (let i = 0; i < pages.length; i += 1) {
    if (i % 4 === 0) doc.addPage({ size: [pageW, pageH], margin: 0 });
    const slot = i % 4;
    const x = margin + (slot % 2) * (cellW + gap);
    const y = margin + Math.floor(slot / 2) * (cellH + gap);
    const img = openImage(doc, pages[i]!.bytes);
    const scale = Math.min(cellW / img.width, frameH / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    doc.image(img as never, x + (cellW - w) / 2, y, { width: w, height: h });
    doc.rect(x, y, cellW, frameH).lineWidth(0.5).strokeColor("#cccccc").stroke();
    const caption = pages[i]!.caption?.trim() || `Frame ${i + 1}`;
    doc
      .fillColor("#111111")
      .fontSize(9)
      .text(caption, x, y + frameH + 6, { width: cellW, height: captionH - 8, ellipsis: true });
  }
}
