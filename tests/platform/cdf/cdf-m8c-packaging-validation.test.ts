/**
 * CDF M8C — Packaging canonical session integration + M4 validation.
 */

import {
  applyCdfTransition,
  applyArtifactEngineOnApprove,
  applyArtifactEngineOnSelect,
  acceptCandidatePayload,
  bindGeneratedPackagingArtifactToSession,
  createArtifact,
  createVersion,
  findPackagingExactRef,
  fixturePackagingCompletePack,
  fixturePackagingDieline,
  fixturePackagingFrontPack,
  fixturePackagingRoutes,
  fixturePackaging3dDirection,
  fixturePackagingSkuAdaptations,
  fixturePackagingViews,
  getArtifactVersion,
  getCdfSession,
  ingestGenerationCompletion,
  listArtifactVersions,
  observePackagingArtifact,
  packagingDependencySatisfied,
  PACKAGING_ARTIFACT_KEYS,
  PACKAGING_FIXTURE_IDS,
  packagingSchemaId,
  persistCdfSession,
  resetCdfArtifactEngineForTests,
  resetCdfGenerationValidationForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  runPackagingDependencyChecks,
  runPackagingStructuralChecks,
  sessionHasPackagingCanonicalRefs,
  tryIngestPackagingCdfCompletion,
  upsertSessionArtifactRef,
  validateCanonicalArtifact,
  validatePackagingCompletePackData,
} from "../../../src/platform/cdf";
import type { CdfRequirement } from "../../../src/platform/cdf/requirements/types";

describe("CDF M8C Packaging Session + Validation", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
    resetCdfGenerationValidationForTests();
  });

  function startPackagingSession() {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "packaging",
      productMode: "ai",
      organizationId: "org_m8c",
      projectId: "proj_m8c",
    });
    if (!started.ok) throw new Error("start");
    const briefed = applyCdfTransition({
      sessionId: started.value.session.sessionId,
      action: "submit_brief",
      brief: "Create 4 SKUs of mango drink pack",
      expectedVersion: started.value.session.sessionVersion,
    });
    if (!briefed.ok) throw new Error("brief");
    return briefed.value.session;
  }

  function req(partial: {
    key: string;
    displayValue?: string;
    value?: CdfRequirement["value"];
    category?: CdfRequirement["category"];
    priority?: CdfRequirement["priority"];
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
      priority: partial.priority ?? "explicit_current_user_instruction",
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

  it("SESSION 1–3 — ingest binds exact generated ref; no payload in session", () => {
    const session = startPackagingSession();
    const r = tryIngestPackagingCdfCompletion({
      forceOptIn: true,
      metadata: {
        cdfSessionId: session.sessionId,
        cdfServiceId: "packaging",
        cdfPhaseId: "dieline",
      },
      rawOutput: fixturePackagingDieline(),
      executionId: "exec_m8c_d1",
      organizationId: "org_m8c",
      projectId: "proj_m8c",
    });
    expect(r?.kind).toBe("accepted");
    if (r?.kind !== "accepted") throw new Error("accepted");
    const s = getCdfSession(session.sessionId)!;
    expect(sessionHasPackagingCanonicalRefs(s)).toBe(true);
    const gen = s.generatedArtifacts?.find(
      (x) => x.artifactKey === PACKAGING_ARTIFACT_KEYS.dieline,
    );
    expect(gen?.artifactId).toBe(r.ingest.artifactId);
    expect(gen?.version).toBe(1);
    expect(JSON.stringify(s.generatedArtifacts)).not.toMatch(/pathKind/);
    expect(gen).not.toHaveProperty("data");
  });

  it("SESSION 4–7 — select ≠ approve; exact versions; no latest", () => {
    const session = startPackagingSession();
    const created = createArtifact({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "routes",
      organizationId: "org_m8c",
      projectId: "proj_m8c",
      artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
      artifactType: "text_choice",
      data: fixturePackagingRoutes() as never,
    });
    let s = getCdfSession(session.sessionId)!;
    s = applyArtifactEngineOnSelect({
      session: s,
      phaseId: "routes",
      artifactId: created.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
    });
    persistCdfSession(s);
    expect(getArtifactVersion(created.artifact.artifactId, 1).status).toBe(
      "selected",
    );
    expect(getArtifactVersion(created.artifact.artifactId, 1).status).not.toBe(
      "approved",
    );

    s = applyArtifactEngineOnApprove({
      session: getCdfSession(session.sessionId)!,
      phaseId: "routes",
      artifactId: created.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
    });
    persistCdfSession(s);
    expect(getArtifactVersion(created.artifact.artifactId, 1).status).toBe(
      "approved",
    );

    createVersion({
      artifactId: created.artifact.artifactId,
      expectedLatestVersion: 1,
      data: {
        ...fixturePackagingRoutes(),
        routes: [
          ...fixturePackagingRoutes().routes,
          { routeId: "route_04", name: "Extra" },
        ],
      } as never,
    });

    s = getCdfSession(session.sessionId)!;
    const approved = s.approvedArtifacts!.find(
      (r) => r.artifactKey === PACKAGING_ARTIFACT_KEYS.routes,
    )!;
    expect(approved.version).toBe(1); // still v1 despite v2 existing
    expect(
      JSON.stringify(s.approvedArtifacts).includes('"latest"'),
    ).toBe(false);
  });

  it("SESSION 8–11 — dependency exact / missing / not_approved", () => {
    const session = startPackagingSession();
    let s = getCdfSession(session.sessionId)!;
    expect(packagingDependencySatisfied(s, "dieline").ok).toBe(false);

    const d = createArtifact({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "dieline",
      organizationId: "org_m8c",
      projectId: "proj_m8c",
      artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
      artifactType: "config_choice",
      data: fixturePackagingDieline() as never,
    });
    s = upsertSessionArtifactRef(s, {
      artifactId: d.artifact.artifactId,
      version: 1,
      phaseId: "dieline",
      artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
      role: "generated",
    });
    persistCdfSession(s);
    s = getCdfSession(session.sessionId)!;
    expect(packagingDependencySatisfied(s, "dieline")).toEqual({
      ok: false,
      reason: "not_approved",
    });

    s = applyArtifactEngineOnApprove({
      session: s,
      phaseId: "dieline",
      artifactId: d.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
    });
    persistCdfSession(s);
    expect(packagingDependencySatisfied(getCdfSession(session.sessionId)!, "dieline").ok).toBe(
      true,
    );
    expect(
      findPackagingExactRef(
        getCdfSession(session.sessionId)!,
        PACKAGING_ARTIFACT_KEYS.dieline,
      )?.version,
    ).toBe(1);
  });

  it("SESSION e2e — normalize → M4 → ArtifactVersion → session → select → approve → exact dep", () => {
    const session = startPackagingSession();
    const dieline = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "dieline",
      organizationId: "org_m8c",
      projectId: "proj_m8c",
      executionId: "exec_e2e_d",
      expectedSessionVersion: session.sessionVersion,
      rawOutput: fixturePackagingDieline(),
      requirements: [],
    });
    bindGeneratedPackagingArtifactToSession({
      sessionId: session.sessionId,
      phaseId: "dieline",
      artifactId: dieline.artifactId,
      version: dieline.artifactVersion,
      artifactKey: dieline.artifactKey,
    });
    let s = getCdfSession(session.sessionId)!;
    s = applyArtifactEngineOnSelect({
      session: s,
      phaseId: "dieline",
      artifactId: dieline.artifactId,
      artifactVersion: dieline.artifactVersion,
      artifactKey: dieline.artifactKey,
    });
    s = applyArtifactEngineOnApprove({
      session: s,
      phaseId: "dieline",
      artifactId: dieline.artifactId,
      artifactVersion: dieline.artifactVersion,
      artifactKey: dieline.artifactKey,
    });
    persistCdfSession(s);

    const routes = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "routes",
      organizationId: "org_m8c",
      projectId: "proj_m8c",
      executionId: "exec_e2e_r",
      expectedSessionVersion: getCdfSession(session.sessionId)!.sessionVersion,
      rawOutput: fixturePackagingRoutes(dieline.artifactId, 1),
      packagingRefs: {
        dielineRef: {
          artifactId: dieline.artifactId,
          version: dieline.artifactVersion,
        },
      },
      requirements: [],
    });
    expect(routes.artifactVersion).toBe(1);
    const pin = findPackagingExactRef(
      getCdfSession(session.sessionId)!,
      PACKAGING_ARTIFACT_KEYS.dieline,
    );
    expect(pin).toEqual({
      artifactId: dieline.artifactId,
      version: dieline.artifactVersion,
    });
  });

  it("FAILED M4 → NO ArtifactVersion → NO session ref", () => {
    const session = startPackagingSession();
    const before = getCdfSession(session.sessionId)!;
    const gate = acceptCandidatePayload({
      candidateData: {
        schemaId: packagingSchemaId(PACKAGING_ARTIFACT_KEYS.routes),
        routes: [
          { routeId: "route_01", name: "A" },
          { routeId: "route_01", name: "B" },
        ],
      },
      artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
      sessionId: session.sessionId,
      organizationId: "org_m8c",
      projectId: "proj_m8c",
      requirements: [],
    });
    // Structural duplicate IDs fail M4 packaging checks
    expect(gate.accepted).toBe(false);
    expect(before.generatedArtifacts ?? []).toHaveLength(0);
  });

  it("DIELINE — geometry unresolved unable_to_verify; invalid dims fail", () => {
    const obs = observePackagingArtifact(
      PACKAGING_ARTIFACT_KEYS.dieline,
      fixturePackagingDieline() as never,
    );
    const checks = runPackagingStructuralChecks(obs);
    expect(
      checks.some(
        (c) =>
          c.fieldPath === "geometry" && c.status === "unable_to_verify",
      ),
    ).toBe(true);

    const bad = observePackagingArtifact(PACKAGING_ARTIFACT_KEYS.dieline, {
      ...fixturePackagingDieline(),
      dimensions: {
        widthMm: -1,
        heightMm: 10,
        coordinateSystem: "physical_mm",
      },
    } as never);
    expect(
      runPackagingStructuralChecks(bad).some(
        (c) => c.fieldPath === "dimensions" && c.status === "fail",
      ),
    ).toBe(true);
  });

  it("ROUTES — count requirement; duplicate IDs; selectedRoute invalid", () => {
    const session = startPackagingSession();
    const failDup = acceptCandidatePayload({
      candidateData: {
        schemaId: packagingSchemaId(PACKAGING_ARTIFACT_KEYS.routes),
        routes: [
          { routeId: "route_01", name: "A" },
          { routeId: "route_01", name: "B" },
        ],
      },
      artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
      sessionId: session.sessionId,
      requirements: [],
    });
    expect(failDup.accepted).toBe(false);

    const ok = acceptCandidatePayload({
      candidateData: fixturePackagingRoutes() as never,
      artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
      sessionId: session.sessionId,
      requirements: [
        req({
          key: "route_count",
          displayValue: "3",
          value: { kind: "number", value: 3 },
          category: "structure",
        }),
      ],
    });
    expect(ok.accepted).toBe(true);

    const badSel = observePackagingArtifact(PACKAGING_ARTIFACT_KEYS.routes, {
      ...fixturePackagingRoutes(),
      selectedRouteId: "route_99",
    } as never);
    expect(
      runPackagingStructuralChecks(badSel).some(
        (c) => c.fieldPath === "selectedRouteId" && c.status === "fail",
      ),
    ).toBe(true);
  });

  it("3D — exact deps; image-only not validated as geometry; scene unable_to_verify", () => {
    const session = startPackagingSession();
    const data = fixturePackaging3dDirection();
    const gate = acceptCandidatePayload({
      candidateData: data as never,
      artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
      sessionId: session.sessionId,
      expectedPackagingRefs: {
        dielineRef: data.dielineRef,
        routesRef: data.routesRef,
      },
      requirements: [],
    });
    expect(gate.accepted).toBe(true);
    expect(
      gate.validation.checks.some(
        (c) =>
          c.fieldPath === "structured_scene" &&
          c.status === "unable_to_verify",
      ),
    ).toBe(true);

    const mismatch = runPackagingDependencyChecks(
      observePackagingArtifact(
        PACKAGING_ARTIFACT_KEYS.threeDDirection,
        data as never,
      ),
      {
        dielineRef: { artifactId: data.dielineRef.artifactId, version: 99 },
        routesRef: data.routesRef,
      },
    );
    expect(mismatch.some((c) => c.status === "fail")).toBe(true);
  });

  it("FRONT — mandatory/forbidden copy; invalid asset identity", () => {
    const session = startPackagingSession();
    const front = fixturePackagingFrontPack();
    const gate = acceptCandidatePayload({
      candidateData: front as never,
      artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
      sessionId: session.sessionId,
      expectedPackagingRefs: {
        routesRef: front.routesRef,
        threeDDirectionRef: front.threeDDirectionRef,
      },
      requirements: [
        req({
          key: "mandatory_copy",
          category: "mandatory_content",
          displayValue: "Net weight 250ml",
          value: { kind: "string", value: "Net weight 250ml" },
        }),
        req({
          key: "forbidden_claim",
          category: "forbidden_content",
          displayValue: "cures diabetes",
          value: { kind: "string", value: "cures diabetes" },
        }),
      ],
    });
    expect(gate.accepted).toBe(true);

    const badAsset = observePackagingArtifact(PACKAGING_ARTIFACT_KEYS.frontPack, {
      ...front,
      previewAssetRef: { vaultAssetId: "art_1_0" },
    } as never);
    expect(
      runPackagingStructuralChecks(badAsset).some(
        (c) => c.fieldPath === "art_as_asset" && c.status === "fail",
      ),
    ).toBe(true);
  });

  it("COMPLETE-PACK — exact upstream; latest / missing fail", () => {
    const complete = fixturePackagingCompletePack();
    expect(validatePackagingCompletePackData(complete as never).ok).toBe(true);
    const obs = observePackagingArtifact(
      PACKAGING_ARTIFACT_KEYS.completePack,
      complete as never,
    );
    const ok = runPackagingDependencyChecks(obs, {
      dielineRef: complete.dielineRef,
      routesRef: complete.routesRef,
      threeDDirectionRef: complete.threeDDirectionRef,
      frontPackRef: complete.frontPackRef,
    });
    expect(ok.every((c) => c.status === "pass" || c.status === "not_applicable")).toBe(
      true,
    );

    const latestObs = observePackagingArtifact(
      PACKAGING_ARTIFACT_KEYS.completePack,
      { ...complete, routesRef: { ...complete.routesRef, version: "latest" } } as never,
    );
    expect(
      runPackagingStructuralChecks(latestObs).some(
        (c) => c.fieldPath === "latest_ref",
      ),
    ).toBe(true);
  });

  it("VIEWS + SKU — exact deps; sku_count; no image-count inference", () => {
    const session = startPackagingSession();
    const views = fixturePackagingViews();
    const skus = fixturePackagingSkuAdaptations();

    const vGate = acceptCandidatePayload({
      candidateData: views as never,
      artifactKey: PACKAGING_ARTIFACT_KEYS.views,
      sessionId: session.sessionId,
      expectedPackagingRefs: { completePackRef: views.completePackRef },
      requirements: [],
    });
    expect(vGate.accepted).toBe(true);

    const skuFail = acceptCandidatePayload({
      candidateData: skus as never,
      artifactKey: PACKAGING_ARTIFACT_KEYS.skuAdaptations,
      sessionId: session.sessionId,
      expectedPackagingRefs: { viewsRef: skus.viewsRef },
      requirements: [
        req({
          key: "sku_count",
          displayValue: "5",
          value: { kind: "number", value: 5 },
          category: "quantity",
        }),
      ],
    });
    expect(skuFail.accepted).toBe(false); // 4 ≠ 5

    const skuOk = acceptCandidatePayload({
      candidateData: skus as never,
      artifactKey: PACKAGING_ARTIFACT_KEYS.skuAdaptations,
      sessionId: session.sessionId,
      expectedPackagingRefs: { viewsRef: skus.viewsRef },
      requirements: [
        req({
          key: "sku_count",
          displayValue: "4",
          value: { kind: "number", value: 4 },
          category: "quantity",
        }),
      ],
    });
    expect(skuOk.accepted).toBe(true);
  });

  it("LIFECYCLE — passed validates; stale rejected; versions immutable", () => {
    const session = startPackagingSession();
    const created = createArtifact({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "dieline",
      organizationId: "org_m8c",
      projectId: "proj_m8c",
      artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
      artifactType: "config_choice",
      data: fixturePackagingDieline() as never,
    });
    const result = validateCanonicalArtifact({
      artifactId: created.artifact.artifactId,
      artifactVersion: 1,
      sessionId: session.sessionId,
      organizationId: "org_m8c",
      projectId: "proj_m8c",
      requirements: [],
      applyLifecycle: true,
    });
    expect(["passed", "review_required"]).toContain(result.status);
    expect(getArtifactVersion(created.artifact.artifactId, 1).status).toBe(
      "validated",
    );

    expect(() =>
      validateCanonicalArtifact({
        artifactId: created.artifact.artifactId,
        artifactVersion: 1,
        sessionId: session.sessionId,
        expectedSessionVersion: session.sessionVersion - 1,
        requirements: [],
      }),
    ).toThrow(/STALE/);

    createVersion({
      artifactId: created.artifact.artifactId,
      expectedLatestVersion: 1,
      data: { ...fixturePackagingDieline(), pathKind: "none" } as never,
    });
    expect(
      (getArtifactVersion(created.artifact.artifactId, 1).data as { pathKind: string })
        .pathKind,
    ).toBe("upload_dieline");
    expect(listArtifactVersions(created.artifact.artifactId)).toHaveLength(2);
  });

  it("TENANCY — cross-tenant rejected", () => {
    const session = startPackagingSession();
    const created = createArtifact({
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "dieline",
      organizationId: "org_m8c",
      projectId: "proj_m8c",
      artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
      artifactType: "config_choice",
      data: fixturePackagingDieline() as never,
    });
    expect(() =>
      validateCanonicalArtifact({
        artifactId: created.artifact.artifactId,
        artifactVersion: 1,
        sessionId: session.sessionId,
        organizationId: "org_other",
        projectId: "proj_m8c",
        requirements: [],
      }),
    ).toThrow();
  });

  it("legacy Packaging without canonical refs still uses legacy dependency path", () => {
    const session = startPackagingSession();
    const s = getCdfSession(session.sessionId)!;
    expect(sessionHasPackagingCanonicalRefs(s)).toBe(false);
    // No canonical refs → missing until legacy approved[] set
    expect(packagingDependencySatisfied(s, "dieline").ok).toBe(false);
  });
});
