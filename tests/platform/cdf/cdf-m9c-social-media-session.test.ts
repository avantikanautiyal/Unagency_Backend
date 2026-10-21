/**
 * CDF M9C — Social Media session integration + selection / approval.
 */

import {
  applyCdfTransition,
  applyArtifactEngineOnSelect,
  applyArtifactEngineOnApprove,
  bindGeneratedSocialMediaArtifactToSession,
  bindSocialMediaGeneratedFromAttach,
  compareAndSwapCdfSession,
  createArtifact,
  createVersion,
  findSocialMediaExactRef,
  fixtureSocialMediaSizeReference,
  fixtureSocialMediaRoutes,
  fixtureSocialMediaOutput,
  getArtifactVersion,
  getCdfSession,
  ingestGenerationCompletion,
  markRejected,
  persistCdfSession,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  saveCdfSession,
  SOCIAL_MEDIA_ARTIFACT_KEYS,
  socialMediaDependencySatisfied,
  sessionHasSocialMediaCanonicalRefs,
  tryIngestSocialMediaCdfCompletion,
  CdfArtifactError,
  CdfGenerationArtifactError,
} from "../../../src/platform/cdf";

describe("CDF M9C Social Media Session Integration", () => {
  const prevIngest = process.env.CDF_SOCIAL_MEDIA_INGEST;

  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
    delete process.env.CDF_SOCIAL_MEDIA_INGEST;
  });

  afterAll(() => {
    if (prevIngest === undefined) delete process.env.CDF_SOCIAL_MEDIA_INGEST;
    else process.env.CDF_SOCIAL_MEDIA_INGEST = prevIngest;
  });

  function startSocialSession(ids?: {
    organizationId?: string;
    projectId?: string;
  }) {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "social-media",
      productMode: "ai",
      organizationId: ids?.organizationId ?? "org_social_m9c",
      projectId: ids?.projectId ?? "proj_social_m9c",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error("start");
    const briefed = applyCdfTransition({
      sessionId: started.value.session.sessionId,
      action: "submit_brief",
      brief: "Create a post for our new mango drink. Everyday energy.",
      expectedVersion: started.value.session.sessionVersion,
    });
    expect(briefed.ok).toBe(true);
    if (!briefed.ok) throw new Error("brief");
    return briefed.value.session;
  }

  function ingestSizeReference(session: {
    sessionId: string;
    sessionVersion: number;
  }, executionId = "exec_m9c_size") {
    return ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "size-reference",
      organizationId: "org_social_m9c",
      projectId: "proj_social_m9c",
      executionId,
      expectedSessionVersion: getCdfSession(session.sessionId)!.sessionVersion,
      rawOutput: fixtureSocialMediaSizeReference(),
      requirements: [],
    });
  }

  function mustBindGenerated(input: {
    sessionId: string;
    phaseId: string;
    artifactId: string;
    version: number;
    artifactKey: string;
    organizationId?: string;
    projectId?: string;
    expectedVersion?: number;
  }) {
    const live = getCdfSession(input.sessionId)!;
    const result = bindGeneratedSocialMediaArtifactToSession({
      ...input,
      expectedVersion:
        input.expectedVersion ?? live.sessionVersion,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    return result.session;
  }

  it("A — eligible M9B artifact → exact generatedArtifacts ref via M9C", () => {
    const session = startSocialSession();
    const out = ingestSizeReference(session, "exec_m9c_a2");
    const before = getCdfSession(session.sessionId)!;
    expect(before.generatedArtifacts ?? []).toHaveLength(0);

    const bound = bindSocialMediaGeneratedFromAttach({
      sessionId: session.sessionId,
      phaseId: "size-reference",
      attach: {
        cdfArtifactId: out.artifactId,
        cdfArtifactVersion: out.artifactVersion,
        cdfArtifactKey: out.artifactKey,
      },
      organizationId: "org_social_m9c",
      projectId: "proj_social_m9c",
    });
    expect(bound.ok).toBe(true);
    const s = getCdfSession(session.sessionId)!;
    expect(sessionHasSocialMediaCanonicalRefs(s)).toBe(true);
    expect(s.sessionVersion).toBe(before.sessionVersion + 1);
    const gen = s.generatedArtifacts?.find(
      (x) => x.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
    );
    expect(gen).toEqual({
      artifactId: out.artifactId,
      version: out.artifactVersion,
      phaseId: "size-reference",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
      role: "generated",
    });
    expect(s.selectedArtifacts ?? []).toHaveLength(0);
    expect(s.approvedArtifacts ?? []).toHaveLength(0);
  });

  it("B — M9B A@v3 while A@v4 is HEAD → session binds A@v3", () => {
    const session = startSocialSession();
    const created = createArtifact({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "size-reference",
      organizationId: "org_social_m9c",
      projectId: "proj_social_m9c",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
      artifactType: "config_choice",
      data: fixtureSocialMediaSizeReference() as never,
    });
    createVersion({
      artifactId: created.artifact.artifactId,
      expectedLatestVersion: 1,
      data: {
        ...fixtureSocialMediaSizeReference(),
        label: "Instagram v2",
      } as never,
    });
    createVersion({
      artifactId: created.artifact.artifactId,
      expectedLatestVersion: 2,
      data: {
        ...fixtureSocialMediaSizeReference(),
        label: "Instagram v3",
      } as never,
    });
    createVersion({
      artifactId: created.artifact.artifactId,
      expectedLatestVersion: 3,
      data: {
        ...fixtureSocialMediaSizeReference(),
        label: "Instagram v4 HEAD",
      } as never,
    });
    const head = getArtifactVersion(created.artifact.artifactId, 4);
    expect(head.version).toBe(4);

    mustBindGenerated({
      sessionId: session.sessionId,
      phaseId: "size-reference",
      artifactId: created.artifact.artifactId,
      version: 3,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
      organizationId: "org_social_m9c",
      projectId: "proj_social_m9c",
    });
    const gen = getCdfSession(session.sessionId)!.generatedArtifacts!.find(
      (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
    )!;
    expect(gen.version).toBe(3);
    expect(gen.artifactId).toBe(created.artifact.artifactId);
  });

  it("C/D — select updates selectedArtifacts only; does not approve", () => {
    const session = startSocialSession();
    const out = ingestSizeReference(session);
    mustBindGenerated({
      sessionId: session.sessionId,
      phaseId: "size-reference",
      artifactId: out.artifactId,
      version: out.artifactVersion,
      artifactKey: out.artifactKey,
    });
    let s = getCdfSession(session.sessionId)!;
    const approvedBefore = [...(s.approvedArtifacts ?? [])];
    s = applyArtifactEngineOnSelect({
      session: s,
      phaseId: "size-reference",
      artifactId: out.artifactId,
      artifactVersion: out.artifactVersion,
      artifactKey: out.artifactKey,
    });
    persistCdfSession(s);
    s = getCdfSession(session.sessionId)!;
    expect(
      s.selectedArtifacts?.find(
        (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
      ),
    ).toMatchObject({
      artifactId: out.artifactId,
      version: out.artifactVersion,
      role: "selected",
    });
    expect(s.approvedArtifacts ?? []).toEqual(approvedBefore);
    expect(getArtifactVersion(out.artifactId, out.artifactVersion).status).toBe(
      "selected",
    );
    expect(
      getArtifactVersion(out.artifactId, out.artifactVersion).status,
    ).not.toBe("approved");
  });

  it("E/F — approve updates approvedArtifacts; selected unchanged", () => {
    const session = startSocialSession();
    // Advance to output via createArtifact for output key
    const routes = createArtifact({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      organizationId: "org_social_m9c",
      projectId: "proj_social_m9c",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      artifactType: "text_choice",
      data: fixtureSocialMediaRoutes() as never,
    });
    const output = createArtifact({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "output",
      organizationId: "org_social_m9c",
      projectId: "proj_social_m9c",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      artifactType: "image",
      data: fixtureSocialMediaOutput(
        routes.artifact.artifactId,
        1,
      ) as never,
    });
    let s = getCdfSession(session.sessionId)!;
    s = applyArtifactEngineOnSelect({
      session: s,
      phaseId: "output",
      artifactId: output.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
    });
    persistCdfSession(s);
    s = applyArtifactEngineOnApprove({
      session: getCdfSession(session.sessionId)!,
      phaseId: "output",
      artifactId: output.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
    });
    persistCdfSession(s);
    s = getCdfSession(session.sessionId)!;
    expect(
      s.approvedArtifacts?.find(
        (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      ),
    ).toMatchObject({
      artifactId: output.artifact.artifactId,
      version: 1,
      role: "approved",
    });
    expect(
      s.selectedArtifacts?.find(
        (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      )?.version,
    ).toBe(1);
  });

  it("G/H — new generation does not silently replace selection or approval", () => {
    const session = startSocialSession();
    const created = createArtifact({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "size-reference",
      organizationId: "org_social_m9c",
      projectId: "proj_social_m9c",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
      artifactType: "config_choice",
      data: fixtureSocialMediaSizeReference() as never,
    });
    let s = getCdfSession(session.sessionId)!;
    s = applyArtifactEngineOnSelect({
      session: s,
      phaseId: "size-reference",
      artifactId: created.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
    });
    persistCdfSession(s);

    createVersion({
      artifactId: created.artifact.artifactId,
      expectedLatestVersion: 1,
      data: { ...fixtureSocialMediaSizeReference(), label: "v2" } as never,
    });
    mustBindGenerated({
      sessionId: session.sessionId,
      phaseId: "size-reference",
      artifactId: created.artifact.artifactId,
      version: 2,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
    });
    s = getCdfSession(session.sessionId)!;
    expect(
      s.selectedArtifacts?.find(
        (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
      )?.version,
    ).toBe(1);
    expect(
      s.generatedArtifacts?.find(
        (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
      )?.version,
    ).toBe(2);

    // Approval path for output
    const output = createArtifact({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "output",
      organizationId: "org_social_m9c",
      projectId: "proj_social_m9c",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      artifactType: "image",
      data: fixtureSocialMediaOutput() as never,
    });
    s = applyArtifactEngineOnApprove({
      session: getCdfSession(session.sessionId)!,
      phaseId: "output",
      artifactId: output.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
    });
    persistCdfSession(s);
    createVersion({
      artifactId: output.artifact.artifactId,
      expectedLatestVersion: 1,
      data: fixtureSocialMediaOutput() as never,
    });
    mustBindGenerated({
      sessionId: session.sessionId,
      phaseId: "output",
      artifactId: output.artifact.artifactId,
      version: 2,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
    });
    s = getCdfSession(session.sessionId)!;
    expect(
      s.approvedArtifacts?.find(
        (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      )?.version,
    ).toBe(1);
  });

  it("I/J — explicit reselection and reapproval update pins", () => {
    const session = startSocialSession();
    const created = createArtifact({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "size-reference",
      organizationId: "org_social_m9c",
      projectId: "proj_social_m9c",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
      artifactType: "config_choice",
      data: fixtureSocialMediaSizeReference() as never,
    });
    let s = getCdfSession(session.sessionId)!;
    s = applyArtifactEngineOnSelect({
      session: s,
      phaseId: "size-reference",
      artifactId: created.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
    });
    persistCdfSession(s);
    createVersion({
      artifactId: created.artifact.artifactId,
      expectedLatestVersion: 1,
      data: { ...fixtureSocialMediaSizeReference(), label: "v2" } as never,
    });
    s = applyArtifactEngineOnSelect({
      session: getCdfSession(session.sessionId)!,
      phaseId: "size-reference",
      artifactId: created.artifact.artifactId,
      artifactVersion: 2,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
    });
    persistCdfSession(s);
    expect(
      getCdfSession(session.sessionId)!.selectedArtifacts!.find(
        (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
      )!.version,
    ).toBe(2);

    const output = createArtifact({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "output",
      organizationId: "org_social_m9c",
      projectId: "proj_social_m9c",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      artifactType: "image",
      data: fixtureSocialMediaOutput() as never,
    });
    s = applyArtifactEngineOnApprove({
      session: getCdfSession(session.sessionId)!,
      phaseId: "output",
      artifactId: output.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
    });
    persistCdfSession(s);
    createVersion({
      artifactId: output.artifact.artifactId,
      expectedLatestVersion: 1,
      data: fixtureSocialMediaOutput() as never,
    });
    s = applyArtifactEngineOnApprove({
      session: getCdfSession(session.sessionId)!,
      phaseId: "output",
      artifactId: output.artifact.artifactId,
      artifactVersion: 2,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
    });
    persistCdfSession(s);
    expect(
      getCdfSession(session.sessionId)!.approvedArtifacts!.find(
        (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      )!.version,
    ).toBe(2);
  });

  it("K — historical ArtifactVersion immutable after newer select/approve", () => {
    const session = startSocialSession();
    const created = createArtifact({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "size-reference",
      organizationId: "org_social_m9c",
      projectId: "proj_social_m9c",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
      artifactType: "config_choice",
      data: fixtureSocialMediaSizeReference() as never,
    });
    const v1Data = structuredClone(
      getArtifactVersion(created.artifact.artifactId, 1).data,
    );
    createVersion({
      artifactId: created.artifact.artifactId,
      expectedLatestVersion: 1,
      data: { ...fixtureSocialMediaSizeReference(), label: "newer" } as never,
    });
    let s = getCdfSession(session.sessionId)!;
    s = applyArtifactEngineOnSelect({
      session: s,
      phaseId: "size-reference",
      artifactId: created.artifact.artifactId,
      artifactVersion: 2,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
    });
    persistCdfSession(s);
    expect(getArtifactVersion(created.artifact.artifactId, 1).data).toEqual(
      v1Data,
    );
  });

  it("L/M — dependency pinning uses approved exact pin; never latest/HEAD", () => {
    const session = startSocialSession();
    const routes = createArtifact({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      organizationId: "org_social_m9c",
      projectId: "proj_social_m9c",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      artifactType: "text_choice",
      data: fixtureSocialMediaRoutes() as never,
    });
    let s = getCdfSession(session.sessionId)!;
    s = applyArtifactEngineOnSelect({
      session: s,
      phaseId: "routes",
      artifactId: routes.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
    });
    s = applyArtifactEngineOnApprove({
      session: s,
      phaseId: "routes",
      artifactId: routes.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
    });
    persistCdfSession(s);
    createVersion({
      artifactId: routes.artifact.artifactId,
      expectedLatestVersion: 1,
      data: fixtureSocialMediaRoutes() as never,
    });
    // v2 is HEAD — pin must stay v1 (approved)
    const pin = findSocialMediaExactRef(
      getCdfSession(session.sessionId)!,
      SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      "approved",
    );
    expect(pin).toEqual({
      artifactId: routes.artifact.artifactId,
      version: 1,
    });
    expect(JSON.stringify(pin)).not.toMatch(/latest|HEAD/i);
    expect(
      socialMediaDependencySatisfied(getCdfSession(session.sessionId)!, "routes")
        .ok,
    ).toBe(true);
  });

  it("N — tenant/project isolation: foreign artifact cannot bind", () => {
    const sessionA = startSocialSession({
      organizationId: "org_a",
      projectId: "proj_a",
    });
    const sessionB = startSocialSession({
      organizationId: "org_b",
      projectId: "proj_b",
    });
    const foreign = createArtifact({
      sessionId: sessionB.sessionId,
      serviceId: "social-media",
      phaseId: "size-reference",
      organizationId: "org_b",
      projectId: "proj_b",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
      artifactType: "config_choice",
      data: fixtureSocialMediaSizeReference() as never,
    });
    expect(() =>
      bindGeneratedSocialMediaArtifactToSession({
        sessionId: sessionA.sessionId,
        phaseId: "size-reference",
        artifactId: foreign.artifact.artifactId,
        version: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
        organizationId: "org_a",
        projectId: "proj_a",
      }),
    ).toThrow(CdfArtifactError);
  });

  it("O — missing exact version → typed error", () => {
    const session = startSocialSession();
    const created = createArtifact({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "size-reference",
      organizationId: "org_social_m9c",
      projectId: "proj_social_m9c",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
      artifactType: "config_choice",
      data: fixtureSocialMediaSizeReference() as never,
    });
    expect(() =>
      bindGeneratedSocialMediaArtifactToSession({
        sessionId: session.sessionId,
        phaseId: "size-reference",
        artifactId: created.artifact.artifactId,
        version: 999,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
      }),
    ).toThrow(/ARTIFACT_VERSION_NOT_FOUND/);
  });

  it("P — rejected ArtifactVersion cannot be approved", () => {
    const session = startSocialSession();
    const output = createArtifact({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "output",
      organizationId: "org_social_m9c",
      projectId: "proj_social_m9c",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      artifactType: "image",
      data: fixtureSocialMediaOutput() as never,
    });
    markRejected(output.artifact.artifactId, 1, {
      organizationId: "org_social_m9c",
      projectId: "proj_social_m9c",
    });
    expect(() =>
      applyArtifactEngineOnApprove({
        session: getCdfSession(session.sessionId)!,
        phaseId: "output",
        artifactId: output.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      }),
    ).toThrow(/ARTIFACT_INVALID_TRANSITION|rejected/);
  });

  it("Q/R — idempotent repeated selection and approval via requestId", () => {
    const session = startSocialSession();
    const out = ingestSizeReference(session);
    mustBindGenerated({
      sessionId: session.sessionId,
      phaseId: "size-reference",
      artifactId: out.artifactId,
      version: out.artifactVersion,
      artifactKey: out.artifactKey,
    });
    const first = applyCdfTransition({
      sessionId: session.sessionId,
      action: "select_route",
      routeIndex: 0,
      expectedVersion: getCdfSession(session.sessionId)!.sessionVersion,
      artifactId: out.artifactId,
      artifactVersion: out.artifactVersion,
      artifactKey: out.artifactKey,
      requestId: "m9c-select-idem-1",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("select");
    const replay = applyCdfTransition({
      sessionId: session.sessionId,
      action: "select_route",
      routeIndex: 0,
      expectedVersion: first.value.session.sessionVersion,
      artifactId: out.artifactId,
      artifactVersion: out.artifactVersion,
      artifactKey: out.artifactKey,
      requestId: "m9c-select-idem-1",
    });
    expect(replay.ok).toBe(true);
    if (!replay.ok) throw new Error("replay");
    expect(replay.value.idempotentReplay).toBe(true);
    expect(replay.value.session.sessionVersion).toBe(
      first.value.session.sessionVersion,
    );

    // Approve idempotency via SM action on output phase (manual advance).
    let cur = getCdfSession(session.sessionId)!;
    const outputArt = createArtifact({
      sessionId: cur.sessionId,
      serviceId: "social-media",
      phaseId: "output",
      organizationId: "org_social_m9c",
      projectId: "proj_social_m9c",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      artifactType: "image",
      data: fixtureSocialMediaOutput() as never,
    });
    // Place session on output; satisfy routes dep with selected pin.
    const routesArt = createArtifact({
      sessionId: cur.sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      organizationId: "org_social_m9c",
      projectId: "proj_social_m9c",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      artifactType: "text_choice",
      data: fixtureSocialMediaRoutes() as never,
    });
    cur = applyArtifactEngineOnSelect({
      session: cur,
      phaseId: "routes",
      artifactId: routesArt.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
    });
    cur = {
      ...cur,
      phaseId: "output",
      phaseIndex: 3,
      status: "active",
    };
    saveCdfSession(cur);

    const approve1 = applyCdfTransition({
      sessionId: cur.sessionId,
      action: "approve",
      expectedVersion: getCdfSession(cur.sessionId)!.sessionVersion,
      artifactId: outputArt.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      requestId: "m9c-approve-idem-1",
    });
    expect(approve1.ok).toBe(true);
    if (!approve1.ok) throw new Error(`approve: ${approve1.error.message}`);
    const approveReplay = applyCdfTransition({
      sessionId: cur.sessionId,
      action: "approve",
      expectedVersion: approve1.value.session.sessionVersion,
      artifactId: outputArt.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      requestId: "m9c-approve-idem-1",
    });
    expect(approveReplay.ok).toBe(true);
    if (!approveReplay.ok) throw new Error("approve replay");
    expect(approveReplay.value.idempotentReplay).toBe(true);
  });

  it("S — idempotency payload conflict on generation (existing CDF mechanism)", () => {
    const session = startSocialSession();
    ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "size-reference",
      organizationId: "org_social_m9c",
      projectId: "proj_social_m9c",
      executionId: "exec_m9c_idem",
      expectedSessionVersion: session.sessionVersion,
      rawOutput: fixtureSocialMediaSizeReference(),
      requirements: [],
      requestId: "m9c_gen_idem_1",
    });
    expect(() =>
      ingestGenerationCompletion({
        sessionId: session.sessionId,
        serviceId: "social-media",
        phaseId: "size-reference",
        organizationId: "org_social_m9c",
        projectId: "proj_social_m9c",
        executionId: "exec_m9c_idem",
        expectedSessionVersion: getCdfSession(session.sessionId)!.sessionVersion,
        rawOutput: {
          ...fixtureSocialMediaSizeReference(),
          label: "Different payload",
        },
        requirements: [],
        requestId: "m9c_gen_idem_1",
      }),
    ).toThrow(CdfGenerationArtifactError);
    expect(() =>
      ingestGenerationCompletion({
        sessionId: session.sessionId,
        serviceId: "social-media",
        phaseId: "size-reference",
        organizationId: "org_social_m9c",
        projectId: "proj_social_m9c",
        executionId: "exec_m9c_idem2",
        expectedSessionVersion: getCdfSession(session.sessionId)!.sessionVersion,
        rawOutput: {
          ...fixtureSocialMediaSizeReference(),
          label: "Different payload",
        },
        requirements: [],
        requestId: "m9c_gen_idem_1",
      }),
    ).toThrow(/IDEMPOTENCY_CONFLICT/);
  });

  it("T — SESSION_VERSION_CONFLICT on concurrent select", () => {
    const session = startSocialSession();
    const out = ingestSizeReference(session);
    mustBindGenerated({
      sessionId: session.sessionId,
      phaseId: "size-reference",
      artifactId: out.artifactId,
      version: out.artifactVersion,
      artifactKey: out.artifactKey,
    });
    const v = getCdfSession(session.sessionId)!.sessionVersion;
    const first = applyCdfTransition({
      sessionId: session.sessionId,
      action: "select_route",
      // "Use Platform Size" — no typed input required.
      routeIndex: 1,
      expectedVersion: v,
      artifactId: out.artifactId,
      artifactVersion: out.artifactVersion,
      artifactKey: out.artifactKey,
    });
    expect(first.ok).toBe(true);
    const stale = applyCdfTransition({
      sessionId: session.sessionId,
      action: "select_route",
      routeIndex: 1,
      expectedVersion: v,
      artifactId: out.artifactId,
      artifactVersion: out.artifactVersion,
      artifactKey: out.artifactKey,
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) throw new Error("expected conflict");
    expect(stale.error.cdfCode).toBe("SESSION_VERSION_CONFLICT");
  });

  it("INVARIANT — M9B ingest alone does not mutate session refs", () => {
    const session = startSocialSession();
    process.env.CDF_SOCIAL_MEDIA_INGEST = "1";
    const before = getCdfSession(session.sessionId)!;
    const genBefore = [...(before.generatedArtifacts ?? [])];
    const r = tryIngestSocialMediaCdfCompletion({
      metadata: {
        cdfSessionId: session.sessionId,
        cdfServiceId: "social-media",
        cdfPhaseId: "size-reference",
      },
      rawOutput: fixtureSocialMediaSizeReference(),
      executionId: "exec_m9c_m9b_boundary",
      organizationId: "org_social_m9c",
      projectId: "proj_social_m9c",
    });
    expect(r?.kind).toBe("accepted");
    const after = getCdfSession(session.sessionId)!;
    expect(after.generatedArtifacts ?? []).toEqual(genBefore);
  });

  it("select-only dependency: selected pin satisfies; generated-only does not", () => {
    const session = startSocialSession();
    const plat = ingestSizeReference(session);
    mustBindGenerated({
      sessionId: session.sessionId,
      phaseId: "size-reference",
      artifactId: plat.artifactId,
      version: plat.artifactVersion,
      artifactKey: plat.artifactKey,
    });
    expect(
      socialMediaDependencySatisfied(getCdfSession(session.sessionId)!, "size-reference"),
    ).toEqual({ ok: false, reason: "not_approved" });

    let s = applyArtifactEngineOnSelect({
      session: getCdfSession(session.sessionId)!,
      phaseId: "size-reference",
      artifactId: plat.artifactId,
      artifactVersion: plat.artifactVersion,
      artifactKey: plat.artifactKey,
    });
    persistCdfSession(s);
    expect(
      socialMediaDependencySatisfied(getCdfSession(session.sessionId)!, "size-reference")
        .ok,
    ).toBe(true);
  });

  describe("HARDENING — CAS generatedArtifacts + dependency roles", () => {
    it("A — concurrent generated binds: one wins, one SESSION_VERSION_CONFLICT", () => {
      const session = startSocialSession();
      const a = createArtifact({
        sessionId: session.sessionId,
        serviceId: "social-media",
        phaseId: "size-reference",
        organizationId: "org_social_m9c",
        projectId: "proj_social_m9c",
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
        artifactType: "config_choice",
        data: fixtureSocialMediaSizeReference() as never,
      });
      const b = createArtifact({
        sessionId: session.sessionId,
        serviceId: "social-media",
        phaseId: "routes",
        organizationId: "org_social_m9c",
        projectId: "proj_social_m9c",
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
        artifactType: "text_choice",
        data: fixtureSocialMediaRoutes() as never,
      });
      const v = getCdfSession(session.sessionId)!.sessionVersion;
      const first = bindGeneratedSocialMediaArtifactToSession({
        sessionId: session.sessionId,
        phaseId: "size-reference",
        artifactId: a.artifact.artifactId,
        version: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
        expectedVersion: v,
      });
      expect(first.ok).toBe(true);
      const second = bindGeneratedSocialMediaArtifactToSession({
        sessionId: session.sessionId,
        phaseId: "routes",
        artifactId: b.artifact.artifactId,
        version: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
        expectedVersion: v,
      });
      expect(second.ok).toBe(false);
      if (second.ok) throw new Error("expected conflict");
      expect(second.code).toBe("SESSION_VERSION_CONFLICT");
      const s = getCdfSession(session.sessionId)!;
      expect(
        s.generatedArtifacts?.some(
          (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
        ),
      ).toBe(true);
      expect(
        s.generatedArtifacts?.some(
          (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
        ),
      ).toBe(false);
    });

    it("B — generated bind concurrent with select: stale select conflicts", () => {
      const session = startSocialSession();
      const out = ingestSizeReference(session);
      const v = getCdfSession(session.sessionId)!.sessionVersion;
      const bound = bindGeneratedSocialMediaArtifactToSession({
        sessionId: session.sessionId,
        phaseId: "size-reference",
        artifactId: out.artifactId,
        version: out.artifactVersion,
        artifactKey: out.artifactKey,
        expectedVersion: v,
      });
      expect(bound.ok).toBe(true);
      const staleSelect = applyCdfTransition({
        sessionId: session.sessionId,
        action: "select_route",
        routeIndex: 0,
        expectedVersion: v,
        artifactId: out.artifactId,
        artifactVersion: out.artifactVersion,
        artifactKey: out.artifactKey,
      });
      expect(staleSelect.ok).toBe(false);
      if (staleSelect.ok) throw new Error("expected conflict");
      expect(staleSelect.error.cdfCode).toBe("SESSION_VERSION_CONFLICT");
    });

    it("C — generated bind concurrent with approve: stale approve conflicts", () => {
      const session = startSocialSession();
      const routes = createArtifact({
        sessionId: session.sessionId,
        serviceId: "social-media",
        phaseId: "routes",
        organizationId: "org_social_m9c",
        projectId: "proj_social_m9c",
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
        artifactType: "text_choice",
        data: fixtureSocialMediaRoutes() as never,
      });
      let s = applyArtifactEngineOnSelect({
        session: getCdfSession(session.sessionId)!,
        phaseId: "routes",
        artifactId: routes.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      });
      s = {
        ...s,
        phaseId: "output",
        phaseIndex: 3,
        status: "active",
      };
      saveCdfSession(s);
      const output = createArtifact({
        sessionId: session.sessionId,
        serviceId: "social-media",
        phaseId: "output",
        organizationId: "org_social_m9c",
        projectId: "proj_social_m9c",
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        artifactType: "image",
        data: fixtureSocialMediaOutput(routes.artifact.artifactId, 1) as never,
      });
      const v = getCdfSession(session.sessionId)!.sessionVersion;
      const bound = bindGeneratedSocialMediaArtifactToSession({
        sessionId: session.sessionId,
        phaseId: "output",
        artifactId: output.artifact.artifactId,
        version: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        expectedVersion: v,
      });
      expect(bound.ok).toBe(true);
      const staleApprove = applyCdfTransition({
        sessionId: session.sessionId,
        action: "approve",
        expectedVersion: v,
        artifactId: output.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      });
      expect(staleApprove.ok).toBe(false);
      if (staleApprove.ok) throw new Error("expected conflict");
      expect(staleApprove.error.cdfCode).toBe("SESSION_VERSION_CONFLICT");
    });

    it("D/E/F — stale expectedVersion; sequential writers; no lost refs", () => {
      const session = startSocialSession();
      const plat = createArtifact({
        sessionId: session.sessionId,
        serviceId: "social-media",
        phaseId: "size-reference",
        organizationId: "org_social_m9c",
        projectId: "proj_social_m9c",
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
        artifactType: "config_choice",
        data: fixtureSocialMediaSizeReference() as never,
      });
      const routes = createArtifact({
        sessionId: session.sessionId,
        serviceId: "social-media",
        phaseId: "routes",
        organizationId: "org_social_m9c",
        projectId: "proj_social_m9c",
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
        artifactType: "text_choice",
        data: fixtureSocialMediaRoutes() as never,
      });
      const stale = bindGeneratedSocialMediaArtifactToSession({
        sessionId: session.sessionId,
        phaseId: "size-reference",
        artifactId: plat.artifact.artifactId,
        version: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
        expectedVersion: 0,
      });
      expect(stale.ok).toBe(false);
      if (stale.ok) throw new Error("expected conflict");
      expect(stale.code).toBe("SESSION_VERSION_CONFLICT");

      const v1 = getCdfSession(session.sessionId)!.sessionVersion;
      mustBindGenerated({
        sessionId: session.sessionId,
        phaseId: "size-reference",
        artifactId: plat.artifact.artifactId,
        version: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
        expectedVersion: v1,
      });
      const afterPlat = getCdfSession(session.sessionId)!;
      let s = applyArtifactEngineOnSelect({
        session: afterPlat,
        phaseId: "size-reference",
        artifactId: plat.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
      });
      const swapped = compareAndSwapCdfSession(
        session.sessionId,
        afterPlat.sessionVersion,
        s,
      );
      expect(swapped).toBeTruthy();

      mustBindGenerated({
        sessionId: session.sessionId,
        phaseId: "routes",
        artifactId: routes.artifact.artifactId,
        version: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      });
      const final = getCdfSession(session.sessionId)!;
      expect(
        final.generatedArtifacts?.find(
          (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
        )?.version,
      ).toBe(1);
      expect(
        final.generatedArtifacts?.find(
          (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
        )?.version,
      ).toBe(1);
      expect(
        final.selectedArtifacts?.find(
          (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
        )?.version,
      ).toBe(1);
    });

    it("idempotent same generated bind — no duplicate ref, no version bump", () => {
      const session = startSocialSession();
      const out = ingestSizeReference(session);
      const first = mustBindGenerated({
        sessionId: session.sessionId,
        phaseId: "size-reference",
        artifactId: out.artifactId,
        version: out.artifactVersion,
        artifactKey: out.artifactKey,
      });
      const v = first.sessionVersion;
      const replay = bindGeneratedSocialMediaArtifactToSession({
        sessionId: session.sessionId,
        phaseId: "size-reference",
        artifactId: out.artifactId,
        version: out.artifactVersion,
        artifactKey: out.artifactKey,
        expectedVersion: v,
      });
      expect(replay.ok).toBe(true);
      if (!replay.ok) throw new Error(replay.message);
      expect(replay.idempotentReplay).toBe(true);
      expect(replay.session.sessionVersion).toBe(v);
      expect(
        (replay.session.generatedArtifacts ?? []).filter(
          (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
        ),
      ).toHaveLength(1);
    });

    it("approved-required cannot be satisfied by selected/generated", () => {
      const session = startSocialSession();
      const routes = createArtifact({
        sessionId: session.sessionId,
        serviceId: "social-media",
        phaseId: "routes",
        organizationId: "org_social_m9c",
        projectId: "proj_social_m9c",
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
        artifactType: "text_choice",
        data: fixtureSocialMediaRoutes() as never,
      });
      mustBindGenerated({
        sessionId: session.sessionId,
        phaseId: "routes",
        artifactId: routes.artifact.artifactId,
        version: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      });
      let s = applyArtifactEngineOnSelect({
        session: getCdfSession(session.sessionId)!,
        phaseId: "routes",
        artifactId: routes.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      });
      persistCdfSession(s);
      s = getCdfSession(session.sessionId)!;

      expect(
        findSocialMediaExactRef(
          s,
          SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
          "approved",
        ),
      ).toBeUndefined();
      expect(
        findSocialMediaExactRef(
          s,
          SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
          "selected_or_approved",
        ),
      ).toEqual({
        artifactId: routes.artifact.artifactId,
        version: 1,
      });
      // generated-only lookup excluded from default generation pins
      expect(
        findSocialMediaExactRef(
          {
            ...s,
            selectedArtifacts: [],
            approvedArtifacts: [],
          },
          SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
          "selected_or_approved",
        ),
      ).toBeUndefined();
      expect(
        findSocialMediaExactRef(
          {
            ...s,
            selectedArtifacts: [],
            approvedArtifacts: [],
          },
          SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
          "generated_or_above",
        )?.version,
      ).toBe(1);

      // output approve-required gate: selected routes do NOT approve output dep
      const output = createArtifact({
        sessionId: session.sessionId,
        serviceId: "social-media",
        phaseId: "output",
        organizationId: "org_social_m9c",
        projectId: "proj_social_m9c",
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        artifactType: "image",
        data: fixtureSocialMediaOutput(routes.artifact.artifactId, 1) as never,
      });
      mustBindGenerated({
        sessionId: session.sessionId,
        phaseId: "output",
        artifactId: output.artifact.artifactId,
        version: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      });
      s = applyArtifactEngineOnSelect({
        session: getCdfSession(session.sessionId)!,
        phaseId: "output",
        artifactId: output.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      });
      persistCdfSession(s);
      expect(
        socialMediaDependencySatisfied(
          getCdfSession(session.sessionId)!,
          "output",
        ),
      ).toEqual({ ok: false, reason: "not_approved" });
      expect(
        findSocialMediaExactRef(
          getCdfSession(session.sessionId)!,
          SOCIAL_MEDIA_ARTIFACT_KEYS.output,
          "approved",
        ),
      ).toBeUndefined();
    });
  });
});
