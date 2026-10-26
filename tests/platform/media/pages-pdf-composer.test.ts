import { PNG } from "pngjs";
import { composePagesPdf } from "../../../src/platform/media/delivery/pages-pdf-composer";

function png(w: number, h: number): Buffer {
  const img = new PNG({ width: w, height: h });
  img.data.fill(200);
  return PNG.sync.write(img);
}

function pageCount(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
}

describe("pages-pdf-composer", () => {
  it("builds one PDF: one page per page, and storyboard sheets", async () => {
    const pages = Array.from({ length: 6 }, () => ({ bytes: png(30, 40) }));
    const asPages = await composePagesPdf({ title: "Booklet", layout: "pages", pages });
    expect(asPages.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pageCount(asPages)).toBe(6);

    // Folds read page by page too — never printer spreads.
    const trifold = await composePagesPdf({ title: "Trifold", layout: "tri-fold", pages });
    expect(pageCount(trifold)).toBe(6);

    const board = await composePagesPdf({
      title: "Storyboard",
      layout: "storyboard",
      pages: pages.map((p, i) => ({ bytes: png(48, 27), caption: `Scene ${i + 1}` })),
    });
    expect(pageCount(board)).toBe(2); // 6 frames, 4 per sheet
  });

  it("gives every page page 1's size, whatever shape the other images are", async () => {
    const pdf = await composePagesPdf({
      title: "Brochure",
      layout: "bi-fold",
      pages: [{ bytes: png(30, 42) }, { bytes: png(40, 30) }, { bytes: png(30, 30) }, { bytes: png(31, 42) }],
    });
    const boxes = [...pdf.toString("latin1").matchAll(/\/MediaBox \[([^\]]+)\]/g)].map((m) => m[1]);
    expect(boxes).toHaveLength(4);
    expect(new Set(boxes).size).toBe(1);
  });
});
