/**
 * Generic CDF selection lifecycle:
 * generated X@V → select_route → selectedArtifacts exact X@V → persist/reload
 * → downstream selected dependency resolves.
 *
 * Fixture service: social-media (routes → output selected dependency).
 * Assertions are role/identity based — no product branches.
 */

import assert from "node:assert/strict";
import {
  applyArtifactEngineOnApprove,
  applyArtifactEngineOnSelect,
  applyCdfTransition,
  createArtifact,
  fixtureSocialMediaPlatform,
  fixtureSocialMediaRoutes,
  fixtureSocialMediaSizeReference,
  getArtifactVersion,
  getCdfSession,
  persistCdfSession,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  SOCIAL_MEDIA_ARTIFACT_KEYS,
} from "../../../src/platform/cdf";
import { upsertSessionArtifactRef } from "../../../src/platform/cdf/artifacts/session-adapter";
import { resolveUpstreamArtifactsForPhase } from "../../../src/platform/cdf/generation-context/resolve-dependencies";
import { resolveCdfPhaseExecutionContract } from "../../../src/platform/cdf/canonical";

const ORG = "org_cdf_selection_lifecycle";
const PROJ = "proj_cdf_selection_lifecycle";

function seedRoutesWithUpstream(sessionId: string) {
  const platform = createArtifact({
    sessionId,
    serviceId: "social-media",
    phaseId: "platform",
    organizationId: ORG,
    projectId: PROJ,
    artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.platform,
    artifactType: "config_choice",
    data: fixtureSocialMediaPlatform() as never,
  });
  const size = createArtifact({
    sessionId,
    serviceId: "social-media",
    phaseId: "size-reference",
    organizationId: ORG,
    projectId: PROJ,
    artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
    artifactType: "config_choice",
    data: fixtureSocialMediaSizeReference(
      platform.artifact.artifactId,
      1,
    ) as never,
  });
  const routes = createArtifact({
    sessionId,
    serviceId: "social-media",
    phaseId: "routes",
    organizationId: ORG,
    projectId: PROJ,
    artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
    artifactType: "text_choice",
    data: fixtureSocialMediaRoutes(
      size.artifact.artifactId,
      1,
      platform.artifact.artifactId,
    ) as never,
  });
  return { platform, size, routes };
}

function createRoutesArtifact(sessionId: string) {
  return seedRoutesWithUpstream(sessionId).routes;
}

describe("CDF generic selection lifecycle (generated → selected X@V)", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
  });

  it("1–7 — generate pin, select choice, persist/reload, resolve selected dependency", () => {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "social-media",
      productMode: "ai",
      organizationId: ORG,
      projectId: PROJ,
    });
    assert.equal(started.ok, true);
    if (!started.ok) return;
    const briefed = applyCdfTransition({
      sessionId: started.value.session.sessionId,
      action: "submit_brief",
      brief: "Creative directions for selection lifecycle",
      expectedVersion: started.value.session.sessionVersion,
    });
    assert.equal(briefed.ok, true);
    if (!briefed.ok) return;

    let session = getCdfSession(briefed.value.session.sessionId)!;
    const routesContract = resolveCdfPhaseExecutionContract({
      serviceId: "social-media",
      phaseId: "routes",
    });
    assert.ok(routesContract);
    const artifactKey = routesContract!.artifactKey;
    const phaseId = "routes";

    const seeded = seedRoutesWithUpstream(session.sessionId);
    const created = seeded.routes;
    const X = created.artifact.artifactId;
    const V = 1;
    assert.ok(X.startsWith("cdfart_"));
    assert.ok(getArtifactVersion(X, V, { organizationId: ORG, projectId: PROJ }));

    const cfg = briefed.value.config;
    const routesIdx = cfg.phases.findIndex((p) => p.id === phaseId);
    assert.ok(routesIdx >= 0);
    session = {
      ...session,
      phaseIndex: routesIdx,
      phaseId,
      status: "active",
      sessionVersion: session.sessionVersion + 1,
    };
    // Upstream dependency for routes select_route (generic selected role).
    session = upsertSessionArtifactRef(session, {
      artifactId: seeded.size.artifact.artifactId,
      version: 1,
      phaseId: "size-reference",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
      role: "selected",
    });
    session = upsertSessionArtifactRef(session, {
      artifactId: X,
      version: V,
      phaseId,
      artifactKey,
      role: "generated",
    });
    persistCdfSession(session);
    session = getCdfSession(session.sessionId)!;
    assert.equal(
      session.generatedArtifacts?.find((r) => r.phaseId === phaseId)?.artifactId,
      X,
    );
    assert.equal(
      session.selectedArtifacts?.find((r) => r.phaseId === phaseId),
      undefined,
    );

    const beforeSelect = resolveUpstreamArtifactsForPhase({
      session,
      phaseId: "output",
      serviceId: "social-media",
    });
    assert.equal(beforeSelect.ok, false);
    if (!beforeSelect.ok) {
      assert.match(
        beforeSelect.message,
        /selected|DEPENDENCY|generated-only|Missing selected/i,
      );
    }

    const selected = applyCdfTransition({
      sessionId: session.sessionId,
      action: "select_route",
      routeIndex: 1,
      routeTitle: "B",
      expectedVersion: session.sessionVersion,
      artifactId: X,
      artifactVersion: V,
      artifactKey,
    });
    assert.equal(selected.ok, true);
    if (!selected.ok) throw new Error(selected.error.message);
    session = selected.value.session;

    const pin = session.selectedArtifacts?.find((r) => r.phaseId === phaseId);
    assert.ok(pin);
    assert.equal(pin!.artifactId, X);
    assert.equal(pin!.version, V);
    assert.equal(pin!.artifactKey, artifactKey);
    assert.equal(pin!.role, "selected");
    assert.equal(
      session.generatedArtifacts?.find((r) => r.phaseId === phaseId)?.artifactId,
      X,
    );
    assert.equal(
      session.generatedArtifacts?.find((r) => r.phaseId === phaseId)?.version,
      V,
    );
    let v2Missing = false;
    try {
      getArtifactVersion(X, 2, { organizationId: ORG, projectId: PROJ });
    } catch {
      v2Missing = true;
    }
    assert.equal(v2Missing, true);
    const row = session.selected?.find((s) => s.phaseId === phaseId);
    assert.equal(row?.selectedRouteIndex, 1);
    assert.equal(row?.artifactId, X);
    assert.equal(row?.artifactVersion, V);

    persistCdfSession(session);
    const reloaded = getCdfSession(session.sessionId)!;
    assert.equal(
      reloaded.selectedArtifacts?.find((r) => r.phaseId === phaseId)?.artifactId,
      X,
    );
    assert.equal(
      reloaded.selectedArtifacts?.find((r) => r.phaseId === phaseId)?.version,
      V,
    );

    const afterSelect = resolveUpstreamArtifactsForPhase({
      session: reloaded,
      phaseId: "output",
      serviceId: "social-media",
    });
    assert.equal(afterSelect.ok, true);
    if (afterSelect.ok) {
      const hit = afterSelect.upstream.find(
        (a) => a.phaseId === phaseId || a.artifactKey === artifactKey,
      );
      assert.ok(hit);
      assert.equal(hit!.artifactId, X);
      assert.equal(hit!.version, V);
      assert.equal(hit!.sessionRole, "selected");
    }
  });

  it("stale expectedVersion fails safely (no selectedArtifacts mutation)", () => {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "social-media",
      productMode: "ai",
      organizationId: ORG,
      projectId: PROJ,
    });
    assert.equal(started.ok, true);
    if (!started.ok) return;
    const briefed = applyCdfTransition({
      sessionId: started.value.session.sessionId,
      action: "submit_brief",
      brief: "Stale version select",
      expectedVersion: started.value.session.sessionVersion,
    });
    assert.equal(briefed.ok, true);
    if (!briefed.ok) return;
    let session = getCdfSession(briefed.value.session.sessionId)!;
    const stale = session.sessionVersion;
    const seeded = seedRoutesWithUpstream(session.sessionId);
    const created = seeded.routes;
    const cfg = briefed.value.config;
    const routesIdx = cfg.phases.findIndex((p) => p.id === "routes");
    session = {
      ...session,
      phaseIndex: routesIdx,
      phaseId: "routes",
      sessionVersion: session.sessionVersion + 1,
      selectedArtifacts: [
        {
          artifactId: seeded.size.artifact.artifactId,
          version: 1,
          phaseId: "size-reference",
          artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
          role: "selected",
        },
      ],
      generatedArtifacts: [
        {
          artifactId: created.artifact.artifactId,
          version: 1,
          phaseId: "routes",
          artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
          role: "generated",
        },
      ],
    };
    persistCdfSession(session);
    session = getCdfSession(session.sessionId)!;

    const conflict = applyCdfTransition({
      sessionId: session.sessionId,
      action: "select_route",
      routeIndex: 0,
      expectedVersion: stale,
      artifactId: created.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
    });
    assert.equal(conflict.ok, false);
    if (!conflict.ok) {
      assert.match(
        String(
          (conflict.error as { cdfCode?: string }).cdfCode ??
            conflict.error.message,
        ),
        /SESSION_VERSION_CONFLICT|version conflict/i,
      );
    }
    const live = getCdfSession(session.sessionId)!;
    assert.equal(
      live.selectedArtifacts?.find((r) => r.phaseId === "routes"),
      undefined,
    );
  });

  it("approved exact X@V is pinned (selected_or_approved can use approved)", () => {
    const created = createRoutesArtifact("cdf_sel_approved_pref");
    let session = {
      sessionId: "cdf_sel_approved_pref",
      serviceId: "social-media",
      organizationId: ORG,
      projectId: PROJ,
      status: "active" as const,
      phaseIndex: 0,
      phaseId: "output",
      sessionVersion: 1,
      brief: "x",
      selected: [],
      approved: [],
      masters: {},
      productMode: "ai" as const,
      modeOwnership: "ai" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      generatedArtifacts: [
        {
          artifactId: created.artifact.artifactId,
          version: 1,
          phaseId: "routes",
          artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
          role: "generated" as const,
        },
      ],
    };
    session = applyArtifactEngineOnApprove({
      session,
      phaseId: "routes",
      artifactId: created.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      organizationId: ORG,
      projectId: PROJ,
    });
    const approved = session.approvedArtifacts?.find(
      (r) => r.phaseId === "routes",
    );
    assert.ok(approved);
    assert.equal(approved!.artifactId, created.artifact.artifactId);
    assert.equal(approved!.version, 1);
    assert.equal(approved!.role, "approved");

    const resolved = resolveUpstreamArtifactsForPhase({
      session,
      phaseId: "output",
      serviceId: "social-media",
    });
    assert.equal(resolved.ok, true);
  });


  it("idempotent select_route retains exact parent X@V and selectedRouteIndex", () => {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "social-media",
      productMode: "ai",
      organizationId: ORG,
      projectId: PROJ,
    });
    assert.equal(started.ok, true);
    if (!started.ok) return;
    const briefed = applyCdfTransition({
      sessionId: started.value.session.sessionId,
      action: "submit_brief",
      brief: "Idempotent select",
      expectedVersion: started.value.session.sessionVersion,
    });
    assert.equal(briefed.ok, true);
    if (!briefed.ok) return;
    let session = getCdfSession(briefed.value.session.sessionId)!;
    const seeded = seedRoutesWithUpstream(session.sessionId);
    const X = seeded.routes.artifact.artifactId;
    const cfg = briefed.value.config;
    const routesIdx = cfg.phases.findIndex((p) => p.id === "routes");
    session = {
      ...session,
      phaseIndex: routesIdx,
      phaseId: "routes",
      sessionVersion: session.sessionVersion + 1,
    };
    session = upsertSessionArtifactRef(session, {
      artifactId: seeded.size.artifact.artifactId,
      version: 1,
      phaseId: "size-reference",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
      role: "selected",
    });
    session = upsertSessionArtifactRef(session, {
      artifactId: X,
      version: 1,
      phaseId: "routes",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      role: "generated",
    });
    persistCdfSession(session);
    session = getCdfSession(session.sessionId)!;

    const first = applyCdfTransition({
      sessionId: session.sessionId,
      action: "select_route",
      routeIndex: 2,
      routeTitle: "C",
      expectedVersion: session.sessionVersion,
      artifactId: X,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    session = first.value.session;
    const pin1 = session.selectedArtifacts?.find((r) => r.phaseId === "routes");
    assert.equal(pin1?.artifactId, X);
    assert.equal(pin1?.version, 1);
    assert.equal(session.selected?.find((s) => s.phaseId === "routes")?.selectedRouteIndex, 2);

    // Same choice again (session may have advanced phase — re-select from live pin).
    const second = applyCdfTransition({
      sessionId: session.sessionId,
      action: "select_route",
      routeIndex: 2,
      routeTitle: "C",
      expectedVersion: session.sessionVersion,
      artifactId: X,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
    });
    // Either idempotent success on routes phase, or ACTION_NOT_ALLOWED if already advanced —
    // never creates a new ArtifactVersion.
    let v2Missing = false;
    try {
      getArtifactVersion(X, 2, { organizationId: ORG, projectId: PROJ });
    } catch {
      v2Missing = true;
    }
    assert.equal(v2Missing, true);
    const live = getCdfSession(session.sessionId)!;
    const pin2 = live.selectedArtifacts?.find((r) => r.phaseId === "routes");
    assert.equal(pin2?.artifactId, X);
    assert.equal(pin2?.version, 1);
    if (second.ok) {
      assert.equal(
        second.value.session.selected?.find((s) => s.phaseId === "routes")
          ?.selectedRouteIndex,
        2,
      );
    }
  });

  it("applyArtifactEngineOnSelect does not create artifacts or mutate generated identity", () => {
    const created = createRoutesArtifact("cdf_sel_engine_only");
    let session = {
      sessionId: "cdf_sel_engine_only",
      serviceId: "social-media",
      organizationId: ORG,
      projectId: PROJ,
      status: "active" as const,
      phaseIndex: 0,
      phaseId: "routes",
      sessionVersion: 1,
      brief: "x",
      selected: [],
      approved: [],
      masters: {},
      productMode: "ai" as const,
      modeOwnership: "ai" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      generatedArtifacts: [
        {
          artifactId: created.artifact.artifactId,
          version: 1,
          phaseId: "routes",
          artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
          role: "generated" as const,
        },
      ],
    };
    const beforeGen = JSON.parse(JSON.stringify(session.generatedArtifacts));
    session = applyArtifactEngineOnSelect({
      session,
      phaseId: "routes",
      artifactId: created.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      organizationId: ORG,
      projectId: PROJ,
    });
    assert.deepEqual(
      JSON.parse(JSON.stringify(session.generatedArtifacts)),
      beforeGen,
    );
    assert.equal(
      session.selectedArtifacts?.[0]?.artifactId,
      created.artifact.artifactId,
    );
    assert.equal(session.selectedArtifacts?.[0]?.version, 1);
    assert.equal(session.selectedArtifacts?.[0]?.role, "selected");
    let v2Missing = false;
    try {
      getArtifactVersion(created.artifact.artifactId, 2, {
        organizationId: ORG,
        projectId: PROJ,
      });
    } catch {
      v2Missing = true;
    }
    assert.equal(v2Missing, true);
  });
});
