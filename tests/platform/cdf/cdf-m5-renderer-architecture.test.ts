/**
 * CDF M5 — Renderer architecture tests.
 * Uses fixture renderer only — no PPTX/PDF implementation.
 */

import {
  applyCdfTransition,
  assertRenderedFileIdBoundaries,
  CDF_M5_LEGACY_EXPORT_AUDIT,
  CDF_RENDER_LIFECYCLE_POLICY,
  computeRenderKey,
  createArtifact,
  createMemoryVaultAssetResolver,
  createVersion,
  CdfRenderError,
  FIXTURE_IDS,
  FIXTURE_DECK_RENDERER_ID,
  FIXTURE_DECK_RENDERER_VERSION,
  fixturePresentationDeck,
  fixturePresentationDesignSystem,
  getArtifactVersion,
  getRenderedBlob,
  getRenderedFile,
  hashRenderOptions,
  hasRendererCapability,
  isCdfRenderedFileId,
  isMediaArtifactIdShape,
  isVaultAssetObjectIdShape,
  listRegisteredRenderers,
  listRenderedFilesForArtifact,
  markApproved,
  markValidated,
  PRESENTATION_ARTIFACT_KEYS,
  PRESENTATION_DECK_RENDER_CONTRACT,
  registerRenderer,
  renderArtifact,
  resetCdfArtifactEngineForTests,
  resetCdfRenderingForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  resolveRenderer,
  type ArtifactRenderer,
} from "../../../src/platform/cdf";

describe("CDF M5 Renderer Architecture", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
    resetCdfRenderingForTests({ registerFixtureRenderer: true });
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

  function makeDeck(sessionId: string, opts?: { title?: string; organizationId?: string; projectId?: string }) {
    const org = opts?.organizationId ?? "org_a";
    const proj = opts?.projectId ?? "proj_a";
    const ds = createArtifact({
      sessionId,
      serviceId: "presentation",
      phaseId: "select",
      organizationId: org,
      projectId: proj,
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
      projectId: proj,
      workspaceId: "ws_a",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
      artifactType: "deck",
      data: deck as never,
      provenance: {
        executionId: "exec_m5_deck",
        vaultAssetIds: [FIXTURE_IDS.vaultImage],
      },
    });
  }

  const vault = () =>
    createMemoryVaultAssetResolver({
      [FIXTURE_IDS.vaultImage]: "fixture-logo-bytes",
    });

  async function renderApproved(
    artifactId: string,
    version: number,
    extras?: Partial<Parameters<typeof renderArtifact>[0]>,
  ) {
    return renderArtifact(
      {
        artifactId,
        artifactVersion: version,
        artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
        format: "fixture",
        purpose: "final",
        organizationId: "org_a",
        projectId: "proj_a",
        workspaceId: "ws_a",
        ...extras,
      },
      { vaultAssetResolver: vault() },
    );
  }

  it("A — registry registration + capability lookup + unsupported format", () => {
    expect(listRegisteredRenderers().length).toBeGreaterThanOrEqual(1);
    expect(
      hasRendererCapability({
        artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
        format: "fixture",
        purpose: "final",
      }),
    ).toBe(true);
    // M5B registers pptx/pdf — still reject unknown formats
    expect(
      hasRendererCapability({
        artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
        format: "mp4",
        purpose: "final",
      }),
    ).toBe(false);
    expect(() =>
      resolveRenderer({
        artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
        format: "mp4",
        purpose: "final",
      }),
    ).toThrow(CdfRenderError);
    try {
      resolveRenderer({
        artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
        format: "svg",
        purpose: "final",
      });
    } catch (e) {
      expect(e).toBeInstanceOf(CdfRenderError);
      expect((e as CdfRenderError).renderCode).toBe("RENDER_FORMAT_UNSUPPORTED");
    }
  });

  it("B — exact artifact version; v5 latest is not used when rendering v4", async () => {
    const session = startSession();
    const { artifact } = makeDeck(session.sessionId, { title: "VERSION_ONE" });
    // Build versions 2..4 with distinct titles, then approve v4, then create v5 candidate
    let latest = 1;
    for (let v = 2; v <= 4; v++) {
      const prev = getArtifactVersion(artifact.artifactId, latest);
      const data = structuredClone(prev.data) as ReturnType<typeof fixturePresentationDeck>;
      data.metadata.title = `VERSION_${v}`;
      createVersion({
        artifactId: artifact.artifactId,
        expectedLatestVersion: latest,
        organizationId: "org_a",
        projectId: "proj_a",
        data: data as never,
      });
      latest = v;
    }
    markValidated(artifact.artifactId, 4, { organizationId: "org_a", projectId: "proj_a" });
    markApproved(artifact.artifactId, 4, { organizationId: "org_a", projectId: "proj_a" });

    const v4Data = structuredClone(getArtifactVersion(artifact.artifactId, 4).data) as ReturnType<
      typeof fixturePresentationDeck
    >;
    v4Data.metadata.title = "VERSION_5_SHOULD_NOT_RENDER";
    createVersion({
      artifactId: artifact.artifactId,
      expectedLatestVersion: 4,
      organizationId: "org_a",
      projectId: "proj_a",
      data: v4Data as never,
    });
    expect(getArtifactVersion(artifact.artifactId, 5).data.metadata).toMatchObject({
      title: "VERSION_5_SHOULD_NOT_RENDER",
    });

    const file = await renderApproved(artifact.artifactId, 4);
    expect(file.artifactVersion).toBe(4);
    const blob = getRenderedBlob(file.storageKey)!;
    const text = new TextDecoder().decode(blob.bytes);
    expect(text).toContain('"artifactVersion":4');
    expect(text).not.toContain("VERSION_5_SHOULD_NOT_RENDER");
    expect(text).toContain('"slideCount":3');
  });

  it("C — renderer independence: no generation; receives canonical data", async () => {
    const session = startSession();
    const { artifact } = makeDeck(session.sessionId);
    markValidated(artifact.artifactId, 1, { organizationId: "org_a", projectId: "proj_a" });
    markApproved(artifact.artifactId, 1, { organizationId: "org_a", projectId: "proj_a" });
    const file = await renderApproved(artifact.artifactId, 1);
    expect(file.rendererId).toBe(FIXTURE_DECK_RENDERER_ID);
    expect(file.rendererVersion).toBe(FIXTURE_DECK_RENDERER_VERSION);
    expect(file.artifactId).toBe(artifact.artifactId);
    // Contract: no AI / requirement / context in renderer contract
    expect(PRESENTATION_DECK_RENDER_CONTRACT.doesNotConsume).toEqual(
      expect.arrayContaining([
        "RequirementEngine",
        "ContextResolver",
        "ActiveBrief",
        "AI providers",
      ]),
    );
  });

  it("D — lifecycle: candidate blocked; validated preview ok; final needs approved", async () => {
    const session = startSession();
    const { artifact } = makeDeck(session.sessionId);

    await expect(
      renderArtifact(
        {
          artifactId: artifact.artifactId,
          artifactVersion: 1,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
          format: "fixture",
          purpose: "preview",
          organizationId: "org_a",
          projectId: "proj_a",
        },
        { vaultAssetResolver: vault() },
      ),
    ).rejects.toMatchObject({ renderCode: "ARTIFACT_LIFECYCLE_NOT_ALLOWED" });

    markValidated(artifact.artifactId, 1, { organizationId: "org_a", projectId: "proj_a" });
    const preview = await renderArtifact(
      {
        artifactId: artifact.artifactId,
        artifactVersion: 1,
        artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
        format: "fixture",
        purpose: "preview",
        organizationId: "org_a",
        projectId: "proj_a",
      },
      { vaultAssetResolver: vault() },
    );
    expect(preview.purpose).toBe("preview");

    await expect(
      renderApproved(artifact.artifactId, 1),
    ).rejects.toMatchObject({ renderCode: "ARTIFACT_LIFECYCLE_NOT_ALLOWED" });

    markApproved(artifact.artifactId, 1, { organizationId: "org_a", projectId: "proj_a" });
    const final = await renderApproved(artifact.artifactId, 1);
    expect(final.purpose).toBe("final");
    expect(CDF_RENDER_LIFECYCLE_POLICY.final.allowedStatuses).toContain("approved");
  });

  it("E — RenderedFile metadata + checksum + storage", async () => {
    const session = startSession();
    const { artifact } = makeDeck(session.sessionId);
    markValidated(artifact.artifactId, 1, { organizationId: "org_a", projectId: "proj_a" });
    markApproved(artifact.artifactId, 1, { organizationId: "org_a", projectId: "proj_a" });
    const file = await renderApproved(artifact.artifactId, 1);
    expect(isCdfRenderedFileId(file.fileId)).toBe(true);
    expect(() => assertRenderedFileIdBoundaries(file.fileId)).not.toThrow();
    expect(file.format).toBe("fixture");
    expect(file.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(file.storageKey).toContain(artifact.artifactId);
    expect(file.storageKey).toContain("/v1/");
    expect(getRenderedFile(file.fileId)?.checksum).toBe(file.checksum);
    const blob = getRenderedBlob(file.storageKey)!;
    expect(blob.checksum).toBe(file.checksum);
    expect(blob.bytes.byteLength).toBe(file.byteLength);
  });

  it("F — deterministic render identity / options hash", () => {
    const h1 = hashRenderOptions({ widthPx: 1280, includeNotes: true });
    const h2 = hashRenderOptions({ includeNotes: true, widthPx: 1280 });
    expect(h1).toBe(h2);
    const k1 = computeRenderKey({
      artifactId: "cdfart_x",
      artifactVersion: 4,
      format: "fixture",
      purpose: "final",
      rendererId: FIXTURE_DECK_RENDERER_ID,
      rendererVersion: FIXTURE_DECK_RENDERER_VERSION,
      optionsHash: h1,
    });
    const k2 = computeRenderKey({
      artifactId: "cdfart_x",
      artifactVersion: 4,
      format: "fixture",
      purpose: "final",
      rendererId: FIXTURE_DECK_RENDERER_ID,
      rendererVersion: FIXTURE_DECK_RENDERER_VERSION,
      optionsHash: h2,
    });
    expect(k1).toBe(k2);
    expect(k1.startsWith("rnd:")).toBe(true);
  });

  it("G — idempotency: same request twice → same fileId, no duplicate records", async () => {
    const session = startSession();
    const { artifact } = makeDeck(session.sessionId);
    markValidated(artifact.artifactId, 1, { organizationId: "org_a", projectId: "proj_a" });
    markApproved(artifact.artifactId, 1, { organizationId: "org_a", projectId: "proj_a" });
    const a = await renderApproved(artifact.artifactId, 1, { requestId: "req_1" });
    const b = await renderApproved(artifact.artifactId, 1, { requestId: "req_2" });
    expect(b.fileId).toBe(a.fileId);
    expect(b.renderKey).toBe(a.renderKey);
    expect(listRenderedFilesForArtifact(artifact.artifactId, 1)).toHaveLength(1);
  });

  it("H — failure handling: missing artifact/version/format/assets/options", async () => {
    const session = startSession();
    const { artifact } = makeDeck(session.sessionId);
    markApproved(artifact.artifactId, 1, { organizationId: "org_a", projectId: "proj_a" });

    await expect(
      renderApproved("cdfart_missing_zzzz", 1),
    ).rejects.toMatchObject({ renderCode: "ARTIFACT_NOT_FOUND" });

    await expect(
      renderApproved(artifact.artifactId, 99),
    ).rejects.toMatchObject({ renderCode: "ARTIFACT_VERSION_NOT_FOUND" });

    await expect(
      renderArtifact(
        {
          artifactId: artifact.artifactId,
          artifactVersion: 1,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
          format: "mp4",
          purpose: "final",
          organizationId: "org_a",
          projectId: "proj_a",
        },
        { vaultAssetResolver: vault() },
      ),
    ).rejects.toMatchObject({ renderCode: "RENDER_FORMAT_UNSUPPORTED" });

    await expect(
      renderArtifact(
        {
          artifactId: artifact.artifactId,
          artifactVersion: 1,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
          format: "fixture",
          purpose: "final",
          organizationId: "org_a",
          projectId: "proj_a",
          options: { imageQuality: 999 },
        },
        { vaultAssetResolver: vault() },
      ),
    ).rejects.toMatchObject({ renderCode: "INVALID_RENDER_OPTIONS" });

    await expect(
      renderArtifact(
        {
          artifactId: artifact.artifactId,
          artifactVersion: 1,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
          format: "fixture",
          purpose: "final",
          organizationId: "org_a",
          projectId: "proj_a",
        },
        { vaultAssetResolver: createMemoryVaultAssetResolver({}), requireVaultAssets: true },
      ),
    ).rejects.toMatchObject({ renderCode: "ASSET_NOT_FOUND" });
  });

  it("I — immutability: render does not mutate artifact data or create new version", async () => {
    const session = startSession();
    const { artifact } = makeDeck(session.sessionId);
    markValidated(artifact.artifactId, 1, { organizationId: "org_a", projectId: "proj_a" });
    markApproved(artifact.artifactId, 1, { organizationId: "org_a", projectId: "proj_a" });
    const before = structuredClone(getArtifactVersion(artifact.artifactId, 1));
    await renderApproved(artifact.artifactId, 1);
    const after = getArtifactVersion(artifact.artifactId, 1);
    expect(after.data).toEqual(before.data);
    expect(after.version).toBe(1);
    expect(after.status).toBe(before.status);
    expect(listRenderedFilesForArtifact(artifact.artifactId)).toHaveLength(1);
  });

  it("J — asset separation: fileId ≠ artifactId ≠ vault ≠ execution ≠ art_*", async () => {
    const session = startSession();
    const { artifact } = makeDeck(session.sessionId);
    markValidated(artifact.artifactId, 1, { organizationId: "org_a", projectId: "proj_a" });
    markApproved(artifact.artifactId, 1, { organizationId: "org_a", projectId: "proj_a" });
    const file = await renderApproved(artifact.artifactId, 1);
    expect(file.fileId).not.toBe(artifact.artifactId);
    expect(isVaultAssetObjectIdShape(file.fileId)).toBe(false);
    expect(isMediaArtifactIdShape(file.fileId)).toBe(false);
    expect(file.fileId.startsWith("exec_")).toBe(false);
    expect(FIXTURE_IDS.vaultImage).not.toBe(file.fileId);
    expect(FIXTURE_IDS.vaultImage).not.toBe(artifact.artifactId);
  });

  it("K — multi-tenant isolation", async () => {
    const session = startSession();
    const { artifact } = makeDeck(session.sessionId);
    markValidated(artifact.artifactId, 1, { organizationId: "org_a", projectId: "proj_a" });
    markApproved(artifact.artifactId, 1, { organizationId: "org_a", projectId: "proj_a" });

    await expect(
      renderArtifact(
        {
          artifactId: artifact.artifactId,
          artifactVersion: 1,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
          format: "fixture",
          purpose: "final",
          organizationId: "org_OTHER",
          projectId: "proj_a",
        },
        { vaultAssetResolver: vault() },
      ),
    ).rejects.toMatchObject({ renderCode: "ARTIFACT_OWNERSHIP_INVALID" });
  });

  it("L — render request/options serializable + deterministic", () => {
    const opts = {
      widthPx: 1920,
      heightPx: 1080,
      extras: { z: true, a: 1 },
    };
    expect(JSON.parse(JSON.stringify(opts))).toEqual(opts);
    expect(hashRenderOptions(opts)).toBe(hashRenderOptions({ ...opts }));
  });

  it("M — missing artifactVersion rejected (no silent latest)", async () => {
    const session = startSession();
    const { artifact } = makeDeck(session.sessionId);
    markApproved(artifact.artifactId, 1, { organizationId: "org_a", projectId: "proj_a" });
    await expect(
      renderArtifact(
        {
          artifactId: artifact.artifactId,
          // @ts-expect-error intentional — callers must pass version
          artifactVersion: undefined,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
          format: "fixture",
          purpose: "final",
          organizationId: "org_a",
          projectId: "proj_a",
        },
        { vaultAssetResolver: vault() },
      ),
    ).rejects.toMatchObject({ renderCode: "RENDER_REQUEST_INVALID" });
  });

  it("N — renderer failure surfaces RENDER_FAILED; no silent fallback", async () => {
    const boom: ArtifactRenderer = {
      capability: {
        rendererId: "boom-renderer",
        rendererVersion: "1.0.0",
        artifactKeys: [PRESENTATION_ARTIFACT_KEYS.deck],
        formats: ["fixture"],
        purposes: ["final"],
      },
      canRender: () => true,
      async render() {
        throw new Error("intentional boom");
      },
    };
    resetCdfRenderingForTests({ registerFixtureRenderer: false });
    registerRenderer(boom);
    const session = startSession();
    const { artifact } = makeDeck(session.sessionId);
    markApproved(artifact.artifactId, 1, { organizationId: "org_a", projectId: "proj_a" });
    await expect(renderApproved(artifact.artifactId, 1)).rejects.toMatchObject({
      renderCode: "RENDER_FAILED",
    });
  });

  it("O — legacy export audit is classified", () => {
    expect(CDF_M5_LEGACY_EXPORT_AUDIT.length).toBeGreaterThan(5);
    expect(
      CDF_M5_LEGACY_EXPORT_AUDIT.some((e) => e.classification === "C_generation_on_export"),
    ).toBe(true);
    expect(PRESENTATION_DECK_RENDER_CONTRACT.implementationStatus.pptx).toBe(
      "implemented_m5b",
    );
  });
});
