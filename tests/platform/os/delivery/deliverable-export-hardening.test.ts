import {
  resolveDocumentExportKind,
  isRequiredDocumentOrPresentationExport,
  materializeDocumentExports,
} from "../../../../src/platform/api/services/document-export-materializer";
import { applyWebsiteExportToExecution } from "../../../../src/platform/api/services/website-export-materializer";
import { resolveOutputContractId } from "../../../../src/platform/api/services/execution-governance-extras";
import { defaultOutputContractRegistry } from "../../../../src/platform/os/contracts/output-contract-registry";
import {
  buildBrochurePdf,
  buildDocumentPdf,
  parseDocumentPlan,
} from "../../../../src/platform/os/delivery/document-export-service";
import { resolvePresentationExpandMode } from "../../../../src/platform/os/delivery/presentation-generation";

describe("presentation expand default", () => {
  it("coerces stale lazy to full for pitch-deck creates", () => {
    expect(resolvePresentationExpandMode({})).toBe("full");
    expect(
      resolvePresentationExpandMode({ presentationExpandMode: "lazy" })
    ).toBe("full");
    expect(
      resolvePresentationExpandMode({ presentationExpandMode: "full" })
    ).toBe("full");
    expect(
      resolvePresentationExpandMode({
        presentationExpandMode: "lazy",
        subtype: "gifs",
      })
    ).toBe("lazy");
  });
});

describe("resolveDocumentExportKind binding", () => {
  const validDoc = {
    title: "Guidelines",
    summary: "Brand book",
    sections: [
      { heading: "Color", body: "Red green white." },
      { heading: "Type", body: "Keep it readable." },
      { heading: "Voice", body: "Warm and authentic." },
    ],
  };

  const validDeck = {
    title: "Pitch",
    subtitle: "Q1",
    slides: [
      {
        title: "Intro",
        bullets: ["a", "b"],
        notes: "",
        layout: "title_hero",
        visualCue: "x",
      },
    ],
  };

  it("document kind exports only when DocumentPlan is valid", () => {
    expect(
      resolveDocumentExportKind({
        outputKind: "document",
        structuredName: "DocumentPlan",
        data: validDoc,
      })
    ).toBe("document");
  });

  it("rejects LaunchPlan-shaped document input", () => {
    expect(
      resolveDocumentExportKind({
        outputKind: "document",
        structuredName: "DocumentPlan",
        data: {
          title: "Routes",
          summary: "Three directions",
          steps: [
            { title: "Heritage", description: "Warm story" },
            { title: "Modern", description: "Clean UI" },
            { title: "Bold", description: "High contrast" },
          ],
        },
      })
    ).toBeNull();
  });

  it("rejects presentation-shaped data for document requests", () => {
    expect(
      resolveDocumentExportKind({
        outputKind: "document",
        structuredName: "DocumentPlan",
        data: validDeck,
      })
    ).toBeNull();
  });

  it("presentation kind requires slides/routes — concepts-only is null", () => {
    expect(
      resolveDocumentExportKind({
        outputKind: "presentation",
        structuredName: "PresentationRouteConcepts",
        data: {
          concepts: [
            { title: "A", description: "d", narrativeAngle: "m" },
            { title: "B", description: "d", narrativeAngle: "m" },
            { title: "C", description: "d", narrativeAngle: "m" },
          ],
        },
      })
    ).toBeNull();
    expect(
      isRequiredDocumentOrPresentationExport({
        outputKind: "presentation",
        structuredName: "PresentationRouteConcepts",
      })
    ).toBe(true);
  });

  it("presentation kind resolves when PresentationPlan present", () => {
    expect(
      resolveDocumentExportKind({
        outputKind: "presentation",
        data: validDeck,
      })
    ).toBe("presentation");
  });
});

describe("governance output contracts", () => {
  it("maps website/presentation/document from outputKind", () => {
    expect(
      resolveOutputContractId("text.generate", { outputKind: "deferred_website" })
    ).toBe("output.website");
    expect(
      resolveOutputContractId("text.generate", { outputKind: "website" })
    ).toBe("output.website");
    expect(
      resolveOutputContractId("text.generate", { outputKind: "presentation" })
    ).toBe("output.presentation");
    expect(
      resolveOutputContractId("text.generate", { outputKind: "document" })
    ).toBe("output.document");
    expect(resolveOutputContractId("text.generate")).toBe("output.copy");
  });

  it("maps from structured schema name", () => {
    expect(
      resolveOutputContractId("text.generate", {
        structuredOutputName: "WebProject",
      })
    ).toBe("output.website");
    expect(
      resolveOutputContractId("text.generate", {
        structuredOutputName: "PresentationRouteConcepts",
      })
    ).toBe("output.presentation");
    expect(
      resolveOutputContractId("text.generate", {
        structuredOutputName: "DocumentPlan",
      })
    ).toBe("output.document");
  });

  it("output.document requires pdf+docx", () => {
    const contract = defaultOutputContractRegistry.getContract("output.document");
    expect(contract.requiredArtifacts).toEqual(["text", "pdf", "docx"]);
  });
});

describe("website missing async media", () => {
  it("fails website-required export when asyncMedia is absent", async () => {
    const result = await applyWebsiteExportToExecution({
      asyncMedia: undefined,
      executionId: "exec_web",
      organizationId: "org_1",
      status: "succeeded",
      metadata: {
        service: "website",
        outputKind: "deferred_website",
        structuredOutput: { name: "WebProject" },
      },
      createId: (p) => `${p}_1`,
      jobSummary: {
        structuredData: {
          title: "Site",
          summary: "s",
          stack: "html-static",
          brandName: "Acme",
          tagline: "Go",
          heroBody: "Hello",
          sections: [
            { heading: "One", body: "Body one" },
            { heading: "Two", body: "Body two" },
          ],
          ctaLabel: "Start",
          colors: {
            primary: "#111",
            background: "#fff",
            text: "#000",
            accent: "#f00",
          },
          html: "<!DOCTYPE html><html><body>Hi</body></html>",
        },
      },
    });
    expect(result.exported).toBe(false);
    expect(result.errorCode).toMatch(/async media/i);
  });
});

describe("brochure visual PDF", () => {
  const brochurePlan = {
    title: "Dusini Summer Sauces",
    summary: "Italian sauces with silver and metallic red accents.",
    sections: [
      {
        heading: "Our Story",
        body: "Family recipes from Naples with modern packaging.",
      },
      {
        heading: "Range",
        body: "Arrabbiata, pesto, and creamy tomato for everyday cooking.",
      },
      {
        heading: "Proof",
        body: "Trusted by chefs across Europe for consistent flavour.",
      },
      {
        heading: "Contact",
        body: "Visit dusini.com or email hello@dusini.com.",
      },
    ],
  };

  it("parses DocumentPlan and builds a multi-page brochure PDF larger than plain text", async () => {
    const parsed = parseDocumentPlan(brochurePlan);
    expect(parsed).not.toBeNull();
    const plain = await buildDocumentPdf(parsed!);
    const brochure = await buildBrochurePdf(parsed!, {
      brandName: "Dusini",
      brandColors: ["#C41E3A", "#0B0B0F", "#F7F4F0"],
      subtype: "brochures",
    });
    expect(brochure.length).toBeGreaterThan(plain.length);
    // Multi-page designed PDF: cover + sections + CTA → more bytes / pages than plain dump.
    expect(brochure.length).toBeGreaterThan(2_500);
    expect(brochure.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  });
});

describe("valid document materialize formats", () => {
  it("materializes PDF + DOCX only for document exportKind", async () => {
    const ingested: string[] = [];
    const fakeAsyncMedia = {
      artifacts: {
        buildArtifactId: (op: string, i: number) => `${op}_${i}`,
        finalize: async () => undefined,
      },
      ingestion: {
        ingest: async (args: { artifactId: string; mimeType: string }) => {
          ingested.push(args.mimeType);
          return {
            ok: true as const,
            value: {
              storageRef: `blob://${args.artifactId}`,
              byteLength: 10,
              contentType: args.mimeType,
            },
          };
        },
      },
    };

    const result = await materializeDocumentExports({
      asyncMedia: fakeAsyncMedia as never,
      executionId: "exec_doc",
      organizationId: "org_1",
      exportKind: "document",
      createId: (p) => `${p}_x`,
      metadata: {
        service: "branding",
        subtype: "brand-guidelines",
        brandName: "Dusini",
        userBrief: "Dusini Italian sauces brand guidelines red green white",
      },
      jobSummary: {
        structuredData: {
          title: "Dusini Guidelines",
          summary: "Italian sauces brand book with red green white.",
          sections: [
            { heading: "Color", body: "Red green white for Dusini sauces." },
            { heading: "Type", body: "Clear sans for packaging." },
            { heading: "Voice", body: "Warm kitchen tone for Dusini." },
          ],
        },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pdfArtifactId).toBeTruthy();
    expect(result.value.docxArtifactId).toBeTruthy();
    expect(result.value.pptxArtifactId).toBeUndefined();
    expect(ingested.some((m) => m.includes("pdf"))).toBe(true);
    expect(
      ingested.some((m) => m.includes("wordprocessingml") || m.includes("docx"))
    ).toBe(true);
    expect(ingested.some((m) => m.includes("presentationml"))).toBe(false);
  });
});
