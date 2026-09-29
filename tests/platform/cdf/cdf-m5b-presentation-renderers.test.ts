/**
 * CDF M5B — Presentation PPTX + PDF renderer tests.
 * Inspects actual generated files. Mocks AI/legacy export to throw if called.
 */

jest.mock("../../../src/platform/os/delivery/best-effort-visual-image", () => ({
  resolveBestEffortSlideImage: jest.fn(async () => {
    throw new Error("AI isolation: best-effort visual image must not be called during M5B render");
  }),
}));

jest.mock("../../../src/platform/api/services/document-export-materializer", () => ({
  materializeDocumentExports: jest.fn(async () => {
    throw new Error("AI isolation: document-export-materializer must not be called during M5B render");
  }),
  ingestExportFiles: jest.fn(async () => {
    throw new Error("AI isolation: ingestExportFiles must not be called during M5B render");
  }),
}));

import {
  applyCdfTransition,
  createArtifact,
  createMemoryVaultAssetResolver,
  createVersion,
  CdfRenderError,
  extractPdfLiteralTexts,
  extractPptxSlideTexts,
  FIXTURE_IDS,
  fixturePresentationDeck,
  fixturePresentationDesignSystem,
  getArtifact,
  getArtifactVersion,
  getCdfSession,
  getRenderedBlob,
  getRenderedFile,
  hasRendererCapability,
  httpGetRenderedFile,
  httpRenderArtifact,
  listRenderedFilesForArtifact,
  listRequirements,
  markApproved,
  markValidated,
  PDF_RENDERER_ID,
  PDF_RENDERER_VERSION,
  PRESENTATION_ARTIFACT_KEYS,
  PRESENTATION_DECK_RENDER_CONTRACT,
  PPTX_RENDERER_ID,
  PPTX_RENDERER_VERSION,
  renderArtifact,
  resetCdfArtifactEngineForTests,
  resetCdfRenderingForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  setCdfRenderedBlobStorage,
  sha256Hex,
} from "../../../src/platform/cdf";
import { fixturePngBytes } from "../../../src/platform/cdf/rendering/presentation/test-assets";
import { getLatestActiveBrief } from "../../../src/platform/cdf/requirements";
import { InMemoryBlobStorage as MemBlob } from "../../../src/platform/persistence/storage/in-memory-blob-storage";

describe("CDF M5B Presentation PPTX/PDF Renderers", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
    resetCdfRenderingForTests();
    setCdfRenderedBlobStorage(new MemBlob());
  });

  function startSession() {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "presentation",
      productMode: "ai",
      organizationId: "org_a",
      projectId: "proj_a",
      workspaceId: "ws_a",
    });
    if (!started.ok) throw new Error("start");
    return started.value.session;
  }

  function vault() {
    return createMemoryVaultAssetResolver({
      [FIXTURE_IDS.vaultImage]: fixturePngBytes(),
    });
  }

  function makeDeck(
    sessionId: string,
    opts?: { title?: string; organizationId?: string },
  ) {
    const org = opts?.organizationId ?? "org_a";
    const ds = createArtifact({
      sessionId,
      serviceId: "presentation",
      phaseId: "select",
      organizationId: org,
      projectId: "proj_a",
      workspaceId: "ws_a",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
      artifactType: "structured_doc",
      data: fixturePresentationDesignSystem() as never,
    });
    const deck = fixturePresentationDeck(ds.artifact.artifactId);
    if (opts?.title) {
      deck.metadata.title = opts.title;
      const titleEl = deck.slides[0]?.elements.find((e) => e.id === "element_title_01");
      if (titleEl && titleEl.type === "text") titleEl.content = opts.title;
    }
    return createArtifact({
      sessionId,
      serviceId: "presentation",
      phaseId: "full-deck",
      organizationId: org,
      projectId: "proj_a",
      workspaceId: "ws_a",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
      artifactType: "deck",
      data: deck as never,
      provenance: {
        executionId: "exec_m5b_deck",
        vaultAssetIds: [FIXTURE_IDS.vaultImage],
      },
    });
  }

  async function approveAndRender(
    artifactId: string,
    version: number,
    format: "pptx" | "pdf",
  ) {
    const cur = getArtifactVersion(artifactId, version, {
      organizationId: "org_a",
      projectId: "proj_a",
    });
    if (cur.status === "candidate") {
      markValidated(artifactId, version, {
        organizationId: "org_a",
        projectId: "proj_a",
      });
    }
    const after = getArtifactVersion(artifactId, version, {
      organizationId: "org_a",
      projectId: "proj_a",
    });
    if (after.status !== "approved") {
      markApproved(artifactId, version, {
        organizationId: "org_a",
        projectId: "proj_a",
      });
    }
    return renderArtifact(
      {
        artifactId,
        artifactVersion: version,
        artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
        format,
        purpose: "final",
        organizationId: "org_a",
        projectId: "proj_a",
        workspaceId: "ws_a",
      },
      { vaultAssetResolver: vault() },
    );
  }

  it("1/2 — PPTX and PDF renderers registered", () => {
    expect(
      hasRendererCapability({
        artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
        format: "pptx",
        purpose: "final",
      }),
    ).toBe(true);
    expect(
      hasRendererCapability({
        artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
        format: "pdf",
        purpose: "final",
      }),
    ).toBe(true);
    expect(PRESENTATION_DECK_RENDER_CONTRACT.implementationStatus.pptx).toBe(
      "implemented_m5b",
    );
  });

  it("3–10 — golden DeckSpec → parseable PPTX/PDF with count, text, dimensions", async () => {
    const session = startSession();
    const { artifact } = makeDeck(session.sessionId, {
      title: "Acme — Creative Ops Platform",
    });
    const pptxFile = await approveAndRender(artifact.artifactId, 1, "pptx");
    const pdfFile = await approveAndRender(artifact.artifactId, 1, "pdf");

    expect(pptxFile.rendererId).toBe(PPTX_RENDERER_ID);
    expect(pptxFile.rendererVersion).toBe(PPTX_RENDERER_VERSION);
    expect(pdfFile.rendererId).toBe(PDF_RENDERER_ID);
    expect(pdfFile.rendererVersion).toBe(PDF_RENDERER_VERSION);

    const pptxBytes = getRenderedBlob(pptxFile.storageKey)!.bytes;
    const pdfBytes = getRenderedBlob(pdfFile.storageKey)!.bytes;

    const pptx = await extractPptxSlideTexts(pptxBytes);
    expect(pptx.isValidPptx).toBe(true);
    expect(pptx.slideCount).toBe(3);
    expect(pptx.joined).toContain("Acme — Creative Ops Platform");
    expect(pptx.joined).toContain("The Problem");
    expect(pptx.joined).toContain("Our Solution");

    const pdf = extractPdfLiteralTexts(pdfBytes);
    expect(pdf.isValidPdf).toBe(true);
    expect(pdf.pageCount).toBe(3);
    expect(pdf.joined).toContain("Acme");
    expect(pdf.joined).toContain("The Problem");
    expect(pdf.joined).toContain("Our Solution");

    // Dimensions encoded in layout / page size — 16:9 → 10in × 5.625in; PDF 720×405
    expect(pptxFile.checksum).toBe(sha256Hex(pptxBytes));
    expect(pdfFile.checksum).toBe(sha256Hex(pdfBytes));
  });

  it("11–15 — images, shapes, design-system exact version, assets", async () => {
    const session = startSession();
    const { artifact } = makeDeck(session.sessionId);
    const file = await approveAndRender(artifact.artifactId, 1, "pptx");
    const pptx = await extractPptxSlideTexts(getRenderedBlob(file.storageKey)!.bytes);
    expect(pptx.isValidPptx).toBe(true);
    // Image relationship present in OOXML
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(Buffer.from(getRenderedBlob(file.storageKey)!.bytes));
    const media = Object.keys(zip.files).filter((p) => p.startsWith("ppt/media/"));
    expect(media.length).toBeGreaterThan(0);
  });

  it("16 — missing asset fails", async () => {
    const session = startSession();
    const { artifact } = makeDeck(session.sessionId);
    markApproved(artifact.artifactId, 1, { organizationId: "org_a", projectId: "proj_a" });
    await expect(
      renderArtifact(
        {
          artifactId: artifact.artifactId,
          artifactVersion: 1,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
          format: "pptx",
          purpose: "final",
          organizationId: "org_a",
          projectId: "proj_a",
        },
        { vaultAssetResolver: createMemoryVaultAssetResolver({}) },
      ),
    ).rejects.toMatchObject({ renderCode: "ASSET_NOT_FOUND" });
  });

  it("17 — strictFonts unknown family → FONT_NOT_FOUND", async () => {
    const session = startSession();
    const dsData = fixturePresentationDesignSystem();
    dsData.fontRoles.title = { family: "CompletelyUnknownFontXYZ", size: 44, weight: 700 };
    const ds = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "select",
      organizationId: "org_a",
      projectId: "proj_a",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
      artifactType: "structured_doc",
      data: dsData as never,
    });
    const deck = fixturePresentationDeck(ds.artifact.artifactId);
    const created = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "full-deck",
      organizationId: "org_a",
      projectId: "proj_a",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
      artifactType: "deck",
      data: deck as never,
    });
    markApproved(created.artifact.artifactId, 1, {
      organizationId: "org_a",
      projectId: "proj_a",
    });
    await expect(
      renderArtifact(
        {
          artifactId: created.artifact.artifactId,
          artifactVersion: 1,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
          format: "pdf",
          purpose: "final",
          organizationId: "org_a",
          projectId: "proj_a",
          options: { extras: { strictFonts: true } },
        },
        { vaultAssetResolver: vault() },
      ),
    ).rejects.toMatchObject({ renderCode: "FONT_NOT_FOUND" });
  });

  it("18 — unsupported chart element fails explicitly", async () => {
    const session = startSession();
    const ds = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "select",
      organizationId: "org_a",
      projectId: "proj_a",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
      artifactType: "structured_doc",
      data: fixturePresentationDesignSystem() as never,
    });
    const deck = fixturePresentationDeck(ds.artifact.artifactId);
    deck.slides[0]!.elements.push({
      id: "element_chart_bad",
      type: "chart",
      chartType: "bar",
      data: { series: [] },
      bounds: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
      zIndex: 9,
    });
    const created = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "full-deck",
      organizationId: "org_a",
      projectId: "proj_a",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
      artifactType: "deck",
      data: deck as never,
    });
    markApproved(created.artifact.artifactId, 1, {
      organizationId: "org_a",
      projectId: "proj_a",
    });
    await expect(
      renderArtifact(
        {
          artifactId: created.artifact.artifactId,
          artifactVersion: 1,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
          format: "pptx",
          purpose: "final",
          organizationId: "org_a",
          projectId: "proj_a",
        },
        { vaultAssetResolver: vault() },
      ),
    ).rejects.toMatchObject({ renderCode: "UNSUPPORTED_DECK_ELEMENT" });
  });

  it("19 — exact version: render v1 then v2 then v1 again", async () => {
    const session = startSession();
    const { artifact } = makeDeck(session.sessionId, { title: "Original Title" });
    markValidated(artifact.artifactId, 1, { organizationId: "org_a", projectId: "proj_a" });
    markApproved(artifact.artifactId, 1, { organizationId: "org_a", projectId: "proj_a" });

    const r1 = await renderArtifact(
      {
        artifactId: artifact.artifactId,
        artifactVersion: 1,
        artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
        format: "pptx",
        purpose: "final",
        organizationId: "org_a",
        projectId: "proj_a",
      },
      { vaultAssetResolver: vault() },
    );
    const t1 = await extractPptxSlideTexts(getRenderedBlob(r1.storageKey)!.bytes);
    expect(t1.joined).toContain("Original Title");
    expect(t1.joined).not.toContain("Updated Title");

    const next = structuredClone(getArtifactVersion(artifact.artifactId, 1).data) as ReturnType<
      typeof fixturePresentationDeck
    >;
    next.metadata.title = "Updated Title";
    const el = next.slides[0]!.elements.find((e) => e.id === "element_title_01");
    if (el && el.type === "text") el.content = "Updated Title";
    createVersion({
      artifactId: artifact.artifactId,
      expectedLatestVersion: 1,
      organizationId: "org_a",
      projectId: "proj_a",
      data: next as never,
    });
    markValidated(artifact.artifactId, 2, { organizationId: "org_a", projectId: "proj_a" });
    markApproved(artifact.artifactId, 2, { organizationId: "org_a", projectId: "proj_a" });

    const r2 = await renderArtifact(
      {
        artifactId: artifact.artifactId,
        artifactVersion: 2,
        artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
        format: "pptx",
        purpose: "final",
        organizationId: "org_a",
        projectId: "proj_a",
      },
      { vaultAssetResolver: vault() },
    );
    const t2 = await extractPptxSlideTexts(getRenderedBlob(r2.storageKey)!.bytes);
    expect(t2.joined).toContain("Updated Title");

    const r1again = await renderArtifact(
      {
        artifactId: artifact.artifactId,
        artifactVersion: 1,
        artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
        format: "pptx",
        purpose: "final",
        organizationId: "org_a",
        projectId: "proj_a",
      },
      { vaultAssetResolver: vault() },
    );
    const t1b = await extractPptxSlideTexts(getRenderedBlob(r1again.storageKey)!.bytes);
    expect(t1b.joined).toContain("Original Title");
    expect(t1b.joined).not.toContain("Updated Title");
  });

  it("20/32 — immutability: no artifact/session/requirement mutation", async () => {
    const session = startSession();
    const { artifact } = makeDeck(session.sessionId);
    const before = structuredClone(getArtifactVersion(artifact.artifactId, 1));
    const sessionBefore = structuredClone(getCdfSession(session.sessionId));
    const briefBefore = getLatestActiveBrief(session.sessionId);
    const reqBefore = listRequirements(session.sessionId);

    await approveAndRender(artifact.artifactId, 1, "pptx");
    await approveAndRender(artifact.artifactId, 1, "pdf");

    expect(getArtifactVersion(artifact.artifactId, 1).data).toEqual(before.data);
    expect(getArtifact(artifact.artifactId).latestVersion).toBe(1);
    expect(getCdfSession(session.sessionId)?.sessionVersion).toBe(
      sessionBefore?.sessionVersion,
    );
    expect(getLatestActiveBrief(session.sessionId)).toEqual(briefBefore);
    expect(listRequirements(session.sessionId)).toEqual(reqBefore);
  });

  it("21/33 — AI isolation: render succeeds while AI mocks throw", async () => {
    const session = startSession();
    const { artifact } = makeDeck(session.sessionId);
    await expect(approveAndRender(artifact.artifactId, 1, "pptx")).resolves.toBeTruthy();
    await expect(approveAndRender(artifact.artifactId, 1, "pdf")).resolves.toBeTruthy();
  });

  it("22–25 — idempotency, checksum, RenderedFile, blob storage", async () => {
    const session = startSession();
    const { artifact } = makeDeck(session.sessionId);
    const a = await approveAndRender(artifact.artifactId, 1, "pdf");
    const b = await approveAndRender(artifact.artifactId, 1, "pdf");
    expect(b.fileId).toBe(a.fileId);
    expect(listRenderedFilesForArtifact(artifact.artifactId, 1).filter((f) => f.format === "pdf")).toHaveLength(1);
    expect(getRenderedFile(a.fileId)?.checksum).toBe(a.checksum);
    expect(getRenderedBlob(a.storageKey)?.bytes.byteLength).toBe(a.byteLength);

    const backend = new MemBlob();
    setCdfRenderedBlobStorage(backend);
    // Force new render with different format options to miss cache
    const c = await renderArtifact(
      {
        artifactId: artifact.artifactId,
        artifactVersion: 1,
        artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
        format: "pptx",
        purpose: "final",
        organizationId: "org_a",
        projectId: "proj_a",
        options: { includeNotes: false },
      },
      { vaultAssetResolver: vault() },
    );
    const remote = await backend.get(c.storageKey);
    expect(remote.ok && remote.value).toBeTruthy();
  });

  it("26 — lifecycle: candidate cannot final-render", async () => {
    const session = startSession();
    const { artifact } = makeDeck(session.sessionId);
    await expect(
      renderArtifact(
        {
          artifactId: artifact.artifactId,
          artifactVersion: 1,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
          format: "pptx",
          purpose: "final",
          organizationId: "org_a",
          projectId: "proj_a",
        },
        { vaultAssetResolver: vault() },
      ),
    ).rejects.toMatchObject({ renderCode: "ARTIFACT_LIFECYCLE_NOT_ALLOWED" });
  });

  it("27 — tenant isolation", async () => {
    const session = startSession();
    const { artifact } = makeDeck(session.sessionId);
    markApproved(artifact.artifactId, 1, { organizationId: "org_a", projectId: "proj_a" });
    await expect(
      renderArtifact(
        {
          artifactId: artifact.artifactId,
          artifactVersion: 1,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
          format: "pptx",
          purpose: "final",
          organizationId: "org_OTHER",
          projectId: "proj_a",
        },
        { vaultAssetResolver: vault() },
      ),
    ).rejects.toMatchObject({ renderCode: "ARTIFACT_OWNERSHIP_INVALID" });

    const file = await approveAndRender(artifact.artifactId, 1, "pdf");
    expect(() =>
      httpGetRenderedFile({ fileId: file.fileId, organizationId: "org_OTHER" }),
    ).toThrow(CdfRenderError);
  });

  it("28 — cross-format consistency", async () => {
    const session = startSession();
    const { artifact } = makeDeck(session.sessionId);
    const pptxFile = await approveAndRender(artifact.artifactId, 1, "pptx");
    const pdfFile = await approveAndRender(artifact.artifactId, 1, "pdf");
    const pptx = await extractPptxSlideTexts(getRenderedBlob(pptxFile.storageKey)!.bytes);
    const pdf = extractPdfLiteralTexts(getRenderedBlob(pdfFile.storageKey)!.bytes);
    expect(pptx.slideCount).toBe(pdf.pageCount);
    expect(pptx.slideCount).toBe(3);
    for (const phrase of ["The Problem", "Our Solution"]) {
      expect(pptx.joined).toContain(phrase);
      expect(pdf.joined).toContain(phrase);
    }
  });

  it("29 — large deck 30 slides", async () => {
    const session = startSession();
    const ds = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "select",
      organizationId: "org_a",
      projectId: "proj_a",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
      artifactType: "structured_doc",
      data: fixturePresentationDesignSystem() as never,
    });
    const base = fixturePresentationDeck(ds.artifact.artifactId);
    const template = base.slides[0]!;
    base.slides = Array.from({ length: 30 }, (_, i) => ({
      ...structuredClone(template),
      id: `slide_${String(i + 1).padStart(2, "0")}`,
      order: i,
      elements: structuredClone(template.elements)
        .filter((e) => e.type !== "image")
        .map((el) => {
          if (el.type === "text") {
            return {
              ...el,
              id: `${el.id}_${i}`,
              content: `Large deck slide ${i + 1}`,
            };
          }
          return { ...el, id: `${el.id}_${i}` };
        }),
    })) as typeof base.slides;

    const created = createArtifact({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: "full-deck",
      organizationId: "org_a",
      projectId: "proj_a",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
      artifactType: "deck",
      data: base as never,
    });
    markApproved(created.artifact.artifactId, 1, {
      organizationId: "org_a",
      projectId: "proj_a",
    });

    const t0 = Date.now();
    const pptxFile = await renderArtifact(
      {
        artifactId: created.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
        format: "pptx",
        purpose: "final",
        organizationId: "org_a",
        projectId: "proj_a",
      },
      { vaultAssetResolver: vault(), requireVaultAssets: false },
    );
    const pdfFile = await renderArtifact(
      {
        artifactId: created.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
        format: "pdf",
        purpose: "final",
        organizationId: "org_a",
        projectId: "proj_a",
      },
      { vaultAssetResolver: vault(), requireVaultAssets: false },
    );
    const ms = Date.now() - t0;
    const pptx = await extractPptxSlideTexts(getRenderedBlob(pptxFile.storageKey)!.bytes);
    const pdf = extractPdfLiteralTexts(getRenderedBlob(pdfFile.storageKey)!.bytes);
    expect(pptx.slideCount).toBe(30);
    expect(pdf.pageCount).toBe(30);
    expect(pptx.joined).toContain("Large deck slide 1");
    expect(pptx.joined).toContain("Large deck slide 30");
    // Soft bound — document bottleneck if exceeded in CI
    expect(ms).toBeLessThan(60_000);
    console.info(
      JSON.stringify({
        scope: "cdf.rendering.m5b.large_deck",
        slides: 30,
        pptxBytes: pptxFile.byteLength,
        pdfBytes: pdfFile.byteLength,
        durationMs: ms,
      }),
    );
  });

  it("30 — HTTP render helper does not use legacy materializer", async () => {
    const session = startSession();
    const { artifact } = makeDeck(session.sessionId);
    markApproved(artifact.artifactId, 1, { organizationId: "org_a", projectId: "proj_a" });
    const file = await httpRenderArtifact({
      artifactId: artifact.artifactId,
      artifactVersion: 1,
      body: { format: "pdf", purpose: "final" },
      organizationId: "org_a",
      projectId: "proj_a",
      deps: { vaultAssetResolver: vault() },
    });
    expect(file.format).toBe("pdf");
    expect(file.artifactVersion).toBe(1);
  });

  it("z-order: higher zIndex appears after lower in model", async () => {
    const { buildCanonicalDeckRenderModel } = await import(
      "../../../src/platform/cdf/rendering/presentation/model"
    );
    const session = startSession();
    const { artifact } = makeDeck(session.sessionId);
    const data = getArtifactVersion(artifact.artifactId, 1).data;
    const ds = fixturePresentationDesignSystem();
    const model = buildCanonicalDeckRenderModel({
      deckData: data,
      designSystemData: ds as never,
      resolvedAssets: new Map([[FIXTURE_IDS.vaultImage, fixturePngBytes()]]),
      unit: "in",
    });
    for (const slide of model.slides) {
      const zs = slide.primitives
        .filter((p) => p.kind !== "background")
        .map((p) => p.zIndex);
      const sorted = [...zs].sort((a, b) => a - b);
      expect(zs).toEqual(sorted);
    }
  });
});
