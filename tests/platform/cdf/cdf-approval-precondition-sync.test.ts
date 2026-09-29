/**
 * Generic CDF approval / phase-completion / dependency synchronization.
 *
 * Guarantees: UI phase progression, state-machine advance, ArtifactVersion
 * completion, and dependency resolution describe the SAME state.
 *
 * No serviceId / phaseId / provider branches in the implementation under test.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  applyCdfExecutionAuthority,
  applyCdfTransition,
  CDF_EXECUTION_AUTHORITY_META,
  CDF_EXECUTION_CONTRACT_CONFLICT,
  cdfDependencySatisfied,
  compareAndSwapCdfSession,
  createArtifact,
  createVersion,
  executeCdfAction,
  fixtureSocialMediaOutput,
  fixtureSocialMediaRoutes,
  getCdfSession,
  isPhaseAuthoritativelyComplete,
  markValidated,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  resolveCdfServiceConfig,
  resolvePhaseCompletionForApproval,
  resolvePhaseProgressStatuses,
  saveCdfSession,
  SOCIAL_MEDIA_ARTIFACT_KEYS,
  SOCIAL_MEDIA_FIXTURE_IDS,
  upsertSessionArtifactRef,
  CdfTransitionError,
} from "../../../src/platform/cdf";
import { resolveCdfPhaseExecutionContract } from "../../../src/platform/cdf/canonical";
import { buildAuthoritativeUi as buildUi } from "../../../src/platform/cdf/state-machine/execute-action";

function readPhaseCompletionSource(): string {
  return fs.readFileSync(
    path.join(
      __dirname,
      "../../../src/platform/cdf/lifecycle/phase-completion.ts",
    ),
    "utf8",
  );
}

function readApproveBranchSource(): string {
  return fs.readFileSync(
    path.join(
      __dirname,
      "../../../src/platform/cdf/state-machine/execute-action.ts",
    ),
    "utf8",
  );
}

describe("CDF generic approval precondition / phase completion sync", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
  });

  function startService(serviceId: string) {
    const started = applyCdfTransition({
      action: "start",
      serviceId,
      productMode: "ai",
      organizationId: "org_approve_sync",
      projectId: "proj_approve_sync",
    });
    assert.equal(started.ok, true);
    if (!started.ok) throw new Error("start failed");
    const briefed = applyCdfTransition({
      sessionId: started.value.session.sessionId,
      action: "submit_brief",
      brief: "Generic CDF approval sync brief for Acme",
      expectedVersion: started.value.session.sessionVersion,
    });
    assert.equal(briefed.ok, true);
    if (!briefed.ok) throw new Error("brief failed");
    return briefed.value.session;
  }

  function forcePhase(
    sessionId: string,
    phaseId: string,
    extras: Record<string, unknown> = {},
  ) {
    const raw = getCdfSession(sessionId)!;
    const cfg = resolveCdfServiceConfig(raw.serviceId)!;
    const idx = cfg.phases.findIndex((p) => p.id === phaseId);
    assert.ok(idx >= 0, `phase ${phaseId} missing`);
    compareAndSwapCdfSession(sessionId, raw.sessionVersion, {
      ...raw,
      ...extras,
      phaseIndex: idx,
      phaseId,
      status: "active",
      sessionVersion: raw.sessionVersion + 1,
    });
    return getCdfSession(sessionId)!;
  }

  function createBoundGenerated(input: {
    sessionId: string;
    serviceId: string;
    phaseId: string;
    artifactKey: string;
    artifactType:
      | "text_doc"
      | "text_choice"
      | "image"
      | "video"
      | "structured_doc"
      | "logo";
    data?: Record<string, unknown>;
    version?: number;
    generationFanoutTargetId?: string;
  }) {
    const created = createArtifact({
      organizationId: "org_approve_sync",
      projectId: "proj_approve_sync",
      sessionId: input.sessionId,
      serviceId: input.serviceId,
      phaseId: input.phaseId,
      artifactKey: input.artifactKey,
      artifactType: input.artifactType,
      data: (input.data ?? { body: `${input.phaseId} body` }) as never,
    });
    markValidated(created.artifact.artifactId, 1);
    let version = 1;
    let artifactId = created.artifact.artifactId;
    if (input.version && input.version > 1) {
      let cur = created;
      for (let v = 2; v <= input.version; v++) {
        cur = {
          artifact: created.artifact,
          version: createVersion({
            artifactId: created.artifact.artifactId,
            data: { body: `${input.phaseId} v${v}` },
            organizationId: "org_approve_sync",
            projectId: "proj_approve_sync",
            expectedLatestVersion: v - 1,
          }),
        };
        markValidated(created.artifact.artifactId, v);
        version = v;
      }
      artifactId = created.artifact.artifactId;
    }
    let session = getCdfSession(input.sessionId)!;
    session = upsertSessionArtifactRef(session, {
      artifactId,
      version,
      phaseId: input.phaseId,
      artifactKey: input.artifactKey,
      role: "generated",
      ...(input.generationFanoutTargetId
        ? { generationFanoutTargetId: input.generationFanoutTargetId }
        : {}),
    });
    saveCdfSession(session);
    return { artifactId, version, session: getCdfSession(input.sessionId)! };
  }

  it("1 — Phase N has no required ArtifactVersion; approve MUST NOT advance", () => {
    let session = startService("videos");
    session = forcePhase(session.sessionId, "full-script", {
      // Upstream routes exist — must not substitute for full-script completion
      generatedArtifacts: [
        {
          artifactId: "cdfart_routes_only_1",
          version: 1,
          phaseId: "script-routes",
          artifactKey: "videos.script-routes",
          role: "generated",
        },
      ],
      selectedArtifacts: [
        {
          artifactId: "cdfart_routes_only_1",
          version: 1,
          phaseId: "script-routes",
          artifactKey: "videos.script-routes",
          role: "selected",
        },
      ],
    });
    // Create durable routes artifact so sessionHasCanonicalArtifactRefs is real
    createArtifact({
      organizationId: "org_approve_sync",
      projectId: "proj_approve_sync",
      sessionId: session.sessionId,
      serviceId: "videos",
      phaseId: "script-routes",
      artifactKey: "videos.script-routes",
      artifactType: "text_choice",
      data: { choices: [{ id: "r1", title: "Route 1" }] },
    });
    session = forcePhase(session.sessionId, "full-script", {
      generatedArtifacts: getCdfSession(session.sessionId)!.generatedArtifacts,
      selectedArtifacts: getCdfSession(session.sessionId)!.selectedArtifacts,
    });
    // Re-bind routes with real id
    const routes = createBoundGenerated({
      sessionId: session.sessionId,
      serviceId: "videos",
      phaseId: "script-routes",
      artifactKey: "videos.script-routes",
      artifactType: "text_choice",
      data: { choices: [{ id: "r1", title: "Route 1" }] },
    });
    session = forcePhase(routes.session.sessionId, "full-script", {
      generatedArtifacts: [
        {
          artifactId: routes.artifactId,
          version: routes.version,
          phaseId: "script-routes",
          artifactKey: "videos.script-routes",
          role: "generated",
        },
      ],
      selectedArtifacts: [
        {
          artifactId: routes.artifactId,
          version: routes.version,
          phaseId: "script-routes",
          artifactKey: "videos.script-routes",
          role: "selected",
        },
      ],
    });

    const before = getCdfSession(session.sessionId)!;
    const bad = executeCdfAction({
      sessionId: before.sessionId,
      action: "approve",
      expectedVersion: before.sessionVersion,
    });
    assert.equal(bad.ok, false);
    if (bad.ok) return;
    assert.equal((bad.error as CdfTransitionError).cdfCode, "APPROVAL_INVALID");
    const after = getCdfSession(before.sessionId)!;
    assert.equal(after.sessionVersion, before.sessionVersion);
    assert.equal(after.phaseId, "full-script");
    assert.equal(after.approved.some((a) => a.phaseId === "full-script"), false);
  });

  it("2 — generated without selected: stricter selected-required completion fails", () => {
    let session = startService("videos");
    session = forcePhase(session.sessionId, "full-script");
    const bound = createBoundGenerated({
      sessionId: session.sessionId,
      serviceId: "videos",
      phaseId: "full-script",
      artifactKey: "videos.full-script",
      artifactType: "text_doc",
    });
    const resolution = resolvePhaseCompletionForApproval({
      session: bound.session,
      phaseId: "full-script",
      serviceId: "videos",
      requiredRole: "selected",
      requestArtifactId: bound.artifactId,
      requestArtifactVersion: bound.version,
      requestArtifactKey: "videos.full-script",
    });
    assert.equal(resolution.transitionAllowed, false);
    assert.equal(resolution.completionStatus, "role_insufficient");
    assert.equal(
      resolution.failureCode,
      "CDF_SELECTION_REQUIRED_BEFORE_APPROVAL",
    );
  });

  it("3 — selected but not approved: approved_only dependency fails", () => {
    let session = startService("videos");
    session = forcePhase(session.sessionId, "storyboard");
    const script = createBoundGenerated({
      sessionId: session.sessionId,
      serviceId: "videos",
      phaseId: "full-script",
      artifactKey: "videos.full-script",
      artifactType: "text_doc",
    });
    session = upsertSessionArtifactRef(script.session, {
      artifactId: script.artifactId,
      version: script.version,
      phaseId: "full-script",
      artifactKey: "videos.full-script",
      role: "selected",
    });
    saveCdfSession(session);
    session = getCdfSession(session.sessionId)!;

    const sat = cdfDependencySatisfied(session, "full-script", {
      serviceId: "videos",
      dependingPhaseId: "storyboard",
      requiredRole: "approved",
      artifactKey: "videos.full-script",
    });
    assert.equal(sat.ok, false);
    if (sat.ok) return;
    assert.equal(sat.reason, "not_approved");
    assert.equal(sat.requiredRole, "approved");
  });

  it("4 — exact approved X@V: approval may advance", () => {
    let session = startService("videos");
    // Satisfy upstream script-routes selection for full-script deps
    const routes = createBoundGenerated({
      sessionId: session.sessionId,
      serviceId: "videos",
      phaseId: "script-routes",
      artifactKey: "videos.script-routes",
      artifactType: "text_choice",
      data: { choices: [{ id: "r2", title: "Route 2" }] },
    });
    session = upsertSessionArtifactRef(routes.session, {
      artifactId: routes.artifactId,
      version: routes.version,
      phaseId: "script-routes",
      artifactKey: "videos.script-routes",
      role: "selected",
    });
    saveCdfSession(session);
    session = forcePhase(session.sessionId, "full-script", {
      generatedArtifacts: getCdfSession(session.sessionId)!.generatedArtifacts,
      selectedArtifacts: getCdfSession(session.sessionId)!.selectedArtifacts,
    });
    const script = createBoundGenerated({
      sessionId: session.sessionId,
      serviceId: "videos",
      phaseId: "full-script",
      artifactKey: "videos.full-script",
      artifactType: "text_doc",
    });
    const before = getCdfSession(script.session.sessionId)!;
    const ok = executeCdfAction({
      sessionId: before.sessionId,
      action: "approve",
      expectedVersion: before.sessionVersion,
      artifactId: script.artifactId,
      artifactVersion: script.version,
      artifactKey: "videos.full-script",
    });
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    assert.equal(ok.value.session.phaseId, "storyboard");
    assert.ok(
      ok.value.session.approvedArtifacts?.some(
        (a) =>
          a.phaseId === "full-script" &&
          a.artifactId === script.artifactId &&
          a.version === script.version &&
          a.role === "approved",
      ),
    );
  });

  it("5 — completion survives session hydration (exact pin retained)", () => {
    let session = startService("packaging");
    // Use a canonical text/structured phase that is approvable when present
    const cfg = resolveCdfServiceConfig("social-media")!;
    session = startService("social-media");
    // Advance to output via forced phase + generated pin
    for (const label of ["Instagram", "Feed Post"]) {
      const sel = applyCdfTransition({
        action: "select_route",
        sessionId: session.sessionId,
        routeIndex: 0,
        routeLabel: label,
        expectedVersion: session.sessionVersion,
      });
      assert.equal(sel.ok, true);
      if (!sel.ok) return;
      session = sel.value.session;
    }
    const routes = createArtifact({
      organizationId: "org_approve_sync",
      projectId: "proj_approve_sync",
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      artifactType: "text_choice",
      data: fixtureSocialMediaRoutes() as never,
    });
    session = upsertSessionArtifactRef(getCdfSession(session.sessionId)!, {
      artifactId: routes.artifact.artifactId,
      version: 1,
      phaseId: "routes",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      role: "selected",
    });
    saveCdfSession(session);
    session = forcePhase(session.sessionId, "output", {
      generatedArtifacts: getCdfSession(session.sessionId)!.generatedArtifacts,
      selectedArtifacts: getCdfSession(session.sessionId)!.selectedArtifacts,
    });
    const output = createArtifact({
      organizationId: "org_approve_sync",
      projectId: "proj_approve_sync",
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "output",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      artifactType: "image",
      data: fixtureSocialMediaOutput(routes.artifact.artifactId, 1) as never,
      provenance: { vaultAssetIds: [SOCIAL_MEDIA_FIXTURE_IDS.vaultImage] },
    });
    session = upsertSessionArtifactRef(getCdfSession(session.sessionId)!, {
      artifactId: output.artifact.artifactId,
      version: 1,
      phaseId: "output",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      role: "generated",
    });
    saveCdfSession(session);

    // Simulate restart boundary: reload session from memory store (pins retained)
    const reloaded = getCdfSession(session.sessionId)!;
    const resolution = resolvePhaseCompletionForApproval({
      session: reloaded,
      phaseId: "output",
      serviceId: "social-media",
      requestArtifactId: output.artifact.artifactId,
      requestArtifactVersion: 1,
      requestArtifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
    });
    assert.equal(resolution.transitionAllowed, true);
    assert.equal(resolution.durabilityStatus, "durable");
    void cfg;
  });

  it("6 — stale in-memory pin but artifact store missing → fail closed", () => {
    let session = startService("videos");
    session = forcePhase(session.sessionId, "full-script", {
      generatedArtifacts: [
        {
          artifactId: "cdfart_missing_in_store_999",
          version: 1,
          phaseId: "full-script",
          artifactKey: "videos.full-script",
          role: "generated",
        },
      ],
    });
    const resolution = resolvePhaseCompletionForApproval({
      session,
      phaseId: "full-script",
      serviceId: "videos",
      requestArtifactId: "cdfart_missing_in_store_999",
      requestArtifactVersion: 1,
      requestArtifactKey: "videos.full-script",
    });
    assert.equal(resolution.transitionAllowed, false);
    assert.equal(resolution.completionStatus, "not_durable");
    assert.equal(resolution.failureCode, "CDF_ARTIFACT_NOT_DURABLE");
  });

  it("7 — durable ArtifactVersion + session pin → completion allowed", () => {
    let session = startService("videos");
    session = forcePhase(session.sessionId, "full-script");
    const bound = createBoundGenerated({
      sessionId: session.sessionId,
      serviceId: "videos",
      phaseId: "full-script",
      artifactKey: "videos.full-script",
      artifactType: "text_doc",
    });
    // Empty "cache" simulation: resolve from store via pin (bag already loaded)
    const resolution = resolvePhaseCompletionForApproval({
      session: bound.session,
      phaseId: "full-script",
      serviceId: "videos",
      requestArtifactId: bound.artifactId,
      requestArtifactVersion: bound.version,
      requestArtifactKey: "videos.full-script",
    });
    assert.equal(resolution.transitionAllowed, true);
    assert.equal(resolution.durabilityStatus, "durable");
    assert.equal(resolution.completionStatus, "complete");
  });

  it("8 — older ArtifactVersion must NOT substitute for current pin", () => {
    let session = startService("videos");
    session = forcePhase(session.sessionId, "full-script");
    const bound = createBoundGenerated({
      sessionId: session.sessionId,
      serviceId: "videos",
      phaseId: "full-script",
      artifactKey: "videos.full-script",
      artifactType: "text_doc",
      version: 2,
    });
    const resolution = resolvePhaseCompletionForApproval({
      session: bound.session,
      phaseId: "full-script",
      serviceId: "videos",
      requestArtifactId: bound.artifactId,
      requestArtifactVersion: 1,
      requestArtifactKey: "videos.full-script",
    });
    assert.equal(resolution.transitionAllowed, false);
    assert.equal(resolution.completionStatus, "version_not_current");
    assert.equal(resolution.failureCode, "CDF_STALE_ARTIFACT_VERSION");
    assert.equal(resolution.requiredArtifactVersion, 2);
  });

  it("8b — wrong artifactId@version is rejected (CDF_CANONICAL_ARTIFACT_MISMATCH)", () => {
    let session = startService("web-tech");
    session = forcePhase(session.sessionId, "sitemap");
    const bound = createBoundGenerated({
      sessionId: session.sessionId,
      serviceId: "web-tech",
      phaseId: "sitemap",
      artifactKey: "web-tech.sitemap",
      artifactType: "text_doc",
      version: 1,
    });
    const wrong = resolvePhaseCompletionForApproval({
      session: bound.session,
      phaseId: "sitemap",
      serviceId: "web-tech",
      requestArtifactId: "cdfart_stale_9_web-tech-sitemap",
      requestArtifactVersion: 1,
      requestArtifactKey: "web-tech.sitemap",
    });
    assert.equal(wrong.transitionAllowed, false);
    assert.equal(wrong.completionStatus, "identity_mismatch");
    assert.equal(wrong.failureCode, "CDF_CANONICAL_ARTIFACT_MISMATCH");
    assert.equal(wrong.requiredArtifactId, bound.artifactId);
    assert.equal(wrong.requiredArtifactVersion, 1);

    const ok = resolvePhaseCompletionForApproval({
      session: bound.session,
      phaseId: "sitemap",
      serviceId: "web-tech",
      requestArtifactId: bound.artifactId,
      requestArtifactVersion: bound.version,
      requestArtifactKey: "web-tech.sitemap",
    });
    assert.equal(ok.transitionAllowed, true);
    assert.equal(ok.completionStatus, "complete");
  });

  it("9 — earlier phase artifact must NOT satisfy current-phase completion", () => {
    let session = startService("videos");
    const routes = createBoundGenerated({
      sessionId: session.sessionId,
      serviceId: "videos",
      phaseId: "script-routes",
      artifactKey: "videos.script-routes",
      artifactType: "text_choice",
      data: { choices: [{ id: "r1", title: "R1" }] },
    });
    session = forcePhase(routes.session.sessionId, "full-script", {
      generatedArtifacts: [
        {
          artifactId: routes.artifactId,
          version: routes.version,
          phaseId: "script-routes",
          artifactKey: "videos.script-routes",
          role: "generated",
        },
      ],
      selectedArtifacts: [
        {
          artifactId: routes.artifactId,
          version: routes.version,
          phaseId: "script-routes",
          artifactKey: "videos.script-routes",
          role: "selected",
        },
      ],
    });
    const resolution = resolvePhaseCompletionForApproval({
      session,
      phaseId: "full-script",
      serviceId: "videos",
      requestArtifactId: routes.artifactId,
      requestArtifactVersion: routes.version,
      requestArtifactKey: "videos.full-script",
    });
    assert.equal(resolution.transitionAllowed, false);
    assert.equal(resolution.completionStatus, "missing_artifact");
  });

  it("10 — UI must not show completed when canonical completion is absent", () => {
    let session = startService("videos");
    // Corrupt: advanced to storyboard without full-script approved pin
    const routes = createBoundGenerated({
      sessionId: session.sessionId,
      serviceId: "videos",
      phaseId: "script-routes",
      artifactKey: "videos.script-routes",
      artifactType: "text_choice",
      data: { choices: [{ id: "r1", title: "R1" }] },
    });
    session = upsertSessionArtifactRef(routes.session, {
      artifactId: routes.artifactId,
      version: routes.version,
      phaseId: "script-routes",
      artifactKey: "videos.script-routes",
      role: "selected",
    });
    saveCdfSession(session);
    session = forcePhase(session.sessionId, "storyboard", {
      generatedArtifacts: getCdfSession(session.sessionId)!.generatedArtifacts,
      selectedArtifacts: getCdfSession(session.sessionId)!.selectedArtifacts,
      approved: [
        { phaseId: "full-script", approvedAt: new Date().toISOString() },
      ],
    });
    const cfg = resolveCdfServiceConfig("videos")!;
    const statuses = resolvePhaseProgressStatuses(session, cfg.phases);
    const fullScriptIdx = cfg.phases.findIndex((p) => p.id === "full-script");
    assert.ok(fullScriptIdx >= 0);
    assert.equal(statuses[fullScriptIdx], "incomplete");
    assert.equal(
      isPhaseAuthoritativelyComplete(session, "full-script", "videos"),
      false,
    );
    const ui = buildUi(cfg, session);
    assert.equal(ui.phaseProgressStatuses?.[fullScriptIdx], "incomplete");
    assert.ok(!ui.allowedActions.includes("approve") || session.phaseId !== "full-script");
  });

  it("11/12 — failed generation / provider success without canonical pin must not advance", () => {
    let session = startService("videos");
    session = forcePhase(session.sessionId, "full-script");
    const before = getCdfSession(session.sessionId)!;
    // Provider "success" without ingest: approve with executionId only
    const bad = executeCdfAction({
      sessionId: before.sessionId,
      action: "approve",
      expectedVersion: before.sessionVersion,
      executionId: "exec_provider_ok_no_artifact",
    });
    assert.equal(bad.ok, false);
    const after = getCdfSession(before.sessionId)!;
    assert.equal(after.sessionVersion, before.sessionVersion);
    assert.equal(after.phaseId, "full-script");
  });

  it("13 — diagnostic preview must not satisfy canonical approved dependency", () => {
    let session = startService("videos");
    session = forcePhase(session.sessionId, "full-script");
    const bound = createBoundGenerated({
      sessionId: session.sessionId,
      serviceId: "videos",
      phaseId: "full-script",
      artifactKey: "videos.full-script",
      artifactType: "text_doc",
    });
    const resolution = resolvePhaseCompletionForApproval({
      session: bound.session,
      phaseId: "full-script",
      serviceId: "videos",
      requestArtifactId: bound.artifactId,
      requestArtifactVersion: bound.version,
      requestArtifactKey: "videos.full-script",
      requestPresentationEligibility: "DIAGNOSTIC_PREVIEW_AVAILABLE",
    });
    assert.equal(resolution.transitionAllowed, false);
    assert.equal(resolution.completionStatus, "diagnostic_only");
    assert.equal(
      resolution.failureCode,
      "CDF_DIAGNOSTIC_PREVIEW_NOT_APPROVABLE",
    );
  });

  it("14/15 — generic across modalities and multiple services", () => {
    const cases: Array<{
      serviceId: string;
      phaseId: string;
      artifactKey: string;
      artifactType: "text_doc" | "structured_doc" | "image" | "video";
      data?: Record<string, unknown>;
      setup?: (sessionId: string) => void;
    }> = [
      {
        serviceId: "videos",
        phaseId: "full-script",
        artifactKey: "videos.full-script",
        artifactType: "text_doc",
      },
      {
        serviceId: "presentation",
        phaseId: "storyline",
        artifactKey: "presentation.storyline",
        artifactType: "structured_doc",
        data: { title: "Story", beats: [] },
      },
    ];

    for (const c of cases) {
      resetCdfSessionsForTests();
      resetCdfRequirementEngineForTests();
      resetCdfArtifactEngineForTests();
      let session = startService(c.serviceId);
      session = forcePhase(session.sessionId, c.phaseId);
      const missing = executeCdfAction({
        sessionId: session.sessionId,
        action: "approve",
        expectedVersion: session.sessionVersion,
      });
      assert.equal(missing.ok, false, `${c.serviceId}/${c.phaseId} missing pin`);
    }

    // Image modality (social-media output) without pin
    let session = startService("social-media");
    session = forcePhase(session.sessionId, "output");
    const imgMissing = executeCdfAction({
      sessionId: session.sessionId,
      action: "approve",
      expectedVersion: session.sessionVersion,
    });
    assert.equal(imgMissing.ok, false);
  });

  it("16 — ExecutionSpec conflict with CDF contract: CDF authority wins", () => {
    const result = applyCdfExecutionAuthority({
      metadata: {
        cdfServiceId: "videos",
        cdfPhaseId: "full-script",
        cdfSessionId: "cdf_conflict_1",
        cdfExecutionStrategy: "canonical",
        outputKind: "image",
        generationModality: "image",
        executionSpecDeliverables: ["PNG", "JPG"],
      },
      proposedOutputKind: "image",
      executionSpecOutputKind: "image",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: "videos",
      phaseId: "full-script",
    });
    assert.equal(contract?.generationModality, "text");
    assert.equal(result.metadata.outputKind, "text");
    assert.equal(
      result.metadata[CDF_EXECUTION_AUTHORITY_META.generationModality],
      "text",
    );
    assert.equal(result.metadata.cdfExecutionSpecConflict, true);
    assert.equal(
      result.deferredConflict?.code,
      CDF_EXECUTION_CONTRACT_CONFLICT,
    );
  });

  it("17 — Valid ExecutionSpec enrichment remains preserved", () => {
    const result = applyCdfExecutionAuthority({
      metadata: {
        cdfServiceId: "videos",
        cdfPhaseId: "full-script",
        cdfSessionId: "cdf_enrich_1",
        cdfExecutionStrategy: "canonical",
        userPreferenceTone: "bold",
        executionSpecConstraints: { maxTokens: 2000 },
      },
      proposedOutputKind: "text",
      executionSpecOutputKind: "text",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.metadata.userPreferenceTone, "bold");
    assert.deepEqual(result.metadata.executionSpecConstraints, {
      maxTokens: 2000,
    });
    assert.equal(result.metadata.outputKind, "text");
    assert.equal(
      result.metadata[CDF_EXECUTION_AUTHORITY_META.generationModality],
      "text",
    );
  });

  it("18 — no service/phase/provider/model-specific branches in completion guard", () => {
    const completionSrc = readPhaseCompletionSource();
    const approveSrc = readApproveBranchSource();
    assert.doesNotMatch(completionSrc, /serviceId\s*===\s*["']videos["']/);
    assert.doesNotMatch(completionSrc, /phaseId\s*===\s*["']full-script["']/);
    assert.doesNotMatch(completionSrc, /phaseId\s*===\s*["']storyboard["']/);
    assert.doesNotMatch(completionSrc, /providerId\s*===/);
    assert.doesNotMatch(completionSrc, /modelId\s*===/);
    // Approve branch must call generic precondition (not social-media-only)
    assert.match(approveSrc, /resolvePhaseCompletionForApproval/);
    assert.match(approveSrc, /logApprovalPrecondition/);
    assert.match(completionSrc, /approval_precondition/);
    assert.doesNotMatch(
      approveSrc.slice(
        approveSrc.indexOf('req.action === "approve"'),
        approveSrc.indexOf('req.action === "refine"'),
      ),
      /serviceId === "social-media"/,
    );
  });

  it("logs approval_precondition diagnostic fields", () => {
    const src = readApproveBranchSource();
    assert.match(src, /logApprovalPrecondition/);
    const completionSrc = readPhaseCompletionSource();
    for (const field of [
      "sessionId",
      "sessionVersion",
      "phaseId",
      "nextPhaseId",
      "requiredArtifactKey",
      "requiredRole",
      "requiredArtifactId",
      "requiredArtifactVersion",
      "requestArtifactId",
      "requestArtifactVersion",
      "requestArtifactKey",
      "requestGenerationFanoutTargetId",
      "completionStatus",
      "selectionStatus",
      "approvalStatus",
      "durabilityStatus",
      "transitionAllowed",
      "failureCode",
    ]) {
      assert.match(completionSrc, new RegExp(field));
    }
  });

  it("19 — fanout: approve exact selected leaf X@V (not first-match sibling)", () => {
    let session = startService("logo");
    session = forcePhase(session.sessionId, "logo-options");
    const leafA = createBoundGenerated({
      sessionId: session.sessionId,
      serviceId: "logo",
      phaseId: "logo-options",
      artifactKey: "logo.logo-options",
      artifactType: "logo",
      generationFanoutTargetId: "fanout_1_openai",
    });
    const leafB = createBoundGenerated({
      sessionId: leafA.session.sessionId,
      serviceId: "logo",
      phaseId: "logo-options",
      artifactKey: "logo.logo-options",
      artifactType: "logo",
      generationFanoutTargetId: "fanout_1_google",
    });
    // First pin in list is leafA; user selected leafB.
    const resolution = resolvePhaseCompletionForApproval({
      session: leafB.session,
      phaseId: "logo-options",
      serviceId: "logo",
      requestArtifactId: leafB.artifactId,
      requestArtifactVersion: leafB.version,
      requestArtifactKey: "logo.logo-options",
      requestGenerationFanoutTargetId: "fanout_1_google",
    });
    assert.equal(resolution.transitionAllowed, true);
    assert.equal(resolution.requiredArtifactId, leafB.artifactId);
    assert.equal(resolution.requiredArtifactVersion, leafB.version);
    assert.notEqual(resolution.requiredArtifactId, leafA.artifactId);
  });

  it("20 — AVAILABLE_WITH_WARNINGS eligibility does not block approval identity", () => {
    let session = startService("logo");
    session = forcePhase(session.sessionId, "logo-options");
    const bound = createBoundGenerated({
      sessionId: session.sessionId,
      serviceId: "logo",
      phaseId: "logo-options",
      artifactKey: "logo.logo-options",
      artifactType: "logo",
    });
    const resolution = resolvePhaseCompletionForApproval({
      session: bound.session,
      phaseId: "logo-options",
      serviceId: "logo",
      requestArtifactId: bound.artifactId,
      requestArtifactVersion: bound.version,
      requestArtifactKey: "logo.logo-options",
      requestPresentationEligibility: "AVAILABLE_WITH_WARNINGS",
    });
    assert.equal(resolution.transitionAllowed, true);
  });

  it("21 — allowNonVisualReady homepage accepts art_webexport without cdfart pin", () => {
    let session = startService("web-tech");
    session = forcePhase(session.sessionId, "homepage");
    const artId = "art_webexport0_147_1790458053533_0";
    const resolution = resolvePhaseCompletionForApproval({
      session,
      phaseId: "homepage",
      serviceId: "web-tech",
      requestArtifactId: artId,
      requestArtifactVersion: 0,
      requestArtifactKey: "web-tech.homepage",
      requestPresentationEligibility: "AVAILABLE",
    });
    assert.equal(resolution.transitionAllowed, true);
    assert.equal(resolution.completionStatus, "complete");
    assert.equal(resolution.requiredArtifactId, artId);
  });

  it("22 — art_webexport homepage approval satisfies remaining-pages dependency", () => {
    let session = startService("web-tech");
    session = forcePhase(session.sessionId, "remaining-pages", {
      // Upstream canonical pin so the session is in canonical-ref mode.
      generatedArtifacts: [
        {
          artifactId: "cdfart_x_3_web-tech-ui-routes",
          version: 1,
          phaseId: "ui-routes",
          artifactKey: "web-tech.ui-routes",
          role: "generated",
        },
      ],
      approved: [
        {
          phaseId: "homepage",
          approvedAt: new Date().toISOString(),
          artifactId: "art_webexport0_137_1790460232705_0",
          artifactVersion: 0,
          executionId: "exec_127_1790460020838",
        },
      ],
    });
    const sat = cdfDependencySatisfied(session, "homepage", {
      serviceId: "web-tech",
      dependingPhaseId: "remaining-pages",
    });
    assert.equal(sat.ok, true);

    const missing = forcePhase(session.sessionId, "remaining-pages", {
      approved: [],
    });
    const blocked = cdfDependencySatisfied(missing, "homepage", {
      serviceId: "web-tech",
      dependingPhaseId: "remaining-pages",
    });
    assert.equal(blocked.ok, false);
  });
});
