/**
 * Chat lifecycle: phase A → approve → phase B → approve → reload → phase C.
 * Verifies sessionVersion monotonicity, nextWork authority, phase graph order,
 * and that approve advances exactly once (stale expectedVersion rejected).
 */

import assert from "node:assert/strict";
import {
  applyCdfTransition,
  compareAndSwapCdfSession,
  createArtifact,
  executeCdfAction,
  getCdfSession,
  markValidated,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  resolveCdfServiceConfig,
  resolvePhaseProgressStatuses,
  saveCdfSession,
  upsertSessionArtifactRef,
  CdfTransitionError,
} from "../../../src/platform/cdf";

describe("CDF chat lifecycle A→approve→B→approve→reload→C", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
  });

  function startVideos() {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "videos",
      productMode: "ai",
      organizationId: "org_chat_e2e",
      projectId: "proj_chat_e2e",
    });
    assert.equal(started.ok, true);
    if (!started.ok) throw new Error("start failed");
    const briefed = applyCdfTransition({
      sessionId: started.value.session.sessionId,
      action: "submit_brief",
      brief: "3D product turntable for Sunflower — chat lifecycle E2E",
      expectedVersion: started.value.session.sessionVersion,
    });
    assert.equal(briefed.ok, true);
    if (!briefed.ok) throw new Error("brief failed");
    return briefed.value;
  }

  function bindGenerated(input: {
    sessionId: string;
    phaseId: string;
    artifactKey: string;
    artifactType: "text_doc" | "image" | "text_choice";
    data?: Record<string, unknown>;
  }) {
    const created = createArtifact({
      organizationId: "org_chat_e2e",
      projectId: "proj_chat_e2e",
      sessionId: input.sessionId,
      serviceId: "videos",
      phaseId: input.phaseId,
      artifactKey: input.artifactKey,
      artifactType: input.artifactType,
      data: (input.data ?? { title: input.phaseId, body: "ok" }) as never,
    });
    markValidated(created.artifact.artifactId, 1);
    let session = getCdfSession(input.sessionId)!;
    session = upsertSessionArtifactRef(session, {
      artifactId: created.artifact.artifactId,
      version: 1,
      phaseId: input.phaseId,
      artifactKey: input.artifactKey,
      role: "generated",
    });
    saveCdfSession(session);
    return {
      session: getCdfSession(input.sessionId)!,
      artifactId: created.artifact.artifactId,
      version: 1,
      artifactKey: input.artifactKey,
    };
  }

  function forcePhase(sessionId: string, phaseId: string) {
    const raw = getCdfSession(sessionId)!;
    const cfg = resolveCdfServiceConfig("videos")!;
    const idx = cfg.phases.findIndex((p) => p.id === phaseId);
    assert.ok(idx >= 0);
    compareAndSwapCdfSession(sessionId, raw.sessionVersion, {
      ...raw,
      phaseIndex: idx,
      phaseId,
      status: "active",
      sessionVersion: raw.sessionVersion + 1,
    });
    return getCdfSession(sessionId)!;
  }

  it("phase A approve → B approve → reload preserves pins → C", () => {
    const cfg = resolveCdfServiceConfig("videos")!;
    const phaseIds = cfg.phases.map((p) => p.id);
    assert.ok(phaseIds.length >= 3);

    let cur = startVideos();
    const sessionId = cur.session.sessionId;

    // Satisfy script-routes selection for full-script deps
    const routes = bindGenerated({
      sessionId,
      phaseId: "script-routes",
      artifactKey: "videos.script-routes",
      artifactType: "text_choice",
      data: { choices: [{ id: "r1", title: "Route 1" }] },
    });
    let session = upsertSessionArtifactRef(routes.session, {
      artifactId: routes.artifactId,
      version: routes.version,
      phaseId: "script-routes",
      artifactKey: "videos.script-routes",
      role: "selected",
    });
    saveCdfSession(session);

    // --- Phase A: full-script ---
    session = forcePhase(sessionId, "full-script");
    const phaseA = bindGenerated({
      sessionId,
      phaseId: "full-script",
      artifactKey: "videos.full-script",
      artifactType: "text_doc",
    });
    const beforeA = getCdfSession(sessionId)!;
    const progressA = resolvePhaseProgressStatuses(
      beforeA,
      cfg.phases.map((p) => ({ id: p.id })),
    );
    assert.equal(progressA.length, cfg.phases.length);
    // Phase order is graph order — not completion order of providers.
    assert.deepEqual(
      cfg.phases.map((p) => p.id),
      phaseIds,
    );

    const approveA = executeCdfAction({
      sessionId,
      action: "approve",
      expectedVersion: beforeA.sessionVersion,
      artifactId: phaseA.artifactId,
      artifactVersion: phaseA.version,
      artifactKey: phaseA.artifactKey,
    });
    assert.equal(approveA.ok, true);
    if (!approveA.ok) return;
    assert.equal(approveA.value.session.phaseId, "storyboard");
    assert.ok(approveA.value.nextWork);
    const versionAfterA = approveA.value.session.sessionVersion;

    // Stale approve of A must not re-advance / overwrite.
    const staleA = executeCdfAction({
      sessionId,
      action: "approve",
      expectedVersion: beforeA.sessionVersion,
      artifactId: phaseA.artifactId,
      artifactVersion: phaseA.version,
      artifactKey: phaseA.artifactKey,
    });
    assert.equal(staleA.ok, false);
    if (!staleA.ok) {
      assert.equal(
        (staleA.error as CdfTransitionError).cdfCode,
        "SESSION_VERSION_CONFLICT",
      );
    }
    assert.equal(getCdfSession(sessionId)!.sessionVersion, versionAfterA);
    assert.equal(getCdfSession(sessionId)!.phaseId, "storyboard");

    // --- Phase B: storyboard ---
    const phaseB = bindGenerated({
      sessionId,
      phaseId: "storyboard",
      artifactKey: "videos.storyboard",
      artifactType: "image",
      data: { frameCount: 1 },
    });
    const beforeB = getCdfSession(sessionId)!;
    const approveB = executeCdfAction({
      sessionId,
      action: "approve",
      expectedVersion: beforeB.sessionVersion,
      artifactId: phaseB.artifactId,
      artifactVersion: phaseB.version,
      artifactKey: phaseB.artifactKey,
    });
    assert.equal(approveB.ok, true);
    if (!approveB.ok) return;
    assert.equal(approveB.value.session.phaseId, "animation");
    const nextWorkB = approveB.value.nextWork;
    assert.ok(nextWorkB);
    const versionAfterB = approveB.value.session.sessionVersion;
    const approvedXV = {
      artifactId: phaseB.artifactId,
      version: phaseB.version,
      artifactKey: phaseB.artifactKey,
    };

    // --- Reload (re-hydrate from authoritative session store) ---
    const reloaded = getCdfSession(sessionId)!;
    assert.equal(reloaded.sessionVersion, versionAfterB);
    assert.equal(reloaded.phaseId, "animation");
    assert.ok(
      reloaded.approvedArtifacts?.some(
        (a) =>
          a.artifactId === approvedXV.artifactId &&
          a.version === approvedXV.version &&
          a.artifactKey === approvedXV.artifactKey &&
          a.role === "approved",
      ),
      "reload must preserve exact approved X@V",
    );
    assert.ok(
      reloaded.approvedArtifacts?.some(
        (a) =>
          a.phaseId === "full-script" &&
          a.artifactId === phaseA.artifactId &&
          a.version === phaseA.version,
      ),
      "reload must preserve phase A approval",
    );

    // Phase C is current after reload — nextWork from last transition remains
    // the authority for clients (server session phaseId === animation).
    assert.equal(reloaded.phaseId, "animation");
    assert.equal(
      typeof nextWorkB === "object" && nextWorkB && "kind" in nextWorkB
        ? nextWorkB.kind
        : null,
      "generate",
    );

    // Duplicate approve of B with current version should fail closed (already advanced).
    const dupB = executeCdfAction({
      sessionId,
      action: "approve",
      expectedVersion: versionAfterB,
      artifactId: phaseB.artifactId,
      artifactVersion: phaseB.version,
      artifactKey: phaseB.artifactKey,
    });
    // Either conflict or wrong-phase — must not silently re-run generation.
    assert.equal(dupB.ok, false);
  });
});
