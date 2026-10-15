import { PNG } from "pngjs";
import {
  composePagesPdf,
  sheetsForLayout,
} from "../../../src/platform/media/delivery/pages-pdf-composer";

function png(w: number, h: number): Buffer {
  const img = new PNG({ width: w, height: h });
  img.data.fill(200);
  return PNG.sync.write(img);
}

function pageCount(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
}

describe("pages-pdf-composer", () => {
  it("arranges folded formats as printer spreads", () => {
    expect(sheetsForLayout("tri-fold", 6)).toEqual([[5, 6, 1], [2, 3, 4]]);
    expect(sheetsForLayout("bi-fold", 4)).toEqual([[4, 1], [2, 3]]);
    // Wrong panel count falls back to pages in reading order.
    expect(sheetsForLayout("tri-fold", 5)).toEqual([[1], [2], [3], [4], [5]]);
  });

  it("builds one PDF: pages, spreads and storyboard sheets", async () => {
    const pages = Array.from({ length: 6 }, () => ({ bytes: png(30, 40) }));
    const asPages = await composePagesPdf({ title: "Booklet", layout: "pages", pages });
    expect(asPages.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pageCount(asPages)).toBe(6);

    const trifold = await composePagesPdf({ title: "Trifold", layout: "tri-fold", pages });
    expect(pageCount(trifold)).toBe(2);

    const board = await composePagesPdf({
      title: "Storyboard",
      layout: "storyboard",
      pages: pages.map((p, i) => ({ bytes: png(48, 27), caption: `Scene ${i + 1}` })),
    });
    expect(pageCount(board)).toBe(2); // 6 frames, 4 per sheet
  });
});
