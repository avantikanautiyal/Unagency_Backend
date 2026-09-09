import {
  buildExecutionResultPayload,
  mergeExportArtifactsIntoResult,
} from "../../../src/platform/api/services/execution-result-payload";

describe("mergeExportArtifactsIntoResult", () => {
  it("keeps presentation routes when export artifacts are attached", () => {
    const plan = {
      routes: [
        {
          title: "Route A",
          description: "Angle one",
          deckTitle: "Deck A",
          deckSubtitle: "Sub",
          slides: [{ title: "Intro", bullets: ["a", "b"], notes: "", layout: "title_hero", visualCue: "brand red" }],
          pdfArtifactId: "art_pdf_1",
          pptxArtifactId: "art_pptx_1",
        },
      ],
      exportKind: "presentation",
    };
    const merged = mergeExportArtifactsIntoResult({
      status: "succeeded",
      result: buildExecutionResultPayload({
        status: "succeeded",
        jobSummary: { structuredData: plan, documentExportKind: "presentation" },
      }),
      jobSummary: { structuredData: plan, documentExportKind: "presentation" },
      mediaArtifactIds: ["art_pdf_1", "art_pptx_1"],
    });
    expect(merged.kind).toBe("structured");
    const data = merged.data as Record<string, unknown>;
    expect(Array.isArray(data.routes)).toBe(true);
    expect(data.exportKind).toBe("presentation");
    expect(data.artifactIds).toEqual(["art_pdf_1", "art_pptx_1"]);
  });

  it("falls back to artifact-only when no structured plan exists", () => {
    const merged = mergeExportArtifactsIntoResult({
      status: "succeeded",
      result: { kind: "empty" },
      jobSummary: {},
      mediaArtifactIds: ["art_1"],
    });
    expect(merged.kind).toBe("artifact");
    expect(merged.data).toEqual({ artifactIds: ["art_1"] });
  });

  it("stamps website preview artifact ids from webexport pairs", () => {
    const merged = mergeExportArtifactsIntoResult({
      status: "succeeded",
      result: { kind: "empty" },
      jobSummary: { success: true },
      mediaArtifactIds: [
        "art_webexport0_1_0",
        "art_webexport0_1_1",
        "art_webexport2_1_2",
        "art_webexport2_1_3",
      ],
    });
    expect(merged.kind).toBe("structured");
    const data = merged.data as Record<string, unknown>;
    expect(data.exportKind).toBe("website");
    expect(data.projectArtifactId).toBe("art_webexport0_1_0");
    expect(data.htmlArtifactId).toBe("art_webexport0_1_1");
    expect(Array.isArray(data.routes)).toBe(true);
    expect((data.routes as { projectArtifactId: string }[])[1]?.projectArtifactId).toBe(
      "art_webexport2_1_2",
    );
  });
});
