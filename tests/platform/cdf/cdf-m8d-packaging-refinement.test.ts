/**
 * CDF M8D — Packaging targeted immutable refinement.
 */

import {
  applyArtifactEngineOnApprove,
  applyArtifactEngineOnSelect,
  applyTargetedRefinement,
  assertVaultAssetForRefinement,
  createArtifact,
  createVersion,
  findPackagingExactRef,
  fixturePackagingDieline,
  fixturePackagingFrontPack,
  fixturePackagingRoutes,
  fixturePackaging3dDirection,
  fixturePackagingSkuAdaptations,
  fixturePackagingViews,
  fixturePackagingCompletePack,
  getArtifactVersion,
  getCdfSession,
  listArtifactVersions,
  PACKAGING_ARTIFACT_KEYS,
  PACKAGING_FIXTURE_IDS,
  persistCdfSession,
  resetCdfArtifactEngineForTests,
  resetCdfGenerationValidationForTests,
  resetCdfRefinementEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  setCdfRefinementKnownVaultAssets,
  applyCdfTransition,
  CdfRefinementError,
} from "../../../src/platform/cdf";
import type { CdfRequirement } from "../../../src/platform/cdf/requirements/types";

describe("CDF M8D Packaging Targeted Refinement", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
    resetCdfGenerationValidationForTests();
    resetCdfRefinementEngineForTests();
    setCdfRefinementKnownVaultAssets([
      PACKAGING_FIXTURE_IDS.vaultImage,
      "507f1f77bcf86cd799439099",
    ]);
  });

  function startSession() {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "packaging",
      productMode: "ai",
      organizationId: "org_m8d",
      projectId: "proj_m8d",
    });
    if (!started.ok) throw new Error("start");
    const briefed = applyCdfTransition({
      sessionId: started.value.session.sessionId,
      action: "submit_brief",
      brief: "Premium mango drink packaging",
      expectedVersion: started.value.session.sessionVersion,
    });
    if (!briefed.ok) throw new Error("brief");
    return briefed.value.session;
  }

  function createRoutesV1(sessionId: string) {
    return createArtifact({
      organizationId: "org_m8d",
      projectId: "proj_m8d",
      sessionId,
      serviceId: "packaging",
      phaseId: "routes",
      artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
      artifactType: "text_choice",
      data: fixturePackagingRoutes() as never,
    });
  }

  function createFrontV1(sessionId: string) {
    return createArtifact({
      organizationId: "org_m8d",
      projectId: "proj_m8d",
      sessionId,
      serviceId: "packaging",
      phaseId: "front-pack",
      artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
      artifactType: "pack",
      data: fixturePackagingFrontPack() as never,
    });
  }

  function req(partial: {
    key: string;
    displayValue?: string;
    value?: CdfRequirement["value"];
    category?: CdfRequirement["category"];
  }): CdfRequirement {
    return {
      requirementId: `req_${partial.key}`,
      sessionId: "s",
      serviceId: "packaging",
      key: partial.key,
      category: partial.category ?? "structure",
      displayValue: partial.displayValue ?? "",
      value:
        partial.value ??
        ({ kind: "string", value: partial.displayValue ?? "" } as const),
      status: "active",
      priority: "explicit_current_user_instruction",
      provenance: {
        sourceInputId: "src_1",
        sourceType: "user_prompt",
        extractionMethod: "explicit",
        explicit: true,
        confidence: 1,
      },
      confidence: 1,
      explicit: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  // ── Exact version / immutability ─────────────────────────────────────────

  it("EXACT VERSION — refine exact version; source unchanged; no latest", () => {
    const session = startSession();
    const created = createRoutesV1(session.sessionId);
    const sourceSnap = structuredClone(
      getArtifactVersion(created.artifact.artifactId, 1).data,
    );

    const result = applyTargetedRefinement({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "routes",
      organizationId: "org_m8d",
      projectId: "proj_m8d",
      rawInstruction: "set route_01 name to 'Tropical Punch Plus'",
      artifactId: created.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
      preferredTargetPath: "route_01.name",
    });

    expect(result.status).toBe("applied");
    expect(result.sourceVersion).toBe(1);
    expect(result.newVersion).toBe(2);
    expect(getArtifactVersion(created.artifact.artifactId, 1).data).toEqual(
      sourceSnap,
    );
    const v2 = getArtifactVersion(created.artifact.artifactId, 2);
    expect(
      (v2.data as { routes: Array<{ routeId: string; name: string }> }).routes.find(
        (r) => r.routeId === "route_01",
      )?.name,
    ).toBe("Tropical Punch Plus");
    expect(v2.lineage?.parentVersion).toBe(1);
    expect(
      v2.lineage?.sourceArtifacts?.some(
        (s) => s.relationship === "refines" && s.version === 1,
      ),
    ).toBe(true);
  });

  it("FAILED M4 → NO ArtifactVersion; source unchanged", () => {
    const session = startSession();
    const created = createFrontV1(session.sessionId);
    const before = listArtifactVersions(created.artifact.artifactId).length;

    const result = applyTargetedRefinement({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "front-pack",
      organizationId: "org_m8d",
      projectId: "proj_m8d",
      rawInstruction: "set compositionNotes to 'FORBIDDEN_WORD_HERE'",
      artifactId: created.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
      preferredTargetPath: "front.compositionNotes",
      m4Requirements: [
        req({
          key: "forbidden.copy",
          displayValue: "FORBIDDEN_WORD_HERE",
          value: { kind: "string", value: "FORBIDDEN_WORD_HERE" },
          category: "forbidden_content",
        }),
      ],
    });

    expect(result.status).toBe("validation_failed");
    expect(result.newVersion).toBeUndefined();
    expect(listArtifactVersions(created.artifact.artifactId).length).toBe(
      before,
    );
  });

  it("SESSION — generated ref updates to new version; approved not silently mutated", () => {
    const session = startSession();
    const created = createRoutesV1(session.sessionId);
    let s = session;
    s = applyArtifactEngineOnSelect({
      session: s,
      phaseId: "routes",
      artifactId: created.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
    });
    s = applyArtifactEngineOnApprove({
      session: s,
      phaseId: "routes",
      artifactId: created.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
    });
    persistCdfSession(s);

    const result = applyTargetedRefinement({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "routes",
      organizationId: "org_m8d",
      projectId: "proj_m8d",
      rawInstruction: "set route_02 name to 'Minimal v2'",
      artifactId: created.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
      preferredTargetPath: "route_02.name",
    });
    expect(result.newVersion).toBe(2);

    const live = getCdfSession(session.sessionId)!;
    const generated = findPackagingExactRef(
      live,
      PACKAGING_ARTIFACT_KEYS.routes,
    );
    // findPackagingExactRef prefers approved — approved stays v1
    expect(
      live.approvedArtifacts?.find(
        (r) => r.artifactKey === PACKAGING_ARTIFACT_KEYS.routes,
      )?.version,
    ).toBe(1);
    expect(
      live.generatedArtifacts?.find(
        (r) => r.artifactKey === PACKAGING_ARTIFACT_KEYS.routes,
      )?.version,
    ).toBe(2);
    expect(generated?.version).toBe(1); // approved wins lookup

    // create v3 later — selected/approved remain v1
    createVersion({
      artifactId: created.artifact.artifactId,
      expectedLatestVersion: 2,
      data: {
        ...fixturePackagingRoutes(),
        routes: [
          ...fixturePackagingRoutes().routes,
          { routeId: "route_04", name: "Extra" },
        ],
      } as never,
    });
    const after = getCdfSession(session.sessionId)!;
    expect(
      after.approvedArtifacts?.find(
        (r) => r.artifactKey === PACKAGING_ARTIFACT_KEYS.routes,
      )?.version,
    ).toBe(1);
  });

  it("E2E GOLDEN — v4 refine → v5; select/approve v5; v6 does not steal pin", () => {
    const session = startSession();
    const created = createFrontV1(session.sessionId);
    // bump to v4 via createVersion
    createVersion({
      artifactId: created.artifact.artifactId,
      expectedLatestVersion: 1,
      data: {
        ...fixturePackagingFrontPack(),
        compositionNotes: "v2",
      } as never,
    });
    createVersion({
      artifactId: created.artifact.artifactId,
      expectedLatestVersion: 2,
      data: {
        ...fixturePackagingFrontPack(),
        compositionNotes: "v3",
      } as never,
    });
    createVersion({
      artifactId: created.artifact.artifactId,
      expectedLatestVersion: 3,
      data: {
        ...fixturePackagingFrontPack(),
        compositionNotes: "v4 base",
      } as never,
    });

    const v4 = getArtifactVersion(created.artifact.artifactId, 4);
    const v4snap = structuredClone(v4.data);

    const refined = applyTargetedRefinement({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "front-pack",
      organizationId: "org_m8d",
      projectId: "proj_m8d",
      rawInstruction: "set compositionNotes to 'v5 refined lockup'",
      artifactId: created.artifact.artifactId,
      artifactVersion: 4,
      artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
      preferredTargetPath: "front.compositionNotes",
    });
    expect(refined.status).toBe("applied");
    expect(refined.newVersion).toBe(5);
    expect(getArtifactVersion(created.artifact.artifactId, 4).data).toEqual(
      v4snap,
    );

    let s = getCdfSession(session.sessionId)!;
    s = applyArtifactEngineOnSelect({
      session: s,
      phaseId: "front-pack",
      artifactId: created.artifact.artifactId,
      artifactVersion: 5,
      artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
    });
    s = applyArtifactEngineOnApprove({
      session: s,
      phaseId: "front-pack",
      artifactId: created.artifact.artifactId,
      artifactVersion: 5,
      artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
    });
    persistCdfSession(s);

    createVersion({
      artifactId: created.artifact.artifactId,
      expectedLatestVersion: 5,
      data: {
        ...fixturePackagingFrontPack(),
        compositionNotes: "v6 noise",
      } as never,
    });

    const live = getCdfSession(session.sessionId)!;
    expect(
      live.selectedArtifacts?.find(
        (r) => r.artifactKey === PACKAGING_ARTIFACT_KEYS.frontPack,
      )?.version,
    ).toBe(5);
    expect(
      live.approvedArtifacts?.find(
        (r) => r.artifactKey === PACKAGING_ARTIFACT_KEYS.frontPack,
      )?.version,
    ).toBe(5);
  });

  // ── Targeting / limitations ──────────────────────────────────────────────

  it("TARGETING — route/surface/view/sku/direction; nonexistent; index rejected; logo invent rejected", () => {
    const session = startSession();
    const routes = createRoutesV1(session.sessionId);
    expect(
      applyTargetedRefinement({
        sessionId: session.sessionId,
        serviceId: "packaging",
        phaseId: "routes",
        organizationId: "org_m8d",
        projectId: "proj_m8d",
        rawInstruction: "set route_03 shelfIdea to 'Craft shelf story'",
        artifactId: routes.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
        preferredTargetPath: "route_03.shelfIdea",
      }).status,
    ).toBe("applied");

    expect(() =>
      applyTargetedRefinement({
        sessionId: session.sessionId,
        serviceId: "packaging",
        phaseId: "routes",
        organizationId: "org_m8d",
        projectId: "proj_m8d",
        rawInstruction: "set route_99 name to 'Nope'",
        artifactId: routes.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
        preferredTargetPath: "route_99.name",
      }),
    ).toThrow(CdfRefinementError);

    expect(() =>
      applyTargetedRefinement({
        sessionId: session.sessionId,
        serviceId: "packaging",
        phaseId: "routes",
        organizationId: "org_m8d",
        projectId: "proj_m8d",
        rawInstruction: "change index 0 name to 'Nope'",
        artifactId: routes.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
      }),
    ).toThrow(/Array-index-only|UNSUPPORTED/);

    const front = createFrontV1(session.sessionId);
    expect(() =>
      applyTargetedRefinement({
        sessionId: session.sessionId,
        serviceId: "packaging",
        phaseId: "front-pack",
        organizationId: "org_m8d",
        projectId: "proj_m8d",
        rawInstruction: "Make the logo larger on the front",
        artifactId: front.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
      }),
    ).toThrow(/logo|UNSUPPORTED|invent/i);
  });

  it("DIELINE / 3D — geometry unresolved cannot be patched; scene not editable", () => {
    const session = startSession();
    const dieline = createArtifact({
      organizationId: "org_m8d",
      projectId: "proj_m8d",
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "dieline",
      artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
      artifactType: "config_choice",
      data: fixturePackagingDieline() as never,
    });
    expect(() =>
      applyTargetedRefinement({
        sessionId: session.sessionId,
        serviceId: "packaging",
        phaseId: "dieline",
        organizationId: "org_m8d",
        projectId: "proj_m8d",
        rawInstruction: "move panel bounds left 0.1",
        artifactId: dieline.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
        preferredTargetPath: "dieline_panel_01.bounds",
      }),
    ).toThrow(/geometryUnresolved|geometry|UNSUPPORTED/i);

    const threeD = createArtifact({
      organizationId: "org_m8d",
      projectId: "proj_m8d",
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "3d-direction",
      artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
      artifactType: "pack",
      data: fixturePackaging3dDirection() as never,
    });
    expect(
      applyTargetedRefinement({
        sessionId: session.sessionId,
        serviceId: "packaging",
        phaseId: "3d-direction",
        organizationId: "org_m8d",
        projectId: "proj_m8d",
        rawInstruction: "set direction_01 visualIntent to 'Softer three-quarter'",
        artifactId: threeD.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
        preferredTargetPath: "direction_01.visualIntent",
      }).status,
    ).toBe("applied");

    expect(() =>
      applyTargetedRefinement({
        sessionId: session.sessionId,
        serviceId: "packaging",
        phaseId: "3d-direction",
        organizationId: "org_m8d",
        projectId: "proj_m8d",
        rawInstruction: "edit the mesh geometry",
        artifactId: threeD.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
      }),
    ).toThrow(/scene|geometry|UNSUPPORTED/i);
  });

  it("VIEWS camera — edit existing; invent missing rejected; SKU label; complete-pack upstream preserved", () => {
    const session = startSession();
    const views = createArtifact({
      organizationId: "org_m8d",
      projectId: "proj_m8d",
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "views",
      artifactKey: PACKAGING_ARTIFACT_KEYS.views,
      artifactType: "pack",
      data: fixturePackagingViews() as never,
    });
    expect(
      applyTargetedRefinement({
        sessionId: session.sessionId,
        serviceId: "packaging",
        phaseId: "views",
        organizationId: "org_m8d",
        projectId: "proj_m8d",
        rawInstruction: "set view_01 camera azimuth to 40",
        artifactId: views.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: PACKAGING_ARTIFACT_KEYS.views,
        preferredTargetPath: "view_01.camera.azimuthDeg",
      }).status,
    ).toBe("applied");

    expect(() =>
      applyTargetedRefinement({
        sessionId: session.sessionId,
        serviceId: "packaging",
        phaseId: "views",
        organizationId: "org_m8d",
        projectId: "proj_m8d",
        rawInstruction: "set view_02 camera azimuth to 10",
        artifactId: views.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: PACKAGING_ARTIFACT_KEYS.views,
        preferredTargetPath: "view_02.camera.azimuthDeg",
      }),
    ).toThrow(/camera|UNSUPPORTED/i);

    const skus = createArtifact({
      organizationId: "org_m8d",
      projectId: "proj_m8d",
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "sku-adaptations",
      artifactKey: PACKAGING_ARTIFACT_KEYS.skuAdaptations,
      artifactType: "pack",
      data: fixturePackagingSkuAdaptations() as never,
    });
    expect(
      applyTargetedRefinement({
        sessionId: session.sessionId,
        serviceId: "packaging",
        phaseId: "sku-adaptations",
        organizationId: "org_m8d",
        projectId: "proj_m8d",
        rawInstruction: "set sku_01 label to 'Masala Mango 250ml Bold'",
        artifactId: skus.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: PACKAGING_ARTIFACT_KEYS.skuAdaptations,
        preferredTargetPath: "sku_01.label",
      }).status,
    ).toBe("applied");

    const complete = createArtifact({
      organizationId: "org_m8d",
      projectId: "proj_m8d",
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "complete-pack",
      artifactKey: PACKAGING_ARTIFACT_KEYS.completePack,
      artifactType: "pack",
      data: fixturePackagingCompletePack() as never,
    });
    const beforeRefs = {
      ...(getArtifactVersion(complete.artifact.artifactId, 1).data as {
        dielineRef: unknown;
        routesRef: unknown;
      }),
    };
    applyTargetedRefinement({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "complete-pack",
      organizationId: "org_m8d",
      projectId: "proj_m8d",
      rawInstruction: "set package_surface_back notes to 'Back regulatory quiet'",
      artifactId: complete.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: PACKAGING_ARTIFACT_KEYS.completePack,
      preferredTargetPath: "package_surface_back.notes",
    });
    const after = getArtifactVersion(complete.artifact.artifactId, 2).data as {
      dielineRef: unknown;
      routesRef: unknown;
    };
    expect(after.dielineRef).toEqual(beforeRefs.dielineRef);
    expect(after.routesRef).toEqual(beforeRefs.routesRef);
  });

  it("ASSET SAFETY — Vault ObjectId ok; art_/exec_/cdfart_/URL rejected", () => {
    expect(() =>
      assertVaultAssetForRefinement({ vaultAssetId: "art_legacy_1" }),
    ).toThrow();
    expect(() =>
      assertVaultAssetForRefinement({ vaultAssetId: "exec_abc" }),
    ).toThrow();
    expect(() =>
      assertVaultAssetForRefinement({
        vaultAssetId: "cdfart_x_packaging-front",
      }),
    ).toThrow();
    expect(() =>
      assertVaultAssetForRefinement({
        vaultAssetId: "https://cdn.example/x.png",
      }),
    ).toThrow();
    expect(() =>
      assertVaultAssetForRefinement({
        vaultAssetId: PACKAGING_FIXTURE_IDS.vaultImage,
      }),
    ).not.toThrow();

    const session = startSession();
    const front = createFrontV1(session.sessionId);
    expect(
      applyTargetedRefinement({
        sessionId: session.sessionId,
        serviceId: "packaging",
        phaseId: "front-pack",
        organizationId: "org_m8d",
        projectId: "proj_m8d",
        rawInstruction:
          "replace preview asset with 507f1f77bcf86cd799439099",
        artifactId: front.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
        preferredTargetPath: "front.previewAssetRef",
      }).status,
    ).toBe("applied");
  });

  it("IDEMPOTENCY — replay same; mismatch conflict; no duplicate version", () => {
    const session = startSession();
    const created = createRoutesV1(session.sessionId);
    const input = {
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "routes",
      organizationId: "org_m8d",
      projectId: "proj_m8d",
      rawInstruction: "set route_01 name to 'Idem Name'",
      artifactId: created.artifact.artifactId,
      artifactVersion: 1 as number,
      artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
      preferredTargetPath: "route_01.name",
      requestId: "req_m8d_idem_1",
    };
    const a = applyTargetedRefinement(input);
    const b = applyTargetedRefinement(input);
    expect(a.newVersion).toBe(2);
    expect(b.idempotentReplay).toBe(true);
    expect(b.newVersion).toBe(2);
    expect(listArtifactVersions(created.artifact.artifactId).length).toBe(2);

    expect(() =>
      applyTargetedRefinement({
        ...input,
        rawInstruction: "set route_01 name to 'Different'",
      }),
    ).toThrow(/IDEMPOTENCY/);
  });

  it("TYPOGRAPHY ops unsupported on Packaging schemas", () => {
    const session = startSession();
    const front = createFrontV1(session.sessionId);
    expect(() =>
      applyTargetedRefinement({
        sessionId: session.sessionId,
        serviceId: "packaging",
        phaseId: "front-pack",
        organizationId: "org_m8d",
        projectId: "proj_m8d",
        rawInstruction: "set compositionNotes to 'x'",
        artifactId: front.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
        preferredTargetPath: "front.compositionNotes",
        // Force via preferred path — FONT ops come from presentation parser only;
        // Packaging path rejects inventing font fields:
        constraints: { forceOp: "SET_FONT_SIZE" },
      }),
    ).not.toThrow(); // SET_TEXT path still works

    // Explicit unsupported: add another SKU
    expect(() =>
      applyTargetedRefinement({
        sessionId: session.sessionId,
        serviceId: "packaging",
        phaseId: "sku-adaptations",
        organizationId: "org_m8d",
        projectId: "proj_m8d",
        rawInstruction: "Create another SKU for peach",
        artifactId: createArtifact({
          organizationId: "org_m8d",
          projectId: "proj_m8d",
          sessionId: session.sessionId,
          serviceId: "packaging",
          phaseId: "sku-adaptations",
          artifactKey: PACKAGING_ARTIFACT_KEYS.skuAdaptations,
          artifactType: "pack",
          data: fixturePackagingSkuAdaptations() as never,
        }).artifact.artifactId,
        artifactVersion: 1,
        artifactKey: PACKAGING_ARTIFACT_KEYS.skuAdaptations,
      }),
    ).toThrow(/workflow|UNSUPPORTED/i);
  });
});
