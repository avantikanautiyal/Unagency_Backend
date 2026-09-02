import {
  buildDocumentPlanInstructionBlock,
  documentContextFromMetadata,
  synthesizeDocumentPlanFromText,
} from "../../../../src/platform/os/delivery/document-generation";
import {
  isSoftDocumentExportMiss,
  resolveDocumentExportKind,
} from "../../../../src/platform/api/services/document-export-materializer";

describe("document-generation", () => {
  it("frames print brochures as documents, not presentations", () => {
    const block = buildDocumentPlanInstructionBlock({
      userBrief: "Italian sauces brand brochure with silver and metallic red",
      brandName: "Dusini",
      service: "print",
      subtype: "brochures",
      exampleDeliverable:
        "Multipage brochure suitable for print or digital distribution",
    });
    expect(block).toContain("NOT a pitch deck or presentation");
    expect(block).toContain("DocumentPlan");
    expect(block).toContain("Dusini");
    expect(block).toContain("Brochure layout intent");
    expect(block).toContain("do NOT return slides");
  });

  it("reads service metadata for document context", () => {
    const ctx = documentContextFromMetadata(
      {
        service: "print",
        subtype: "brochures",
        exampleDeliverable: "Multipage brochure",
        brandName: "Dusini",
      },
      "Make a brochure for summer"
    );
    expect(ctx.service).toBe("print");
    expect(ctx.subtype).toBe("brochures");
    expect(ctx.brandName).toBe("Dusini");
  });

  it("synthesizes a DocumentPlan from prose so export can soft-recover", () => {
    const plan = synthesizeDocumentPlanFromText(`
Brand Guidelines

Our Italian sauces brand uses red, green, and white with a focus on readability.
Typography should stay clear on packaging and digital surfaces.

Color System

Primary red for sauce labels, green for freshness cues, and white for breathing room.

Voice

Warm, authentic, and never overcomplicated. Speak like a family kitchen.
`);
    expect(plan).not.toBeNull();
    expect(plan!.title.length).toBeGreaterThan(0);
    expect(plan!.sections.length).toBeGreaterThanOrEqual(3);
    expect(plan!.sections.every((s) => s.heading && s.body)).toBe(true);
  });

  it("synthesizes from markdown headings", () => {
    const plan = synthesizeDocumentPlanFromText(`# Sauce Brand Book

Intro copy for the brand.

## Palette

Red, green, white with high contrast.

## Type

Readable sans for packaging.
`);
    expect(plan).not.toBeNull();
    expect(plan!.sections.length).toBeGreaterThanOrEqual(2);
  });
});

describe("resolveDocumentExportKind", () => {
  it("does not request document export from schema name alone", () => {
    expect(
      resolveDocumentExportKind({
        structuredName: "DocumentPlan",
        outputKind: "document",
      })
    ).toBeNull();
  });

  it("requests document export when recoverable plan data exists", () => {
    expect(
      resolveDocumentExportKind({
        structuredName: "DocumentPlan",
        outputKind: "document",
        data: {
          title: "Guidelines",
          summary: "Brand book",
          sections: [
            { heading: "Color", body: "Red green white." },
            { heading: "Type", body: "Keep it readable." },
            { heading: "Voice", body: "Warm and authentic." },
          ],
        },
      })
    ).toBe("document");
  });

  it("does not convert LaunchPlan steps into a document export", () => {
    expect(
      resolveDocumentExportKind({
        structuredName: "DocumentPlan",
        outputKind: "document",
        data: {
          title: "Creative routes",
          summary: "Three directions",
          steps: [
            { title: "A", description: "One" },
            { title: "B", description: "Two" },
            { title: "C", description: "Three" },
          ],
        },
      })
    ).toBeNull();
  });

  it("marks missing-plan messages as soft misses", () => {
    expect(
      isSoftDocumentExportMiss("No structured plan available for document export")
    ).toBe(true);
    expect(isSoftDocumentExportMiss("PDF render crashed")).toBe(false);
  });
});
