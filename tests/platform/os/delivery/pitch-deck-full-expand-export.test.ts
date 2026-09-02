/**
 * Pitch-deck create must expand concepts → full slide decks → PDF/PPTX.
 * Concepts-only is never a successful terminal state for pitch-decks.
 */

import {
  materializeDocumentExports,
  resolveDocumentExportKind,
  isRequiredDocumentOrPresentationExport,
} from "../../../../src/platform/api/services/document-export-materializer";
import { resolvePresentationExpandMode } from "../../../../src/platform/os/delivery/presentation-generation";
import * as documentExportService from "../../../../src/platform/os/delivery/document-export-service";
import {
  buildPresentationPdf,
  parsePresentationRoutes,
} from "../../../../src/platform/os/delivery/document-export-service";

const slide = {
  title: "Opportunity",
  bullets: ["Brand-led growth", "Clear ICP"],
  notes: "Speaker notes",
  layout: "content_bullets" as const,
  visualCue: "Brand palette wash",
};

function deckSlides() {
  return Array.from({ length: 6 }, (_, i) => ({
    ...slide,
    title: `Slide ${i + 1}`,
  }));
}

const fullRoutesPayload = {
  routes: [
    {
      title: "Heritage",
      description: "Warm story for DiVastra",
      deckTitle: "DiVastra Heritage",
      deckSubtitle: "Craft & Colour",
      slides: deckSlides(),
    },
    {
      title: "Modern",
      description: "Digital-first pitch",
      deckTitle: "DiVastra Modern",
      deckSubtitle: "Scale",
      slides: deckSlides(),
    },
    {
      title: "Bold",
      description: "High-contrast launch",
      deckTitle: "DiVastra Bold",
      deckSubtitle: "Launch",
      slides: deckSlides(),
    },
  ],
};

const conceptsOnlyPayload = {
  concepts: [
    { title: "Heritage", description: "Warm story", narrativeAngle: "Peach" },
    { title: "Modern", description: "Digital", narrativeAngle: "Clean" },
    { title: "Bold", description: "Launch", narrativeAngle: "High contrast" },
  ],
  presentationMeta: { lazyExpand: true, phase: "concepts", grounding: [] },
};

describe("pitch-deck create → full decks → PDF/PPTX", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("does not treat concepts-only as an exportable presentation", () => {
    expect(
      resolveDocumentExportKind({
        outputKind: "presentation",
        structuredName: "PresentationRouteConcepts",
        data: conceptsOnlyPayload,
      })
    ).toBeNull();
    expect(
      isRequiredDocumentOrPresentationExport({
        outputKind: "presentation",
        structuredName: "PresentationRouteConcepts",
      })
    ).toBe(true);
    expect(parsePresentationRoutes(conceptsOnlyPayload)).toBeNull();
  });

  it("resolves full routes for export and does not remap to DocumentPlan", () => {
    expect(
      resolveDocumentExportKind({
        outputKind: "presentation",
        structuredName: "PresentationRouteConcepts",
        data: fullRoutesPayload,
      })
    ).toBe("presentation");
    expect(
      resolveDocumentExportKind({
        outputKind: "document",
        structuredName: "DocumentPlan",
        data: fullRoutesPayload,
      })
    ).toBeNull();
    expect(parsePresentationRoutes(fullRoutesPayload)?.length).toBe(3);
  });

  it("forces full expand for pitch-deck create even when client stamps lazy", () => {
    expect(
      resolvePresentationExpandMode({
        service: "presentations",
        subtype: "pitch-decks",
        presentationExpandMode: "lazy",
        productAction: "direct_passthrough",
      })
    ).toBe("full");
  });

  it("parses full routes with slides ready for the presentation materializer", () => {
    const routes = parsePresentationRoutes(fullRoutesPayload);
    expect(routes).not.toBeNull();
    expect(routes!).toHaveLength(3);
    for (const route of routes!) {
      expect(route.deck.slides.length).toBeGreaterThanOrEqual(6);
      expect(route.deck.title.trim().length).toBeGreaterThan(0);
    }
  });

  it("builds a PDF buffer from a full deck", async () => {
    const routes = parsePresentationRoutes(fullRoutesPayload);
    expect(routes).not.toBeNull();
    const pdf = await buildPresentationPdf(routes![0]!.deck);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.byteLength).toBeGreaterThan(100);
  });

  it("materializes PDF+PPTX artifacts when full decks are present", async () => {
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

    jest
      .spyOn(documentExportService, "buildPresentationPptx")
      .mockResolvedValue(Buffer.from("PK-fake-pptx"));

    const singleDeck = {
      title: "DiVastra Heritage",
      subtitle: "Craft & Colour",
      slides: deckSlides(),
    };

    const ok = await materializeDocumentExports({
      asyncMedia: fakeAsyncMedia as never,
      executionId: "exec_pitch",
      organizationId: "org_1",
      exportKind: "presentation",
      runtimeOutput: { structured: singleDeck },
      jobSummary: { structuredData: singleDeck },
      createId: (p) => `${p}_1`,
      providerId: "provider.test",
      modelId: "test-model",
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.pdfArtifactId).toBeTruthy();
      expect(ok.value.pptxArtifactId).toBeTruthy();
      expect(ok.value.artifactIds.length).toBeGreaterThanOrEqual(2);
      expect(Array.isArray((ok.value.plan as { downloadFormats?: string[] })?.downloadFormats)).toBe(
        true
      );
      expect(
        (ok.value.plan as { downloadFormats?: string[] }).downloadFormats
      ).toEqual(expect.arrayContaining(["pdf", "pptx"]));
    }
    expect(ingested.some((m) => m.includes("pdf"))).toBe(true);
    expect(ingested.some((m) => m.includes("presentationml"))).toBe(true);

    expect(
      resolveDocumentExportKind({
        outputKind: "presentation",
        structuredName: "PresentationRouteConcepts",
        data: conceptsOnlyPayload,
      })
    ).toBeNull();
  });

  it("treats presentations service as required even without outputKind stamp", () => {
    expect(
      isRequiredDocumentOrPresentationExport({
        service: "presentations",
        subtype: "pitch-decks",
      })
    ).toBe(true);
    expect(
      isRequiredDocumentOrPresentationExport({
        service: "presentations",
        subtype: "gifs",
      })
    ).toBe(false);
  });

  it("recovers near-miss provider routes for export", () => {
    const { recoverPresentationRoutesPayload } = documentExportService;
    const nearMiss = {
      routes: [
        {
          title: "Heritage",
          description: "Warm story",
          slides: [
            {
              title: "Opening",
              bullets: ["Brand-led growth", "Clear ICP"],
            },
          ],
        },
      ],
    };
    const recovered = recoverPresentationRoutesPayload(nearMiss);
    expect(parsePresentationRoutes(recovered)).not.toBeNull();
    expect(
      resolveDocumentExportKind({
        outputKind: "presentation",
        structuredName: "PresentationRouteConcepts",
        data: recovered,
      })
    ).toBe("presentation");
  });
});
