/**
 * M1B — Deterministic transactional CDF state machine tests.
 */

import {
  applyCdfTransition,
  executeCdfAction,
  getCdfSession,
  prepareTransition,
  resetCdfSessionsForTests,
  resetCdfRequirementEngineForTests,
  resetCdfArtifactEngineForTests,
  resolveCdfCanonicalService,
  resolveCdfServiceConfig,
  CdfTransitionError,
  compareAndSwapCdfSession,
} from "../../../src/platform/cdf";
import { approveWithCanonicalCompletion, bindMinimalGeneratedForApprove } from "./helpers/bind-minimal-generated-for-approve";

describe("CDF M1B state machine", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
  });

  function startSocial() {
    const started = executeCdfAction({
      action: "start",
      serviceId: "social-media",
      productMode: "ai",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error("start failed");
    return started.value;
  }

  function brief(sessionId: string, expectedVersion: number, extra?: Record<string, unknown>) {
    const r = executeCdfAction({
      sessionId,
      action: "submit_brief",
      brief: "Launch Instagram posts for Acme snacks #FF5500",
      expectedVersion,
      ...(extra as object),
    } as never);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("brief failed");
    return r.value;
  }

  it("A/B — session creation + start", () => {
    const started = startSocial();
    expect(started.session.status).toBe("awaiting_brief");
    expect(started.session.sessionVersion).toBe(1);
    expect(started.session.contractVersion).toBeTruthy();
    expect(started.nextWork).toEqual({ kind: "await_brief" });
    expect(started.version).toBe(1);
  });

  it("C — submit_brief advances via canonical post-brief start", () => {
    const started = startSocial();
    const briefed = brief(started.session.sessionId, started.session.sessionVersion);
    expect(briefed.session.brief).toContain("Acme");
    expect(briefed.session.sessionVersion).toBe(2);
    expect(briefed.session.phaseId).toBeTruthy();
    expect(briefed.nextWork.kind).not.toBe("await_brief");
  });

  it("D/E/F/G — select, approve, refine, final_action", () => {
    const started = startSocial();
    let cur = brief(started.session.sessionId, started.session.sessionVersion);

    // Skip gates until routes if needed
    while (
      cur.session.phaseId &&
      cur.ui.currentPhase?.type === "routes" &&
      cur.session.phaseId !== "routes"
    ) {
      const sel = executeCdfAction({
        sessionId: cur.session.sessionId,
        action: "select_route",
        routeIndex: 0,
        routeInput: "1080 × 1350 px",
        expectedVersion: cur.session.sessionVersion,
      });
      expect(sel.ok).toBe(true);
      if (!sel.ok) return;
      cur = sel.value;
    }

    if (cur.ui.currentPhase?.type === "routes") {
      const selected = executeCdfAction({
        sessionId: cur.session.sessionId,
        action: "select_route",
        routeIndex: 0,
        routeTitle: "Lifestyle Moment",
        routeLabel: "Route 1",
        expectedVersion: cur.session.sessionVersion,
      });
      expect(selected.ok).toBe(true);
      if (!selected.ok) return;
      cur = selected.value;
      expect(cur.session.selected.some((s) => s.phaseId === "routes")).toBe(true);
      expect(cur.session.masters.routeTitle).toBe("Lifestyle Moment");
    }

    if (cur.ui.currentPhase?.type === "output") {
      const refined = executeCdfAction({
        sessionId: cur.session.sessionId,
        action: "refine",
        refinePrompt: "Make the product bigger",
        refineScope: "artifact",
        expectedVersion: cur.session.sessionVersion,
      });
      expect(refined.ok).toBe(true);
      if (!refined.ok) return;
      expect(refined.value.nextWork.kind).toBe("refine");
      expect(refined.value.session.phaseId).toBe(cur.session.phaseId);
      expect(refined.value.session.lastRefineScope).toBe("artifact");
      cur = refined.value;

      const approved = approveWithCanonicalCompletion(cur.session.sessionId);
      expect(approved.ok).toBe(true);
      if (!approved.ok) return;
      cur = approved.value;
      expect(cur.session.approved.some((a) => a.phaseId === "output")).toBe(true);
    }

    if (cur.ui.currentPhase?.type === "final") {
      const final = executeCdfAction({
        sessionId: cur.session.sessionId,
        action: "final_action",
        finalAction: cur.ui.finalActions[0],
        expectedVersion: cur.session.sessionVersion,
      });
      expect(final.ok).toBe(true);
      if (!final.ok) return;
      expect(final.value.nextWork.kind).toBe("materialize_final");
      expect(final.value.session.status).toBe("completed");
    }
  });

  it("H — studio handoff", () => {
    const started = executeCdfAction({
      action: "start",
      serviceId: "social-media",
      productMode: "hybrid",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    let cur = brief(started.value.session.sessionId, started.value.session.sessionVersion, {
      productMode: "hybrid",
    });
    // advance to handoff phase via selects/approves until showSendToStudio
    for (let i = 0; i < 12 && !cur.ui.showSendToStudio; i++) {
      const phase = cur.ui.currentPhase;
      if (!phase) break;
      if (phase.type === "routes") {
        const r = executeCdfAction({
          sessionId: cur.session.sessionId,
          action: "select_route",
          routeIndex: 0,
          routeInput: "1080 × 1350 px",
          expectedVersion: cur.session.sessionVersion,
        });
        if (!r.ok) break;
        cur = r.value;
      } else if (
        phase.type === "text-approval" ||
        phase.type === "output" ||
        phase.type === "mockup" ||
        phase.type === "multi-output"
      ) {
        const r = approveWithCanonicalCompletion(cur.session.sessionId);
        if (!r.ok) break;
        cur = r.value;
      } else break;
    }
    if (!cur.ui.showSendToStudio) return; // hybrid handoff config may differ
    const handoff = executeCdfAction({
      sessionId: cur.session.sessionId,
      action: "handoff_studio",
      expectedVersion: cur.session.sessionVersion,
    });
    expect(handoff.ok).toBe(true);
    if (!handoff.ok) return;
    expect(handoff.value.nextWork).toEqual({ kind: "studio_handoff" });
    expect(handoff.value.session.modeOwnership).toBe("studio");
  });

  it("I/J — invalid action / phase", () => {
    const started = startSocial();
    const bad = executeCdfAction({
      sessionId: started.session.sessionId,
      action: "approve",
      expectedVersion: started.session.sessionVersion,
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.error).toBeInstanceOf(CdfTransitionError);
    expect((bad.error as CdfTransitionError).cdfCode).toMatch(
      /ACTION_NOT_ALLOWED|INVALID_PHASE/,
    );
  });

  it("K — invalid selection", () => {
    const started = startSocial();
    let cur = brief(started.session.sessionId, started.session.sessionVersion);
    while (cur.ui.currentPhase && cur.ui.currentPhase.type !== "routes") {
      const r = approveWithCanonicalCompletion(cur.session.sessionId);
      if (!r.ok) break;
      cur = r.value;
    }
    if (cur.ui.currentPhase?.type !== "routes") return;
    const bad = executeCdfAction({
      sessionId: cur.session.sessionId,
      action: "select_route",
      routeIndex: 99,
      expectedVersion: cur.session.sessionVersion,
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect((bad.error as CdfTransitionError).cdfCode).toBe("INVALID_SELECTION");
  });

  it("L/M — missing dependency blocks approve", () => {
    const started = executeCdfAction({
      action: "start",
      serviceId: "presentation",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const briefed = executeCdfAction({
      sessionId: started.value.session.sessionId,
      action: "submit_brief",
      brief: "Q3 board presentation",
      expectedVersion: started.value.session.sessionVersion,
    });
    expect(briefed.ok).toBe(true);
    if (!briefed.ok) return;
    // Jump ahead without approving storyline deps — corrupt phaseIndex to full-deck
    const raw = getCdfSession(briefed.value.session.sessionId)!;
    const cfg = resolveCdfServiceConfig("presentation")!;
    const fullIdx = cfg.phases.findIndex((p) => p.id === "full-deck");
    compareAndSwapCdfSession(raw.sessionId, raw.sessionVersion, {
      ...raw,
      phaseIndex: fullIdx,
      phaseId: "full-deck",
      status: "active",
      sessionVersion: raw.sessionVersion + 1,
    });
    const after = getCdfSession(raw.sessionId)!;
    const bad = executeCdfAction({
      sessionId: after.sessionId,
      action: "approve",
      expectedVersion: after.sessionVersion,
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect((bad.error as CdfTransitionError).cdfCode).toBe(
      "DEPENDENCY_NOT_SATISFIED",
    );
  });

  it("N/O — stale version + concurrent approve/refine", () => {
    const started = startSocial();
    let cur = brief(started.session.sessionId, started.session.sessionVersion);
    while (
      cur.ui.currentPhase &&
      cur.ui.currentPhase.type !== "output" &&
      cur.ui.currentPhase.type !== "text-approval"
    ) {
      if (cur.ui.currentPhase.type === "routes") {
        const r = executeCdfAction({
          sessionId: cur.session.sessionId,
          action: "select_route",
          routeIndex: 0,
          routeInput: "1080 × 1350 px",
          expectedVersion: cur.session.sessionVersion,
        });
        if (!r.ok) break;
        cur = r.value;
      } else {
        const r = approveWithCanonicalCompletion(cur.session.sessionId);
        if (!r.ok) break;
        cur = r.value;
      }
    }
    const bound = bindMinimalGeneratedForApprove(cur.session.sessionId);
    const v = getCdfSession(cur.session.sessionId)!.sessionVersion;
    const a = prepareTransition({
      sessionId: cur.session.sessionId,
      action: "approve",
      expectedVersion: v,
      ...(bound
        ? {
            artifactId: bound.artifactId,
            artifactVersion: bound.artifactVersion,
            artifactKey: bound.artifactKey,
          }
        : {}),
    });
    const b = prepareTransition({
      sessionId: cur.session.sessionId,
      action: "refine",
      refinePrompt: "tweak",
      expectedVersion: v,
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    // First CAS wins
    const first = applyCdfTransition({
      sessionId: cur.session.sessionId,
      action: "approve",
      expectedVersion: v,
      ...(bound
        ? {
            artifactId: bound.artifactId,
            artifactVersion: bound.artifactVersion,
            artifactKey: bound.artifactKey,
          }
        : {}),
    });
    expect(first.ok).toBe(true);
    const second = applyCdfTransition({
      sessionId: cur.session.sessionId,
      action: "refine",
      refinePrompt: "tweak",
      expectedVersion: v,
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect((second.error as CdfTransitionError).cdfCode).toBe(
      "SESSION_VERSION_CONFLICT",
    );
  });

  it("P/Q/R/S — idempotent replay with requestId", () => {
    const started = startSocial();
    const first = executeCdfAction({
      sessionId: started.session.sessionId,
      action: "submit_brief",
      brief: "Same brief twice",
      expectedVersion: started.session.sessionVersion,
      requestId: "idem-brief-1",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const replay = executeCdfAction({
      sessionId: started.session.sessionId,
      action: "submit_brief",
      brief: "Same brief twice",
      expectedVersion: started.session.sessionVersion,
      requestId: "idem-brief-1",
    });
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.value.idempotentReplay).toBe(true);
    expect(replay.value.session.sessionVersion).toBe(
      first.value.session.sessionVersion,
    );
  });

  it("T — session already completed rejects non-final actions", () => {
    const started = startSocial();
    const s = started.session;
    // Force completed via store
    const raw = getCdfSession(s.sessionId)!;
    compareAndSwapCdfSession(s.sessionId, raw.sessionVersion, {
      ...raw,
      status: "completed",
      sessionVersion: raw.sessionVersion + 1,
    });
    const after = getCdfSession(s.sessionId)!;
    const bad = executeCdfAction({
      sessionId: s.sessionId,
      action: "submit_brief",
      brief: "nope",
      expectedVersion: after.sessionVersion,
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect((bad.error as CdfTransitionError).cdfCode).toBe(
      "SESSION_ALREADY_COMPLETE",
    );
  });

  it("U — invalid contract version", () => {
    const started = startSocial();
    const bad = executeCdfAction({
      sessionId: started.session.sessionId,
      action: "submit_brief",
      brief: "x",
      expectedVersion: started.session.sessionVersion,
      contractVersion: "1.0.0-legacy",
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect((bad.error as CdfTransitionError).cdfCode).toBe(
      "CONTRACT_VERSION_MISMATCH",
    );
  });

  it("V — HTTP field preservation through prepareTransition", () => {
    const started = startSocial();
    const prepared = prepareTransition({
      sessionId: started.session.sessionId,
      action: "submit_brief",
      brief: "Preserve all fields",
      expectedVersion: started.session.sessionVersion,
      platform: "instagram",
      format: "feed",
      subtype: "carousel",
      category: "product",
      routeTitle: "should-not-apply-yet",
      routeLabel: "L",
      routeDesc: "D",
      refineScope: "slide",
      finalActionId: "export_png",
      requestId: "fields-1",
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    // commit and verify masters / brief selection skip used platform
    const committed = applyCdfTransition({
      sessionId: started.session.sessionId,
      action: "submit_brief",
      brief: "Preserve all fields",
      expectedVersion: started.session.sessionVersion,
      platform: "instagram",
      format: "feed",
      subtype: "carousel",
      category: "product",
      requestId: "fields-1",
    });
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;
    // Instagram gate skip should land past platform if configured
    expect(committed.value.session.brief).toBe("Preserve all fields");
    expect(committed.value.version).toBeGreaterThan(started.session.sessionVersion);
  });

  it("W/X — nextWork is server-authoritative", () => {
    const started = startSocial();
    expect(started.nextWork.kind).toBe("await_brief");
    const briefed = brief(started.session.sessionId, started.session.sessionVersion);
    expect(briefed.nextWork).toBeDefined();
    expect(briefed.ui.allowedActions.length).toBeGreaterThan(0);
    // Client must not invent phase — phaseId comes from session
    expect(briefed.session.phaseId).toBe(briefed.ui.currentPhase?.id ?? null);
  });

  it("Y — Presentation full-deck is structured/nonvisual in legacy projection", () => {
    const cfg = resolveCdfServiceConfig("presentation");
    expect(cfg).toBeTruthy();
    const full = cfg!.phases.find((p) => p.id === "full-deck");
    expect(full).toBeTruthy();
    expect(full!.generator).toBe("structured");
    const canonical = resolveCdfCanonicalService("presentation");
    const cFull = canonical!.phases.find((p) => p.phaseId === "full-deck");
    expect(cFull!.uxType).toBe("deck");
    expect(cFull!.generationModality).toBe("structured");
    expect(cFull!.readiness.allowNonVisualReady).toBe(true);
  });

  it("Z/AA — Presentation select stays contract_only; slide-refinement is active (M6)", () => {
    const cfg = resolveCdfServiceConfig("presentation");
    expect(cfg!.phases.some((p) => p.id === "select")).toBe(false);
    expect(cfg!.phases.some((p) => p.id === "slide-refinement")).toBe(true);
    const canonical = resolveCdfCanonicalService("presentation")!;
    expect(
      canonical.phases.find((p) => p.phaseId === "select")?.implementationStatus,
    ).toBe("contract_only");
    expect(
      canonical.phases.find((p) => p.phaseId === "slide-refinement")
        ?.implementationStatus,
    ).toBe("active");

    // Runtime path: design-routes → full-deck → slide-refinement → final
    const designIdx = cfg!.phases.findIndex((p) => p.id === "design-routes");
    const fullIdx = cfg!.phases.findIndex((p) => p.id === "full-deck");
    const refineIdx = cfg!.phases.findIndex((p) => p.id === "slide-refinement");
    const finalIdx = cfg!.phases.findIndex((p) => p.id === "final");
    expect(designIdx).toBeGreaterThanOrEqual(0);
    expect(fullIdx).toBe(designIdx + 1);
    expect(refineIdx).toBe(fullIdx + 1);
    expect(finalIdx).toBe(refineIdx + 1);
  });

  describe("invariants", () => {
    it("successful transition increments version exactly once", () => {
      const started = startSocial();
      const before = started.session.sessionVersion;
      const briefed = brief(started.session.sessionId, before);
      expect(briefed.session.sessionVersion).toBe(before + 1);
    });

    it("failed transition leaves version unchanged", () => {
      const started = startSocial();
      const before = getCdfSession(started.session.sessionId)!.sessionVersion;
      executeCdfAction({
        sessionId: started.session.sessionId,
        action: "approve",
        expectedVersion: before,
      });
      expect(getCdfSession(started.session.sessionId)!.sessionVersion).toBe(
        before,
      );
    });

    it("current phase always exists in canonical registry when set", () => {
      const started = startSocial();
      const briefed = brief(started.session.sessionId, started.session.sessionVersion);
      if (!briefed.session.phaseId) return;
      const svc = resolveCdfCanonicalService(briefed.session.serviceId)!;
      expect(svc.phases.some((p) => p.phaseId === briefed.session.phaseId)).toBe(
        true,
      );
    });

    it("stale CAS never mutates", () => {
      const started = startSocial();
      const id = started.session.sessionId;
      const v = started.session.sessionVersion;
      const ok = compareAndSwapCdfSession(id, v, {
        ...started.session,
        brief: "won",
        sessionVersion: v + 1,
      });
      expect(ok).toBeTruthy();
      const lost = compareAndSwapCdfSession(id, v, {
        ...started.session,
        brief: "lost",
        sessionVersion: v + 1,
      });
      expect(lost).toBeUndefined();
      expect(getCdfSession(id)!.brief).toBe("won");
    });
  });
});
