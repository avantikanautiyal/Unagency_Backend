/**
 * CDF M9D — Social Media targeted immutable refinement (shared M6 engine).
 */

import {
  applyArtifactEngineOnApprove,
  applyArtifactEngineOnSelect,
  applyCdfTransition,
  applyTargetedRefinement,
  bindGeneratedSocialMediaArtifactToSession,
  createArtifact,
  createVersion,
  fixtureSocialMediaOutput,
  fixtureSocialMediaPlatform,
  fixtureSocialMediaRoutes,
  getArtifactVersion,
  getCdfSession,
  listArtifactVersions,
  persistCdfSession,
  resetCdfArtifactEngineForTests,
  resetCdfGenerationValidationForTests,
  resetCdfRefinementEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  setCdfRefinementKnownVaultAssets,
  SOCIAL_MEDIA_ARTIFACT_KEYS,
  SOCIAL_MEDIA_FIXTURE_IDS,
  tryIngestSocialMediaCdfCompletion,
  CdfRefinementError,
} from "../../../src/platform/cdf";

describe("CDF M9D Social Media Targeted Refinement", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
    resetCdfGenerationValidationForTests();
    resetCdfRefinementEngineForTests();
    setCdfRefinementKnownVaultAssets([
      SOCIAL_MEDIA_FIXTURE_IDS.vaultImage,
      "507f1f77bcf86cd799439099",
    ]);
  });

  function startSession() {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "social-media",
      productMode: "ai",
      organizationId: "org_m9d",
      projectId: "proj_m9d",
    });
    if (!started.ok) throw new Error("start");
    const briefed = applyCdfTransition({
      sessionId: started.value.session.sessionId,
      action: "submit_brief",
      brief: "Create a post for our mango drink",
      expectedVersion: started.value.session.sessionVersion,
    });
    if (!briefed.ok) throw new Error("brief");
    return briefed.value.session;
  }

  function createRoutes(sessionId: string) {
    return createArtifact({
      organizationId: "org_m9d",
      projectId: "proj_m9d",
      sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      artifactType: "text_choice",
      data: fixtureSocialMediaRoutes() as never,
    });
  }

  function createOutput(sessionId: string, routesId: string, routesVersion = 1) {
    return createArtifact({
      organizationId: "org_m9d",
      projectId: "proj_m9d",
      sessionId,
      serviceId: "social-media",
      phaseId: "output",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      artifactType: "image",
      data: fixtureSocialMediaOutput(routesId, routesVersion) as never,
    });
  }

  it("A/N/O — exact version targeting; source immutable; lineage refines", () => {
    const session = startSession();
    const routes = createRoutes(session.sessionId);
    const out = createOutput(session.sessionId, routes.artifact.artifactId);
    const sourceData = structuredClone(
      getArtifactVersion(out.artifact.artifactId, 1).data,
    );
    const result = applyTargetedRefinement({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "output",
      organizationId: "org_m9d",
      projectId: "proj_m9d",
      artifactId: out.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      rawInstruction: "set creative_01 onImageCopy.headline to 'Fresh pulse'",
      preferredTargetPath: "creative_01.onImageCopy.headline",
      expectedSessionVersion: getCdfSession(session.sessionId)!.sessionVersion,
    });
    expect(result.status).toBe("applied");
    expect(result.sourceVersion).toBe(1);
    expect(result.newVersion).toBe(2);
    expect(getArtifactVersion(out.artifact.artifactId, 1).data).toEqual(
      sourceData,
    );
    const v2 = getArtifactVersion(out.artifact.artifactId, 2);
    expect(v2.lineage.parentVersion).toBe(1);
    expect(
      v2.lineage.sourceArtifacts.some(
        (r) =>
          r.relationship === "refines" &&
          r.artifactId === out.artifact.artifactId &&
          r.version === 1,
      ),
    ).toBe(true);
    expect(
      (v2.data as { onImageCopy?: { headline?: string } }).onImageCopy
        ?.headline,
    ).toBe("Fresh pulse");
  });

  it("B — target resolution by stable routeId SET_TEXT", () => {
    const session = startSession();
    const routes = createRoutes(session.sessionId);
    const result = applyTargetedRefinement({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      organizationId: "org_m9d",
      projectId: "proj_m9d",
      artifactId: routes.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      rawInstruction: "set route_02 headlineAngle to 'Quiet strength v2'",
      preferredTargetPath: "route_02.headlineAngle",
      expectedSessionVersion: getCdfSession(session.sessionId)!.sessionVersion,
    });
    expect(result.status).toBe("applied");
    const v2 = getArtifactVersion(routes.artifact.artifactId, 2);
    const r2 = (
      v2.data as { routes: Array<{ routeId: string; headlineAngle?: string }> }
    ).routes.find((r) => r.routeId === "route_02");
    expect(r2?.headlineAngle).toBe("Quiet strength v2");
    const r1 = (
      v2.data as { routes: Array<{ routeId: string; headlineAngle?: string }> }
    ).routes.find((r) => r.routeId === "route_01");
    expect(r1?.headlineAngle).toBe("Energy that fits Tuesday");
  });

  it("C/G — creativeId SET_TEXT onImageCopy", () => {
    const session = startSession();
    const routes = createRoutes(session.sessionId);
    const out = createOutput(session.sessionId, routes.artifact.artifactId);
    const result = applyTargetedRefinement({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "output",
      organizationId: "org_m9d",
      projectId: "proj_m9d",
      artifactId: out.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      rawInstruction: "set creative_01 onImageCopy.messageAngle to 'Daily spark'",
      preferredTargetPath: "creative_01.onImageCopy.messageAngle",
    });
    expect(result.status).toBe("applied");
    expect(
      (
        getArtifactVersion(out.artifact.artifactId, 2).data as {
          onImageCopy: { messageAngle: string };
        }
      ).onImageCopy.messageAngle,
    ).toBe("Daily spark");
  });

  it("D — ambiguous target → requires_clarification", () => {
    const session = startSession();
    const routes = createRoutes(session.sessionId);
    const result = applyTargetedRefinement({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      organizationId: "org_m9d",
      projectId: "proj_m9d",
      artifactId: routes.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      rawInstruction: "Change the second creative direction headline angle",
    });
    expect(result.status).toBe("requires_clarification");
    expect(result.clarificationCandidates?.length).toBeGreaterThan(0);
  });

  it("E/F/AE — unsupported raster/geometry; no full-generation fallback", () => {
    const session = startSession();
    const routes = createRoutes(session.sessionId);
    const out = createOutput(session.sessionId, routes.artifact.artifactId);
    expect(() =>
      applyTargetedRefinement({
        sessionId: session.sessionId,
        serviceId: "social-media",
        phaseId: "output",
        organizationId: "org_m9d",
        projectId: "proj_m9d",
        artifactId: out.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        rawInstruction: "Move the logo 20px left",
      }),
    ).toThrow(CdfRefinementError);
    expect(() =>
      applyTargetedRefinement({
        sessionId: session.sessionId,
        serviceId: "social-media",
        phaseId: "output",
        organizationId: "org_m9d",
        projectId: "proj_m9d",
        artifactId: out.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        rawInstruction: "OCR the image and invent layout",
      }),
    ).toThrow(/unsupported|unresolved|OCR/i);
    expect(listArtifactVersions(out.artifact.artifactId)).toHaveLength(1);
  });

  it("H/I — REPLACE_ASSET valid Vault; reject art_*", () => {
    const session = startSession();
    const routes = createRoutes(session.sessionId);
    const out = createOutput(session.sessionId, routes.artifact.artifactId);
    const ok = applyTargetedRefinement({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "output",
      organizationId: "org_m9d",
      projectId: "proj_m9d",
      artifactId: out.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      rawInstruction:
        "replace preview asset with 507f1f77bcf86cd799439099",
      preferredTargetPath: "creative_01.previewAssetRef",
    });
    expect(ok.status).toBe("applied");
    expect(
      (
        getArtifactVersion(out.artifact.artifactId, 2).data as {
          previewAssetRef: { vaultAssetId: string };
        }
      ).previewAssetRef.vaultAssetId,
    ).toBe("507f1f77bcf86cd799439099");

    expect(() =>
      applyTargetedRefinement({
        sessionId: session.sessionId,
        serviceId: "social-media",
        phaseId: "output",
        organizationId: "org_m9d",
        projectId: "proj_m9d",
        artifactId: out.artifact.artifactId,
        artifactVersion: 2,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        rawInstruction: "replace preview asset with art_legacy_123",
        preferredTargetPath: "creative_01.previewAssetRef",
      }),
    ).toThrow(/vault|ObjectId|asset/i);
  });

  it("J/K — schema / M4 failure → no version", () => {
    const session = startSession();
    const routes = createRoutes(session.sessionId);
    // Corrupt by targeting forbidden field via builder path is rejected before persist
    expect(() =>
      applyTargetedRefinement({
        sessionId: session.sessionId,
        serviceId: "social-media",
        phaseId: "routes",
        organizationId: "org_m9d",
        projectId: "proj_m9d",
        artifactId: routes.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
        rawInstruction: "set route_01 selectedRouteId to 'route_02'",
        preferredTargetPath: "route_01.selectedRouteId",
      }),
    ).toThrow(/forbidden|UNSUPPORTED|not editable/i);
    expect(listArtifactVersions(routes.artifact.artifactId)).toHaveLength(1);
  });

  it("L/M — successful refinement allocates new version; review path allowed by M4 accept", () => {
    const session = startSession();
    const routes = createRoutes(session.sessionId);
    const out = createOutput(session.sessionId, routes.artifact.artifactId);
    const result = applyTargetedRefinement({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "output",
      organizationId: "org_m9d",
      projectId: "proj_m9d",
      artifactId: out.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      rawInstruction: "set creative_01 compositionNotes to 'Tighter crop'",
      preferredTargetPath: "creative_01.compositionNotes",
    });
    expect(result.status).toBe("applied");
    expect(result.newVersion).toBe(2);
    expect(result.validation?.status).toMatch(/passed|review_required|skipped/);
  });

  it("P/Q/R/S — upstream pins preserved; generated only; selected/approved unchanged", () => {
    const session = startSession();
    const routes = createRoutes(session.sessionId);
    const out = createOutput(session.sessionId, routes.artifact.artifactId, 1);
    bindGeneratedSocialMediaArtifactToSession({
      sessionId: session.sessionId,
      phaseId: "output",
      artifactId: out.artifact.artifactId,
      version: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      expectedVersion: getCdfSession(session.sessionId)!.sessionVersion,
    });
    let s = getCdfSession(session.sessionId)!;
    s = applyArtifactEngineOnSelect({
      session: s,
      phaseId: "output",
      artifactId: out.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
    });
    s = applyArtifactEngineOnApprove({
      session: s,
      phaseId: "output",
      artifactId: out.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
    });
    persistCdfSession(s);

    // Create routes v2 HEAD — output must keep routes@v1 pin
    createVersion({
      artifactId: routes.artifact.artifactId,
      expectedLatestVersion: 1,
      data: fixtureSocialMediaRoutes() as never,
    });

    const result = applyTargetedRefinement({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "output",
      organizationId: "org_m9d",
      projectId: "proj_m9d",
      artifactId: out.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      rawInstruction: "set creative_01 onImageCopy.headline to 'Pinned dep'",
      preferredTargetPath: "creative_01.onImageCopy.headline",
      expectedSessionVersion: getCdfSession(session.sessionId)!.sessionVersion,
    });
    expect(result.status).toBe("applied");
    const v2 = getArtifactVersion(out.artifact.artifactId, 2);
    expect(
      (v2.data as { routesRef: { version: number } }).routesRef.version,
    ).toBe(1);

    const after = getCdfSession(session.sessionId)!;
    expect(
      after.generatedArtifacts?.find(
        (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      )?.version,
    ).toBe(2);
    expect(
      after.selectedArtifacts?.find(
        (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      )?.version,
    ).toBe(1);
    expect(
      after.approvedArtifacts?.find(
        (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      )?.version,
    ).toBe(1);
  });

  it("T/U/V/W — explicit select/approve of refined; refine selected/approved source", () => {
    const session = startSession();
    const routes = createRoutes(session.sessionId);
    const out = createOutput(session.sessionId, routes.artifact.artifactId);
    let s = applyArtifactEngineOnSelect({
      session: getCdfSession(session.sessionId)!,
      phaseId: "output",
      artifactId: out.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
    });
    s = applyArtifactEngineOnApprove({
      session: s,
      phaseId: "output",
      artifactId: out.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
    });
    persistCdfSession(s);

    const refined = applyTargetedRefinement({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "output",
      organizationId: "org_m9d",
      projectId: "proj_m9d",
      artifactId: out.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      rawInstruction: "set creative_01 compositionNotes to 'After approve'",
      preferredTargetPath: "creative_01.compositionNotes",
      expectedSessionVersion: getCdfSession(session.sessionId)!.sessionVersion,
    });
    expect(refined.newVersion).toBe(2);

    s = applyArtifactEngineOnSelect({
      session: getCdfSession(session.sessionId)!,
      phaseId: "output",
      artifactId: out.artifact.artifactId,
      artifactVersion: 2,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
    });
    s = applyArtifactEngineOnApprove({
      session: s,
      phaseId: "output",
      artifactId: out.artifact.artifactId,
      artifactVersion: 2,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
    });
    persistCdfSession(s);
    const final = getCdfSession(session.sessionId)!;
    expect(
      final.selectedArtifacts?.find(
        (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      )?.version,
    ).toBe(2);
    expect(
      final.approvedArtifacts?.find(
        (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      )?.version,
    ).toBe(2);
  });

  it("X — refinement of historical source version", () => {
    const session = startSession();
    const routes = createRoutes(session.sessionId);
    createVersion({
      artifactId: routes.artifact.artifactId,
      expectedLatestVersion: 1,
      data: fixtureSocialMediaRoutes() as never,
    });
    createVersion({
      artifactId: routes.artifact.artifactId,
      expectedLatestVersion: 2,
      data: fixtureSocialMediaRoutes() as never,
    });
    const result = applyTargetedRefinement({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      organizationId: "org_m9d",
      projectId: "proj_m9d",
      artifactId: routes.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      rawInstruction: "set route_01 name to 'Historical edit'",
      preferredTargetPath: "route_01.name",
    });
    expect(result.status).toBe("applied");
    expect(result.sourceVersion).toBe(1);
    expect(result.newVersion).toBe(4);
    expect(getArtifactVersion(routes.artifact.artifactId, 1).data).toBeTruthy();
  });

  it("Y — concurrent refinement CAS allocates distinct versions", () => {
    const session = startSession();
    const routes = createRoutes(session.sessionId);
    const r1 = applyTargetedRefinement({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      organizationId: "org_m9d",
      projectId: "proj_m9d",
      artifactId: routes.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      rawInstruction: "set route_01 name to 'Branch A'",
      preferredTargetPath: "route_01.name",
      expectedLatestVersion: 1,
    });
    const r2 = applyTargetedRefinement({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      organizationId: "org_m9d",
      projectId: "proj_m9d",
      artifactId: routes.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      rawInstruction: "set route_01 name to 'Branch B'",
      preferredTargetPath: "route_01.name",
      expectedLatestVersion: 1,
    });
    expect(r1.status).toBe("applied");
    expect(r2.status).toBe("applied");
    expect(r1.newVersion).not.toBe(r2.newVersion);
    expect(r1.sourceVersion).toBe(1);
    expect(r2.sourceVersion).toBe(1);
  });

  it("Z — refinement vs session select uses exact versions; no lost approved", () => {
    const session = startSession();
    const routes = createRoutes(session.sessionId);
    const out = createOutput(session.sessionId, routes.artifact.artifactId);
    let s = applyArtifactEngineOnApprove({
      session: getCdfSession(session.sessionId)!,
      phaseId: "output",
      artifactId: out.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
    });
    persistCdfSession(s);
    applyTargetedRefinement({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "output",
      organizationId: "org_m9d",
      projectId: "proj_m9d",
      artifactId: out.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      rawInstruction: "set creative_01 compositionNotes to 'Concurrent'",
      preferredTargetPath: "creative_01.compositionNotes",
      expectedSessionVersion: getCdfSession(session.sessionId)!.sessionVersion,
    });
    expect(
      getCdfSession(session.sessionId)!.approvedArtifacts?.find(
        (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      )?.version,
    ).toBe(1);
  });

  it("AA/AB — idempotent replay; payload conflict", () => {
    const session = startSession();
    const routes = createRoutes(session.sessionId);
    const first = applyTargetedRefinement({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      organizationId: "org_m9d",
      projectId: "proj_m9d",
      artifactId: routes.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      rawInstruction: "set route_01 name to 'Idem'",
      preferredTargetPath: "route_01.name",
      requestId: "m9d-idem-1",
    });
    expect(first.status).toBe("applied");
    const replay = applyTargetedRefinement({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      organizationId: "org_m9d",
      projectId: "proj_m9d",
      artifactId: routes.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      rawInstruction: "set route_01 name to 'Idem'",
      preferredTargetPath: "route_01.name",
      requestId: "m9d-idem-1",
    });
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.newVersion).toBe(first.newVersion);
    expect(listArtifactVersions(routes.artifact.artifactId)).toHaveLength(2);

    expect(() =>
      applyTargetedRefinement({
        sessionId: session.sessionId,
        serviceId: "social-media",
        phaseId: "routes",
        organizationId: "org_m9d",
        projectId: "proj_m9d",
        artifactId: routes.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
        rawInstruction: "set route_01 name to 'Different'",
        preferredTargetPath: "route_01.name",
        requestId: "m9d-idem-1",
      }),
    ).toThrow(/IDEMPOTENCY_CONFLICT/);
  });

  it("AC — stale session/context", () => {
    const session = startSession();
    const routes = createRoutes(session.sessionId);
    expect(() =>
      applyTargetedRefinement({
        sessionId: session.sessionId,
        serviceId: "social-media",
        phaseId: "routes",
        organizationId: "org_m9d",
        projectId: "proj_m9d",
        artifactId: routes.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
        rawInstruction: "set route_01 name to 'Stale'",
        preferredTargetPath: "route_01.name",
        expectedSessionVersion: 0,
      }),
    ).toThrow(/STALE_CONTEXT|version mismatch/i);
  });

  it("AD — never latest/HEAD as source", () => {
    const session = startSession();
    const routes = createRoutes(session.sessionId);
    createVersion({
      artifactId: routes.artifact.artifactId,
      expectedLatestVersion: 1,
      data: fixtureSocialMediaRoutes() as never,
    });
    const result = applyTargetedRefinement({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      organizationId: "org_m9d",
      projectId: "proj_m9d",
      artifactId: routes.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      rawInstruction: "set route_03 rationale to 'Exact v1 source'",
      preferredTargetPath: "route_03.rationale",
    });
    expect(result.sourceVersion).toBe(1);
    expect(result.newVersion).toBeGreaterThan(1);
  });

  it("AF — M9B ingest remains session-mutation-free", () => {
    const session = startSession();
    process.env.CDF_SOCIAL_MEDIA_INGEST = "1";
    const before = [...(getCdfSession(session.sessionId)!.generatedArtifacts ?? [])];
    const r = tryIngestSocialMediaCdfCompletion({
      forceOptIn: true,
      metadata: {
        cdfSessionId: session.sessionId,
        cdfServiceId: "social-media",
        cdfPhaseId: "platform",
      },
      rawOutput: fixtureSocialMediaPlatform(),
      executionId: "exec_m9d_af",
      organizationId: "org_m9d",
      projectId: "proj_m9d",
    });
    expect(r?.kind).toBe("accepted");
    expect(getCdfSession(session.sessionId)!.generatedArtifacts ?? []).toEqual(
      before,
    );
    delete process.env.CDF_SOCIAL_MEDIA_INGEST;
  });
});
