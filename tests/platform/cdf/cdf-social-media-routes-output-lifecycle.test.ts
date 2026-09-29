/**
 * CDF Social Media — routes → output canonical lifecycle continuity (A–I).
 *
 * Guards the end-to-end invariant:
 *   ArtifactVersion X@V
 *     → generatedArtifacts X@V (M9C)
 *     → selectedArtifacts X@V (select_route)
 *     → approvedArtifacts X@V (approve)
 *     → output dependency resolves X@V (never latest / generated-only)
 */

import {
  applyCdfTransition,
  applyArtifactEngineOnApprove,
  applyArtifactEngineOnSelect,
  bindGeneratedSocialMediaArtifactToSession,
  bindSocialMediaGeneratedFromAttach,
  createArtifact,
  fixtureSocialMediaPlatform,
  fixtureSocialMediaSizeReference,
  getCdfSession,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  SOCIAL_MEDIA_ARTIFACT_KEYS,
  tryIngestSocialMediaCdfCompletion,
} from "../../../src/platform/cdf";
import { resolveUpstreamArtifactsForPhase } from "../../../src/platform/cdf/generation-context/resolve-dependencies";

describe("CDF Social Media routes→output lifecycle continuity", () => {
  const prevIngest = process.env.CDF_SOCIAL_MEDIA_INGEST;
  const prevForce = process.env.CDF_SOCIAL_MEDIA_FORCE_LEGACY_ONLY;

  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
    delete process.env.CDF_SOCIAL_MEDIA_FORCE_LEGACY_ONLY;
  });

  afterAll(() => {
    if (prevIngest === undefined) delete process.env.CDF_SOCIAL_MEDIA_INGEST;
    else process.env.CDF_SOCIAL_MEDIA_INGEST = prevIngest;
    if (prevForce === undefined) {
      delete process.env.CDF_SOCIAL_MEDIA_FORCE_LEGACY_ONLY;
    } else {
      process.env.CDF_SOCIAL_MEDIA_FORCE_LEGACY_ONLY = prevForce;
    }
  });

  const structuredRoutes = {
    routes: [
      {
        name: "Everyday Energy",
        creativeIdea: "Bright splash",
        visualTreatment: "High-key",
        headlineAngle: "Energy that fits Tuesday",
      },
      {
        name: "Quiet Power",
        creativeIdea: "Soft gradient",
        visualTreatment: "Muted",
        headlineAngle: "Steady fuel",
      },
      {
        name: "Playful Burst",
        creativeIdea: "Fruit confetti",
        visualTreatment: "Max color",
        headlineAngle: "Sip the spark",
      },
    ],
  };

  function startSocialSession() {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "social-media",
      productMode: "ai",
      organizationId: "org_sm_lifecycle",
      projectId: "proj_sm_lifecycle",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error("start");
    const briefed = applyCdfTransition({
      sessionId: started.value.session.sessionId,
      action: "submit_brief",
      brief: "Mango drink social — everyday energy for Tuesday.",
      expectedVersion: started.value.session.sessionVersion,
    });
    expect(briefed.ok).toBe(true);
    if (!briefed.ok) throw new Error("brief");
    return briefed.value.session;
  }

  function pinCanonicalConfig(
    sessionId: string,
    phaseId: "platform" | "size-reference",
    data: Record<string, unknown>,
  ) {
    expect(getCdfSession(sessionId)!.phaseId).toBe(phaseId);
    const key =
      phaseId === "platform"
        ? SOCIAL_MEDIA_ARTIFACT_KEYS.platform
        : SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference;
    const created = createArtifact({
      sessionId,
      serviceId: "social-media",
      phaseId,
      organizationId: "org_sm_lifecycle",
      projectId: "proj_sm_lifecycle",
      artifactKey: key,
      artifactType: "config_choice",
      data: data as never,
    });
    const bound = bindGeneratedSocialMediaArtifactToSession({
      sessionId,
      phaseId,
      artifactId: created.artifact.artifactId,
      version: 1,
      artifactKey: key,
      expectedVersion: getCdfSession(sessionId)!.sessionVersion,
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok) throw new Error(`bind ${phaseId}`);
    const selected = applyCdfTransition({
      sessionId,
      action: "select_route",
      routeIndex: 0,
      routeInput: "1080 × 1350 px",
      expectedVersion: getCdfSession(sessionId)!.sessionVersion,
      artifactId: created.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: key,
    });
    expect(selected.ok).toBe(true);
    if (!selected.ok) throw new Error(`select ${phaseId}: ${selected.error.message}`);
    return selected.value.session;
  }

  /** Advance to routes with canonical platform + size-reference pins. */
  function advanceToRoutesCanonical(sessionId: string) {
    pinCanonicalConfig(
      sessionId,
      "platform",
      fixtureSocialMediaPlatform(),
    );
    pinCanonicalConfig(
      sessionId,
      "size-reference",
      fixtureSocialMediaSizeReference(),
    );
    const live = getCdfSession(sessionId)!;
    expect(live.phaseId).toBe("routes");
    return live;
  }

  /** Legacy-only advance (no canonical pins) — for ingest-disabled cases. */
  function advanceToRoutesLegacy(sessionId: string) {
    let live = getCdfSession(sessionId)!;
    expect(live.phaseId).toBe("platform");
    let r = applyCdfTransition({
      sessionId,
      action: "select_route",
      routeIndex: 0,
      routeInput: "1080 × 1350 px",
      expectedVersion: live.sessionVersion,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("select platform");
    live = r.value.session;
    expect(live.phaseId).toBe("size-reference");
    r = applyCdfTransition({
      sessionId,
      action: "select_route",
      routeIndex: 0,
      routeInput: "1080 × 1350 px",
      expectedVersion: live.sessionVersion,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("select size");
    live = r.value.session;
    expect(live.phaseId).toBe("routes");
    return live;
  }

  function ingestRoutesAccepted(sessionId: string, executionId: string) {
    process.env.CDF_SOCIAL_MEDIA_INGEST = "true";
    advanceToRoutesCanonical(sessionId);
    const result = tryIngestSocialMediaCdfCompletion({
      metadata: {
        cdfSessionId: sessionId,
        cdfServiceId: "social-media",
        cdfPhaseId: "routes",
      },
      rawOutput: structuredRoutes,
      executionId,
      organizationId: "org_sm_lifecycle",
      projectId: "proj_sm_lifecycle",
      forceOptIn: true,
    });
    expect(result).toBeTruthy();
    expect(result && "kind" in result && result.kind === "accepted").toBe(true);
    if (!result || !("kind" in result) || result.kind !== "accepted") {
      throw new Error(
        `expected accepted ingest, got ${JSON.stringify(result)}`,
      );
    }
    return result;
  }

  // ─── TEST A ─────────────────────────────────────────────────────────────
  it("A — canonical ingest disabled: no ArtifactVersion claimed; output dep missing", () => {
    delete process.env.CDF_SOCIAL_MEDIA_INGEST;
    const session = startSocialSession();
    advanceToRoutesLegacy(session.sessionId);
    const result = tryIngestSocialMediaCdfCompletion({
      metadata: {
        cdfSessionId: session.sessionId,
        cdfServiceId: "social-media",
        cdfPhaseId: "routes",
      },
      rawOutput: structuredRoutes,
      executionId: "exec_lifecycle_a",
      organizationId: "org_sm_lifecycle",
      projectId: "proj_sm_lifecycle",
    });
    expect(result && "kind" in result && result.kind === "opt_in_disabled").toBe(
      true,
    );
    const live = getCdfSession(session.sessionId)!;
    expect(
      live.generatedArtifacts?.some(
        (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      ),
    ).toBeFalsy();

    const deps = resolveUpstreamArtifactsForPhase({
      session: live,
      serviceId: "social-media",
      phaseId: "output",
      organizationId: "org_sm_lifecycle",
      projectId: "proj_sm_lifecycle",
    });
    expect(deps.ok).toBe(false);
    if (deps.ok) throw new Error("expected missing routes dep");
    expect(deps.code).toBe("DEPENDENCY_NOT_SATISFIED");
    expect(deps.message).toMatch(/routes/);
  });

  // ─── TEST B ─────────────────────────────────────────────────────────────
  it("B — ingest enabled + M4 accept → social-media.routes ArtifactVersion + M9B identity", () => {
    const session = startSocialSession();
    const ingested = ingestRoutesAccepted(session.sessionId, "exec_lifecycle_b");
    expect(ingested.attach.cdfArtifactKey).toBe(SOCIAL_MEDIA_ARTIFACT_KEYS.routes);
    expect(ingested.attach.cdfArtifactId.startsWith("cdfart_")).toBe(true);
    expect(ingested.attach.cdfArtifactVersion).toBeGreaterThanOrEqual(1);
    expect(ingested.ingest.artifactId).toBe(ingested.attach.cdfArtifactId);
    expect(ingested.ingest.artifactVersion).toBe(
      ingested.attach.cdfArtifactVersion,
    );
  });

  // ─── TEST C ─────────────────────────────────────────────────────────────
  it("C — M9C bind pins exact routes identity in generatedArtifacts", () => {
    const session = startSocialSession();
    const ingested = ingestRoutesAccepted(session.sessionId, "exec_lifecycle_c");
    const before = getCdfSession(session.sessionId)!;
    const bound = bindSocialMediaGeneratedFromAttach({
      sessionId: session.sessionId,
      phaseId: "routes",
      attach: ingested.attach,
      organizationId: "org_sm_lifecycle",
      projectId: "proj_sm_lifecycle",
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok) throw new Error(bound.message);
    const live = getCdfSession(session.sessionId)!;
    expect(live.sessionVersion).toBe(before.sessionVersion + 1);
    const gen = live.generatedArtifacts?.find(
      (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
    );
    expect(gen).toEqual({
      artifactId: ingested.attach.cdfArtifactId,
      version: ingested.attach.cdfArtifactVersion,
      phaseId: "routes",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      role: "generated",
    });
  });

  // ─── TEST D ─────────────────────────────────────────────────────────────
  it("D — select_route with exact identity → selectedArtifacts X@V", () => {
    const session = startSocialSession();
    const ingested = ingestRoutesAccepted(session.sessionId, "exec_lifecycle_d");
    const X = ingested.attach.cdfArtifactId;
    const V = ingested.attach.cdfArtifactVersion;
    const bound = bindSocialMediaGeneratedFromAttach({
      sessionId: session.sessionId,
      phaseId: "routes",
      attach: ingested.attach,
      organizationId: "org_sm_lifecycle",
      projectId: "proj_sm_lifecycle",
    });
    expect(bound.ok).toBe(true);
    const live = getCdfSession(session.sessionId)!;
    const selected = applyCdfTransition({
      sessionId: session.sessionId,
      action: "select_route",
      routeIndex: 1,
      expectedVersion: live.sessionVersion,
      artifactId: X,
      artifactVersion: V,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
    });
    expect(selected.ok).toBe(true);
    if (!selected.ok) throw new Error(selected.error.message);
    const pin = selected.value.session.selectedArtifacts?.find(
      (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
    );
    expect(pin?.artifactId).toBe(X);
    expect(pin?.version).toBe(V);
  });

  // ─── TEST E ─────────────────────────────────────────────────────────────
  it("E — select_route missing identity with canonical refs → precise error (no legacy-only)", () => {
    const session = startSocialSession();
    pinCanonicalConfig(
      session.sessionId,
      "platform",
      fixtureSocialMediaPlatform(),
    );
    pinCanonicalConfig(
      session.sessionId,
      "size-reference",
      fixtureSocialMediaSizeReference(),
    );
    const live = getCdfSession(session.sessionId)!;
    expect(live.phaseId).toBe("routes");
    const selected = applyCdfTransition({
      sessionId: session.sessionId,
      action: "select_route",
      routeIndex: 0,
      routeInput: "1080 × 1350 px",
      expectedVersion: live.sessionVersion,
    });
    expect(selected.ok).toBe(false);
    if (selected.ok) throw new Error("expected INVALID_SELECTION");
    expect(selected.error.cdfCode).toBe("INVALID_SELECTION");
    expect(selected.error.message).toMatch(/artifactId|artifactVersion|canonical/i);
    const after = getCdfSession(session.sessionId)!;
    expect(
      after.selectedArtifacts?.some(
        (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      ),
    ).toBeFalsy();
    expect(after.sessionVersion).toBe(live.sessionVersion);
  });

  // ─── TEST F ─────────────────────────────────────────────────────────────
  it("F — approve preserves exact same X@V in approvedArtifacts", () => {
    const session = startSocialSession();
    const ingested = ingestRoutesAccepted(session.sessionId, "exec_lifecycle_f");
    const X = ingested.attach.cdfArtifactId;
    const V = ingested.attach.cdfArtifactVersion;
    expect(
      bindSocialMediaGeneratedFromAttach({
        sessionId: session.sessionId,
        phaseId: "routes",
        attach: ingested.attach,
        organizationId: "org_sm_lifecycle",
        projectId: "proj_sm_lifecycle",
      }).ok,
    ).toBe(true);
    let cur = getCdfSession(session.sessionId)!;
    cur = applyArtifactEngineOnSelect({
      session: cur,
      phaseId: "routes",
      artifactId: X,
      artifactVersion: V,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
    });
    cur = applyArtifactEngineOnApprove({
      session: cur,
      phaseId: "routes",
      artifactId: X,
      artifactVersion: V,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
    });
    const approved = cur.approvedArtifacts?.find(
      (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
    );
    expect(approved?.artifactId).toBe(X);
    expect(approved?.version).toBe(V);
    const selected = cur.selectedArtifacts?.find(
      (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
    );
    expect(selected?.artifactId).toBe(X);
    expect(selected?.version).toBe(V);
  });

  // ─── TEST G ─────────────────────────────────────────────────────────────
  it("G — output dependency resolves selected X@V; rejects generated-only", () => {
    const session = startSocialSession();
    const ingested = ingestRoutesAccepted(session.sessionId, "exec_lifecycle_g");
    const X = ingested.attach.cdfArtifactId;
    const V = ingested.attach.cdfArtifactVersion;
    expect(
      bindSocialMediaGeneratedFromAttach({
        sessionId: session.sessionId,
        phaseId: "routes",
        attach: ingested.attach,
        organizationId: "org_sm_lifecycle",
        projectId: "proj_sm_lifecycle",
      }).ok,
    ).toBe(true);

    let live = getCdfSession(session.sessionId)!;
    let deps = resolveUpstreamArtifactsForPhase({
      session: live,
      serviceId: "social-media",
      phaseId: "output",
      organizationId: "org_sm_lifecycle",
      projectId: "proj_sm_lifecycle",
    });
    expect(deps.ok).toBe(false);
    if (deps.ok) throw new Error("generated-only must fail");
    expect(deps.code).toBe("DEPENDENCY_NOT_SATISFIED");
    expect(deps.message).toMatch(/generated-only|routes/);

    const selected = applyCdfTransition({
      sessionId: session.sessionId,
      action: "select_route",
      routeIndex: 0,
      routeInput: "1080 × 1350 px",
      expectedVersion: live.sessionVersion,
      artifactId: X,
      artifactVersion: V,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
    });
    expect(selected.ok).toBe(true);
    if (!selected.ok) throw new Error(selected.error.message);
    live = selected.value.session;
    deps = resolveUpstreamArtifactsForPhase({
      session: live,
      serviceId: "social-media",
      phaseId: "output",
      organizationId: "org_sm_lifecycle",
      projectId: "proj_sm_lifecycle",
    });
    expect(deps.ok).toBe(true);
    if (!deps.ok) throw new Error(deps.message);
    const routesUp = deps.upstream.find(
      (u) => u.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
    );
    expect(routesUp?.artifactId).toBe(X);
    expect(routesUp?.version).toBe(V);
  });

  // ─── TEST H ─────────────────────────────────────────────────────────────
  it("H — M9C CAS race: conflict then reconcile to exact pin (no silent success / lost update)", () => {
    const session = startSocialSession();
    const ingested = ingestRoutesAccepted(session.sessionId, "exec_lifecycle_h");
    const X = ingested.attach.cdfArtifactId;
    const V = ingested.attach.cdfArtifactVersion;
    const before = getCdfSession(session.sessionId)!;
    const staleExpected = before.sessionVersion;

    const bumpArt = createArtifact({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "platform",
      organizationId: "org_sm_lifecycle",
      projectId: "proj_sm_lifecycle",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.platform,
      artifactType: "config_choice",
      data: fixtureSocialMediaPlatform() as never,
    });
    const concurrent = bindGeneratedSocialMediaArtifactToSession({
      sessionId: session.sessionId,
      phaseId: "platform",
      artifactId: bumpArt.artifact.artifactId,
      version: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.platform,
      expectedVersion: staleExpected,
    });
    expect(concurrent.ok).toBe(true);

    const bound = bindSocialMediaGeneratedFromAttach({
      sessionId: session.sessionId,
      phaseId: "routes",
      attach: ingested.attach,
      organizationId: "org_sm_lifecycle",
      projectId: "proj_sm_lifecycle",
      expectedVersion: staleExpected,
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok) throw new Error(bound.message);
    const live = getCdfSession(session.sessionId)!;
    const routesPin = live.generatedArtifacts?.find(
      (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
    );
    expect(routesPin?.artifactId).toBe(X);
    expect(routesPin?.version).toBe(V);
    expect(
      live.generatedArtifacts?.some(
        (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.platform,
      ),
    ).toBe(true);
  });

  // ─── TEST I ─────────────────────────────────────────────────────────────
  it("I — full E2E platform→size→routes→M9B→M9C→select→approve→output dep X@V", () => {
    const session = startSocialSession();
    const ingested = ingestRoutesAccepted(session.sessionId, "exec_lifecycle_i");
    const X = ingested.attach.cdfArtifactId;
    const V = ingested.attach.cdfArtifactVersion;

    const bound = bindSocialMediaGeneratedFromAttach({
      sessionId: session.sessionId,
      phaseId: "routes",
      attach: ingested.attach,
      organizationId: "org_sm_lifecycle",
      projectId: "proj_sm_lifecycle",
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok) throw new Error(bound.message);

    let live = getCdfSession(session.sessionId)!;
    expect(
      live.generatedArtifacts?.find(
        (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      ),
    ).toMatchObject({ artifactId: X, version: V });

    const selected = applyCdfTransition({
      sessionId: session.sessionId,
      action: "select_route",
      routeIndex: 0,
      routeInput: "1080 × 1350 px",
      expectedVersion: live.sessionVersion,
      artifactId: X,
      artifactVersion: V,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
    });
    expect(selected.ok).toBe(true);
    if (!selected.ok) throw new Error(selected.error.message);
    live = selected.value.session;
    expect(
      live.selectedArtifacts?.find(
        (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      ),
    ).toMatchObject({ artifactId: X, version: V });

    live = applyArtifactEngineOnApprove({
      session: live,
      phaseId: "routes",
      artifactId: X,
      artifactVersion: V,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
    });
    expect(
      live.approvedArtifacts?.find(
        (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      ),
    ).toMatchObject({ artifactId: X, version: V });

    const deps = resolveUpstreamArtifactsForPhase({
      session: live,
      serviceId: "social-media",
      phaseId: "output",
      organizationId: "org_sm_lifecycle",
      projectId: "proj_sm_lifecycle",
    });
    expect(deps.ok).toBe(true);
    if (!deps.ok) throw new Error(deps.message);
    const routesUp = deps.upstream.find(
      (u) => u.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
    );
    expect(routesUp?.artifactId).toBe(X);
    expect(routesUp?.version).toBe(V);
  });
});
