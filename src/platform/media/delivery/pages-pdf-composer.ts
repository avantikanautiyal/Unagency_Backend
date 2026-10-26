/**
 * Compose designed page images into one screen-quality PDF.
 *
 *   pages / bi-fold / tri-fold / z-fold
 *               — one designed page per PDF page, in reading order. Every PDF
 *                 page has page 1's size; a page image of another shape is
 *                 cropped to it (near match) or centred on white (far off).
 *                 Folds are not imposed as printer spreads — the client wants
 *                 to read the brochure page by page.
 *   storyboard  — landscape sheets, 4 frames per sheet with scene notes.
 */

import PDFDocument from "pdfkit";

export type PagesPdfLayout = "pages" | "bi-fold" | "tri-fold" | "z-fold" | "storyboard";

export type PagesPdfPage = {
  readonly bytes: Buffer;
  readonly caption?: string;
};

type OpenedImage = { readonly width: number; readonly height: number };

/** pdfkit's openImage exists at runtime but is missing from its typings. */
function openImage(doc: PDFKit.PDFDocument, bytes: Buffer): OpenedImage {
  return (doc as unknown as { openImage(src: Buffer): OpenedImage }).openImage(bytes);
}

/** Screen-quality panel height in PDF points. */
const PANEL_HEIGHT = 700;

/** Up to ~12% shape difference is cropped to fit; beyond that it is letterboxed. */
const MAX_CROP_LOG_RATIO = 0.12;

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
        const images = input.pages.map((p) => openImage(doc, p.bytes));
        const aspect = images[0]!.width / images[0]!.height;
        const pageW = aspect * PANEL_HEIGHT;
        for (const img of images) {
          doc.addPage({ size: [pageW, PANEL_HEIGHT], margin: 0 });
          const off = Math.abs(Math.log(img.width / img.height / aspect));
          if (off < MAX_CROP_LOG_RATIO) {
            doc.save();
            doc.rect(0, 0, pageW, PANEL_HEIGHT).clip();
            doc.image(img as never, 0, 0, { cover: [pageW, PANEL_HEIGHT], align: "center", valign: "center" });
            doc.restore();
          } else {
            doc.rect(0, 0, pageW, PANEL_HEIGHT).fill("#ffffff");
            doc.image(img as never, 0, 0, { fit: [pageW, PANEL_HEIGHT], align: "center", valign: "center" });
          }
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
