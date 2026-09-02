import {
  buildDocumentDocx,
  buildDocumentPdf,
} from "../../../../src/platform/os/delivery/document-export-service";
import { buildWebProjectZip } from "../../../../src/platform/os/delivery/website-generation";

describe("document/website download formats", () => {
  it("builds a non-empty DOCX for DocumentPlan", async () => {
    const buf = await buildDocumentDocx({
      title: "Brand Brochure",
      summary: "A short overview",
      sections: [
        { heading: "Intro", body: "Welcome to the brand story." },
        { heading: "Offer", body: "Our products and services." },
        { heading: "Contact", body: "Get in touch today." },
      ],
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
    // DOCX is a zip container
    expect(buf.subarray(0, 2).toString("utf8")).toBe("PK");
  });

  it("builds a non-empty PDF for DocumentPlan", async () => {
    const buf = await buildDocumentPdf({
      title: "Brand Brochure",
      summary: "A short overview",
      sections: [
        { heading: "Intro", body: "Welcome to the brand story." },
        { heading: "Offer", body: "Our products and services." },
        { heading: "Contact", body: "Get in touch today." },
      ],
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 4).toString("utf8")).toBe("%PDF");
  });

  it("zips WebProject files into a codebase folder", async () => {
    const buf = await buildWebProjectZip({
      title: "DiVastra Landing",
      summary: "Fashion landing page",
      stack: "html-static",
      entry: "index.html",
      files: [
        {
          path: "index.html",
          content:
            "<!DOCTYPE html><html><body><h1>DiVastra</h1></body></html>",
        },
        { path: "README.md", content: "# DiVastra\n" },
      ],
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(100);
    expect(buf.subarray(0, 2).toString("utf8")).toBe("PK");
  });
});
