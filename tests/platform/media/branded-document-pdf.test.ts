import { buildDocumentPdf } from "../../../src/platform/os/delivery/document-export-service";

describe("buildDocumentPdf — brand-coloured written documents", () => {
  it("builds a cover + body pages with brand styling", async () => {
    const pdf = await buildDocumentPdf(
      {
        title: "Brand Guidelines",
        summary: "How the brand looks and sounds.",
        sections: Array.from({ length: 6 }, (_, i) => ({
          heading: `Section ${i + 1}`,
          body: "Lorem body text. ".repeat(80),
        })),
      },
      { brandName: "Anykaa", brandColors: ["#0B3D2E", "#D4AF37"] },
    );
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const pages = (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
    expect(pages).toBeGreaterThanOrEqual(3);
  });

  it("still works without brand info", async () => {
    const pdf = await buildDocumentPdf({ title: "Doc", sections: [{ heading: "A", body: "b" }] });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
