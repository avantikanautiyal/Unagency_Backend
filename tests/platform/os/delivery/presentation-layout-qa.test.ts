import {
  auditPresentationLayout,
  renderDesignedPresentationPdf,
} from "../../../../src/platform/os/delivery/presentation-design";
import {
  evaluatePresentationExport,
  type PresentationPlan,
} from "../../../../src/platform/os/delivery/document-export-service";

const LONG =
  "Our platform reduces onboarding time by 63% across 140 enterprise customers in regulated industries, while also cutting support tickets, improving retention, and unlocking expansion revenue that compounds quarter over quarter for every cohort we have measured since launch.";

const plan: PresentationPlan = {
  title: "Acme Series B",
  subtitle: "Investor update",
  slides: [
    {
      title: "Traction",
      layout: "content_bullets",
      bullets: Array.from({ length: 9 }, (_, i) =>
        i === 2 ? `Point 3: ${LONG}` : `Point ${i + 1}: steady growth`,
      ),
    },
    { title: "Why now", layout: "key_message", bullets: ["Regulation just changed."] },
    { title: "Thanks", layout: "closing", bullets: ["hello@acme.com"] },
  ],
};
const noImages = plan.slides.map(() => undefined);

describe("presentation layout QA", () => {
  it.each(["minimal", "executive", "editorial"] as const)(
    "%s: continues overflowing bullets instead of dropping them",
    (designStyle) => {
      const report = auditPresentationLayout(plan, noImages, { designStyle });
      // cover + 3 plan slides + 1 continuation for bullets 7–9
      expect(report.renderedSlideCount).toBe(5);
      expect(report.continuationSlides).toBe(1);
    },
  );

  it("records text that had to be shortened to fit, never silently clipping", () => {
    const report = auditPresentationLayout(plan, noImages, { designStyle: "minimal" });
    const shortened = report.defects.filter((d) => d.kind === "text_shortened");
    expect(shortened.length).toBeGreaterThan(0);
    expect(shortened.every((d) => d.slide === 2 && d.severity === "warning")).toBe(true);
    expect(report.passed).toBe(true);
  });

  it("leaves decorative glyphs alone", () => {
    const report = auditPresentationLayout(plan, noImages, { designStyle: "editorial" });
    expect(report.defects.some((d) => d.detail.startsWith('"“"'))).toBe(false);
  });

  it("validates the real PDF: page count matches the laid-out deck", async () => {
    const options = { designStyle: "executive" as const };
    const pdf = await renderDesignedPresentationPdf(plan, noImages, options);
    const qa = await evaluatePresentationExport({ plan, options, pdf });
    expect(qa.exportValid).toBe(true);
    expect(qa.pdfPageCount).toBe(5);
    expect(qa.passed).toBe(true);
  });

  it("rejects a corrupt export", async () => {
    const qa = await evaluatePresentationExport({
      plan,
      pdf: Buffer.from("not a pdf"),
      pptx: Buffer.from("nope"),
    });
    expect(qa.exportValid).toBe(false);
    expect(qa.passed).toBe(false);
    expect(qa.issues).toEqual(
      expect.arrayContaining([
        "PDF export is not a PDF file",
        "PPTX export is not a valid Office (zip) file",
      ]),
    );
  });
});
