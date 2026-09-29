/**
 * CDF M3B — Presentation artifact schema tests.
 */

import {
  createArtifact,
  createVersion,
  getArtifactVersion,
  getLatestArtifactVersion,
  listRegisteredArtifactSchemas,
  markApproved,
  PRESENTATION_ARTIFACT_KEYS,
  PRESENTATION_ARTIFACT_TYPE_BY_KEY,
  PRESENTATION_SCHEMA_VERSION,
  presentationSchemaId,
  fixturePresentationSource,
  fixturePresentationStoryline,
  fixturePresentationSlideContent,
  fixturePresentationDesignRoute,
  fixturePresentationDesignSystem,
  fixturePresentationDeck,
  FIXTURE_IDS,
  validatePresentationSourceData,
  validatePresentationStorylineData,
  validatePresentationSlideContentData,
  validatePresentationDesignRouteData,
  validatePresentationDesignSystemData,
  validatePresentationDeckData,
  validateArtifactData,
  resetCdfArtifactEngineForTests,
  isVaultAssetObjectIdShape,
  isExecutionIdShape,
  DECK_COORDINATE_SYSTEM,
} from "../../../src/platform/cdf";

describe("CDF M3B Presentation Artifact Schemas", () => {
  beforeEach(() => {
    resetCdfArtifactEngineForTests();
  });

  const KEYS = Object.values(PRESENTATION_ARTIFACT_KEYS);

  it("A — all six presentation schemas registered with schema versions", () => {
    const registered = listRegisteredArtifactSchemas();
    for (const key of KEYS) {
      const hit = registered.find(
        (s) =>
          s.artifactKey === key &&
          s.schemaVersion === PRESENTATION_SCHEMA_VERSION,
      );
      expect(hit).toBeDefined();
      expect(hit!.schemaId).toBe(presentationSchemaId(key));
      expect(hit!.artifactType).toBe(PRESENTATION_ARTIFACT_TYPE_BY_KEY[key]);
    }
  });

  it("B — valid fixtures for all six types", () => {
    expect(validatePresentationSourceData(fixturePresentationSource() as never).ok).toBe(true);
    expect(validatePresentationStorylineData(fixturePresentationStoryline() as never).ok).toBe(true);
    expect(validatePresentationSlideContentData(fixturePresentationSlideContent() as never).ok).toBe(true);
    expect(validatePresentationDesignRouteData(fixturePresentationDesignRoute() as never).ok).toBe(true);
    expect(validatePresentationDesignSystemData(fixturePresentationDesignSystem() as never).ok).toBe(true);
    expect(validatePresentationDeckData(fixturePresentationDeck() as never).ok).toBe(true);
  });

  it("C — invalid: missing fields, ids, enums, refs, bounds, schema version", () => {
    expect(
      validatePresentationStorylineData({
        schemaId: presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.storyline),
        sections: [],
        slides: [],
      } as never).ok,
    ).toBe(false);

    expect(
      validatePresentationSlideContentData({
        schemaId: presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.slideContent),
        slides: [
          {
            id: "!!!",
            order: 0,
            title: "X",
            blocks: [],
          },
        ],
      } as never).ok,
    ).toBe(false);

    expect(
      validatePresentationDesignRouteData({
        schemaId: presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.designRoute),
        routeId: "route_1",
        name: "A",
        selected: true,
      } as never).ok,
    ).toBe(false);

    expect(
      validatePresentationDeckData({
        ...fixturePresentationDeck(),
        schemaId: "wrong.schema",
      } as never).ok,
    ).toBe(false);

    const badBounds = fixturePresentationDeck();
    (badBounds.slides[0]!.elements[0] as { bounds: { x: number } }).bounds.x = 2;
    expect(validatePresentationDeckData(badBounds as never).ok).toBe(false);

    const badEl = fixturePresentationDeck();
    (badEl.slides[0]!.elements[0] as { type: string }).type = "pptxShape";
    expect(validatePresentationDeckData(badEl as never).ok).toBe(false);

    expect(() =>
      validateArtifactData({
        artifactType: "deck",
        artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
        schemaVersion: "99",
        data: fixturePresentationDeck() as never,
      }),
    ).toThrow(/ARTIFACT_SCHEMA_NOT_FOUND/);

    const badRef = fixturePresentationDeck();
    badRef.designSystemRef.artifactId = "exec_not_artifact";
    expect(validatePresentationDeckData(badRef as never).ok).toBe(false);
  });

  it("D — stable slide/element ids across versions", () => {
    const ds = createArtifact({
      sessionId: "s",
      serviceId: "presentation",
      phaseId: "select",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
      artifactType: "structured_doc",
      data: fixturePresentationDesignSystem() as never,
    });
    const v1Data = fixturePresentationDeck(ds.artifact.artifactId);
    const created = createArtifact({
      sessionId: "s",
      serviceId: "presentation",
      phaseId: "full-deck",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
      artifactType: "deck",
      data: v1Data as never,
    });
    const v2Data = fixturePresentationDeck(ds.artifact.artifactId);
    v2Data.metadata.title = "Acme Series A (refined)";
    // Preserve ids; change only title text on element_title_01
    const titleEl = v2Data.slides[0]!.elements.find((e) => e.id === "element_title_01");
    expect(titleEl?.type).toBe("text");
    if (titleEl?.type === "text") titleEl.content = "Acme — Refined Title";

    createVersion({
      artifactId: created.artifact.artifactId,
      expectedLatestVersion: 1,
      data: v2Data as never,
    });

    const v1 = getArtifactVersion(created.artifact.artifactId, 1);
    const v2 = getLatestArtifactVersion(created.artifact.artifactId);
    const ids1 = (v1.data.slides as Array<{ id: string; elements: Array<{ id: string }> }>)
      .flatMap((s) => [s.id, ...s.elements.map((e) => e.id)])
      .sort();
    const ids2 = (v2.data.slides as Array<{ id: string; elements: Array<{ id: string }> }>)
      .flatMap((s) => [s.id, ...s.elements.map((e) => e.id)])
      .sort();
    expect(ids2).toEqual(ids1);
    expect(ids1).toContain("slide_01");
    expect(ids1).toContain("element_title_01");
  });

  it("E — lineage via exact-version upstream refs + M3A sourceArtifacts", () => {
    const source = createArtifact({
      sessionId: "s",
      serviceId: "presentation",
      phaseId: "source",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.source,
      artifactType: "config_choice",
      data: fixturePresentationSource() as never,
    });
    const story = createArtifact({
      sessionId: "s",
      serviceId: "presentation",
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      artifactType: "structured_doc",
      data: fixturePresentationStoryline() as never,
      sourceArtifacts: [
        {
          artifactId: source.artifact.artifactId,
          version: 1,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.source,
          relationship: "derived_from",
        },
      ],
    });
    expect(story.version.lineage.sourceArtifacts[0]!.version).toBe(1);
    expect(story.version.lineage.sourceArtifacts[0]!.artifactId).toBe(
      source.artifact.artifactId,
    );
  });

  it("F — renderer independence: no PPTX/PDF required; banned fields rejected", () => {
    const deck = fixturePresentationDeck();
    expect(deck).not.toHaveProperty("pptxXml");
    expect(deck).not.toHaveProperty("pdfOperators");
    expect(deck.metadata.dimensions.coordinateSystem).toBe(DECK_COORDINATE_SYSTEM);
    expect(
      validatePresentationDeckData({
        ...deck,
        pptxXml: "<a:blip/>",
      } as never).ok,
    ).toBe(false);
    expect(
      validatePresentationDeckData({
        ...deck,
        renderedFileId: "file_123",
      } as never).ok,
    ).toBe(false);
  });

  it("G — vault asset refs; execution ids cannot masquerade", () => {
    expect(isVaultAssetObjectIdShape(FIXTURE_IDS.vaultImage)).toBe(true);
    expect(isExecutionIdShape(FIXTURE_IDS.vaultImage)).toBe(false);

    const badImage = fixturePresentationDeck();
    const img = badImage.slides[1]!.elements.find((e) => e.type === "image");
    expect(img?.type).toBe("image");
    if (img?.type === "image") img.vaultAssetId = "exec_abc";
    expect(validatePresentationDeckData(badImage as never).ok).toBe(false);

    const badRoute = fixturePresentationDesignRoute();
    badRoute.representativeAssetIds = ["cdfart_not_vault"];
    expect(validatePresentationDesignRouteData(badRoute as never).ok).toBe(false);
  });

  it("H — serialize → deserialize → validate equivalence", () => {
    const original = fixturePresentationDeck();
    const json = JSON.stringify(original);
    const roundTrip = JSON.parse(json) as typeof original;
    expect(validatePresentationDeckData(roundTrip as never).ok).toBe(true);
    expect(roundTrip).toEqual(original);
  });

  it("I — schema evolution: incompatible schema version rejected", () => {
    expect(() =>
      validateArtifactData({
        artifactType: "structured_doc",
        artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
        schemaVersion: "2",
        data: fixturePresentationStoryline() as never,
      }),
    ).toThrow(/ARTIFACT_SCHEMA_NOT_FOUND/);
    // v1 still validates
    validateArtifactData({
      artifactType: "structured_doc",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      schemaVersion: "1",
      data: fixturePresentationStoryline() as never,
    });
  });

  it("J — M3A integration: create/version/lifecycle with envelope separate from data", () => {
    const ds = createArtifact({
      sessionId: "s",
      serviceId: "presentation",
      phaseId: "select",
      projectId: "p1",
      organizationId: "o1",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
      artifactType: "structured_doc",
      data: fixturePresentationDesignSystem() as never,
    });
    expect(ds.artifact.artifactKey).toBe(PRESENTATION_ARTIFACT_KEYS.designSystem);
    expect(ds.version.data.schemaId).toBe(
      presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.designSystem),
    );
    // Envelope fields are not duplicated as required DeckSpec identity
    expect(ds.version.data).not.toHaveProperty("sessionId");

    const deck = createArtifact({
      sessionId: "s",
      serviceId: "presentation",
      phaseId: "full-deck",
      projectId: "p1",
      organizationId: "o1",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
      artifactType: "deck",
      data: fixturePresentationDeck(ds.artifact.artifactId) as never,
      sourceArtifacts: [
        {
          artifactId: ds.artifact.artifactId,
          version: 1,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
          relationship: "uses",
        },
      ],
      provenance: {
        executionId: "exec_gen_1",
        contextId: "ctx_1",
        contextHash: "h1",
      },
    });
    expect(deck.version.provenance.executionId).toBe("exec_gen_1");
    expect(deck.artifact.artifactId).not.toBe("exec_gen_1");

    markApproved(deck.artifact.artifactId, 1);
    const next = fixturePresentationDeck(ds.artifact.artifactId);
    next.metadata.title = "v2";
    createVersion({
      artifactId: deck.artifact.artifactId,
      expectedLatestVersion: 1,
      data: next as never,
    });
    expect(getLatestArtifactVersion(deck.artifact.artifactId).version).toBe(2);
    expect(getArtifactVersion(deck.artifact.artifactId, 1).status).toBe("superseded");
  });

  it("content is WHAT not WHERE — slide-content rejects bounds", () => {
    const sc = fixturePresentationSlideContent() as Record<string, unknown>;
    (sc.slides as Array<Record<string, unknown>>)[0]!.bounds = {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    };
    expect(validatePresentationSlideContentData(sc as never).ok).toBe(false);
  });

  it("pipeline fixtures chain: source→storyline→slide-content→route→system→deck", () => {
    const source = createArtifact({
      sessionId: "s",
      serviceId: "presentation",
      phaseId: "source",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.source,
      artifactType: "config_choice",
      data: fixturePresentationSource() as never,
    });
    const storyline = createArtifact({
      sessionId: "s",
      serviceId: "presentation",
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      artifactType: "structured_doc",
      data: fixturePresentationStoryline() as never,
      sourceArtifacts: [
        {
          artifactId: source.artifact.artifactId,
          version: 1,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.source,
          relationship: "derived_from",
        },
      ],
    });
    const content = createArtifact({
      sessionId: "s",
      serviceId: "presentation",
      phaseId: "slide-content",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.slideContent,
      artifactType: "structured_doc",
      data: fixturePresentationSlideContent() as never,
      sourceArtifacts: [
        {
          artifactId: storyline.artifact.artifactId,
          version: 1,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
          relationship: "derived_from",
        },
      ],
    });
    const route = createArtifact({
      sessionId: "s",
      serviceId: "presentation",
      phaseId: "design-routes",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.designRoute,
      artifactType: "config_choice",
      data: fixturePresentationDesignRoute() as never,
      sourceArtifacts: [
        {
          artifactId: content.artifact.artifactId,
          version: 1,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.slideContent,
          relationship: "uses",
        },
      ],
    });
    const systemData = fixturePresentationDesignSystem();
    systemData.derivedFromRoute = {
      artifactId: route.artifact.artifactId,
      version: 1,
    };
    const system = createArtifact({
      sessionId: "s",
      serviceId: "presentation",
      phaseId: "select",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
      artifactType: "structured_doc",
      data: systemData as never,
      sourceArtifacts: [
        {
          artifactId: route.artifact.artifactId,
          version: 1,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.designRoute,
          relationship: "derived_from",
        },
      ],
    });
    const deck = createArtifact({
      sessionId: "s",
      serviceId: "presentation",
      phaseId: "full-deck",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
      artifactType: "deck",
      data: fixturePresentationDeck(system.artifact.artifactId) as never,
      sourceArtifacts: [
        {
          artifactId: content.artifact.artifactId,
          version: 1,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.slideContent,
          relationship: "uses",
        },
        {
          artifactId: system.artifact.artifactId,
          version: 1,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
          relationship: "uses",
        },
      ],
    });
    expect(deck.version.lineage.sourceArtifacts).toHaveLength(2);
    expect(deck.version.data.designSystemRef).toMatchObject({
      artifactId: system.artifact.artifactId,
      version: 1,
    });
  });
});
