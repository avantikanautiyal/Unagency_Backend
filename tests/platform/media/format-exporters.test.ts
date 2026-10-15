import {
  canExportExtendedFormat,
  exportExtendedFormat,
  extendedExportFormatsForMime,
  textToDocumentPlan,
} from "../../../src/platform/media/delivery/format-exporters";
import { validateRequestedDownloadFormat } from "../../../src/platform/media/delivery/media-delivery-service";

describe("download format exporters", () => {
  it("maps each source type to the formats it can be exported to", () => {
    expect(extendedExportFormatsForMime("text/html; charset=utf-8")).toEqual(["pdf", "png"]);
    expect(extendedExportFormatsForMime("video/mp4")).toEqual(["gif"]);
    expect(extendedExportFormatsForMime("text/markdown")).toEqual(["pdf", "docx"]);
    expect(extendedExportFormatsForMime("image/png")).toEqual([]);
    expect(canExportExtendedFormat("video/mp4", "GIF")).toBe(true);
    expect(canExportExtendedFormat("video/mp4", "pdf")).toBe(false);
  });

  it("validation accepts extended exports and still rejects unsupported ones", () => {
    expect(validateRequestedDownloadFormat({ sourceMime: "text/html", requested: "pdf" }).ok).toBe(true);
    expect(validateRequestedDownloadFormat({ sourceMime: "video/mp4", requested: "gif" }).ok).toBe(true);
    expect(validateRequestedDownloadFormat({ sourceMime: "image/png", requested: "pdf" }).ok).toBe(true);
    expect(validateRequestedDownloadFormat({ sourceMime: "video/mp4", requested: "docx" }).ok).toBe(false);
  });

  it("turns markdown copy into a titled, sectioned document plan", () => {
    const plan = textToDocumentPlan(
      "# Brand Strategy\nIntro line\n## Audience\n- Women 25-40\n- **Urban** professionals\n## Tone\nWarm",
    );
    expect(plan.title).toBe("Brand Strategy");
    expect(plan.sections.map((s) => s.heading)).toEqual(["", "Audience", "Tone"]);
    expect(plan.sections[1]!.body).toBe("• Women 25-40\n• Urban professionals");
  });

  it("exports text as PDF and DOCX files", async () => {
    const bytes = Buffer.from("# Taglines\n## Options\nBold. Bright. Yours.", "utf8");
    const pdf = await exportExtendedFormat({ bytes, sourceMime: "text/plain", requested: "pdf" });
    expect(pdf.ok).toBe(true);
    if (pdf.ok) expect(pdf.value.bytes.subarray(0, 4).toString("latin1")).toBe("%PDF");
    const docx = await exportExtendedFormat({ bytes, sourceMime: "text/plain", requested: "docx" });
    expect(docx.ok).toBe(true);
    if (docx.ok) expect(docx.value.bytes.subarray(0, 2).toString("latin1")).toBe("PK");
  });
});
