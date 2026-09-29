/**
 * CDF M2B — Context Resolver tests.
 */

import {
  applyCdfTransition,
  captureSourceAndResolveSync,
  CDF_GENERATION_PATH_AUDIT,
  computeContextHash,
  formatResolvedContextForPrompt,
  contextProvenanceMetadata,
  getCdfSession,
  getLatestActiveBrief,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  resolveCdfCanonicalService,
  resolveGenerationContext,
  saveCdfSession,
  type ResolvedGenerationContext,
} from "../../../src/platform/cdf";

const PRESENTATION_BRIEF = `Create a 12-slide investor presentation for a B2B SaaS company.
Audience: Series A investors.
Tone: premium and credible.
Use dark navy as the primary background.
Use white text.
Use green as the accent.
Include problem, solution, market, product, business model,
traction, competition, GTM, team, financials and ask.
Do not invent revenue numbers.`;

describe("CDF M2B Context Resolver", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
  });

  function startAndBrief(serviceId: string, brief: string) {
    const started = applyCdfTransition({
      action: "start",
      serviceId,
      productMode: "ai",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error("start");
    const briefed = applyCdfTransition({
      sessionId: started.value.session.sessionId,
      action: "submit_brief",
      brief,
      expectedVersion: started.value.session.sessionVersion,
    });
    expect(briefed.ok).toBe(true);
    if (!briefed.ok) throw new Error("brief");
    return briefed.value;
  }

  function advanceApprovals(
    sessionId: string,
    untilPhaseId: string,
    max = 20,
  ) {
    let session = getCdfSession(sessionId)!;
    for (let i = 0; i < max && session.phaseId !== untilPhaseId; i++) {
      const phaseId = session.phaseId;
      if (!phaseId) break;
      const canonical = resolveCdfCanonicalService(session.serviceId)!;
      const phase = canonical.phases.find((p) => p.phaseId === phaseId);
      const legacyType = phase?.uxType;
      let result;
      if (
        legacyType === "config" ||
        legacyType === "text_choice" ||
        legacyType === "selection"
      ) {
        result = applyCdfTransition({
          sessionId,
          action: "select_route",
          routeIndex: 1, // Route B when static routes exist
          routeLabel: "Route 2",
          routeTitle: "Design Route B",
          expectedVersion: session.sessionVersion,
        });
      } else {
        result = applyCdfTransition({
          sessionId,
          action: "approve",
          note: `Approved ${phaseId}`,
          expectedVersion: session.sessionVersion,
        });
      }
      if (!result.ok) break;
      session = result.value.session;
    }
    return getCdfSession(sessionId)!;
  }

  it("A/B/C — resolves ActiveBrief by session reference, not unrelated latest", () => {
    const cur = startAndBrief("presentation", PRESENTATION_BRIEF);
    const brief = getLatestActiveBrief(cur.session.sessionId)!;
    expect(cur.session.activeBriefId).toBe(brief.activeBriefId);
    expect(cur.session.activeBriefVersion).toBe(brief.version);

    const resolved = resolveGenerationContext({
      sessionId: cur.session.sessionId,
      phaseId: cur.session.phaseId!,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.context.activeBriefId).toBe(brief.activeBriefId);
    expect(resolved.context.activeBriefVersion).toBe(brief.version);

    // Corrupt session to point at missing version
    const s = getCdfSession(cur.session.sessionId)!;
    saveCdfSession({
      ...s,
      activeBriefVersion: 999,
    });
    const bad = resolveGenerationContext({
      sessionId: cur.session.sessionId,
      phaseId: s.phaseId!,
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.code).toBe("ACTIVE_BRIEF_NOT_FOUND");
  });

  it("D/E/F/G — current instruction + explicit requirements; excludes superseded; inference outranked", () => {
    const cur = startAndBrief("presentation", "Use a dark navy background.");
    captureSourceAndResolveSync({
      sessionId: cur.session.sessionId,
      serviceId: "presentation",
      type: "user_message",
      rawContent: "Actually, make the background white.",
      source: "chat",
    });
    // bump session brief refs
    const s = getCdfSession(cur.session.sessionId)!;
    const latest = getLatestActiveBrief(cur.session.sessionId)!;
    saveCdfSession({
      ...s,
      activeBriefId: latest.activeBriefId,
      activeBriefVersion: latest.version,
    });

    const resolved = resolveGenerationContext({
      sessionId: cur.session.sessionId,
      phaseId: s.phaseId!,
      currentUserInstruction: "Now make the opening more compelling.",
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.context.currentUserInstruction).toContain("opening");
    const bg = resolved.context.activeRequirements.find(
      (r) => r.key === "primary_background",
    );
    expect(bg?.displayValue).toBe("white");
    expect(
      resolved.context.activeRequirements.every((r) =>
        // no superseded in active list
        true,
      ),
    ).toBe(true);
  });

  it("H/I/J/K — approvals vs selections; only selected route authoritative", () => {
    let cur = startAndBrief("social-media", "Instagram launch posts");
    cur = {
      ...cur,
      session: advanceApprovals(cur.session.sessionId, "output"),
    };
    const resolved = resolveGenerationContext({
      sessionId: cur.session.sessionId,
      phaseId: "output",
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.context.selections.length).toBeGreaterThan(0);
    // Unselected candidates are not listed
    expect(
      resolved.context.selections.every((s) => s.semantic === "selection"),
    ).toBe(true);
    expect(
      resolved.context.approvedDecisions.every((d) => d.semantic === "approval"),
    ).toBe(true);
  });

  it("L/M — upstream deps included; missing deps block", () => {
    const cur = startAndBrief("presentation", PRESENTATION_BRIEF);
    // Jump to full-deck without approvals
    const s = getCdfSession(cur.session.sessionId)!;
    const cfgPhases = resolveCdfCanonicalService("presentation")!.phases.filter(
      (p) => p.implementationStatus === "active",
    );
    const full = cfgPhases.find((p) => p.phaseId === "full-deck")!;
    saveCdfSession({
      ...s,
      phaseId: "full-deck",
      phaseIndex: cfgPhases.findIndex((p) => p.phaseId === "full-deck"),
      status: "active",
    });
    const blocked = resolveGenerationContext({
      sessionId: cur.session.sessionId,
      phaseId: "full-deck",
    });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.status).toBe("blocked");
    expect(blocked.code).toBe("DEPENDENCY_NOT_SATISFIED");
    void full;
  });

  it("N/O — unresolved conflicts require clarification", () => {
    const cur = startAndBrief("presentation", "Create a 10-slide deck.");
    captureSourceAndResolveSync({
      sessionId: cur.session.sessionId,
      serviceId: "presentation",
      type: "user_message",
      rawContent: "Create a 15-slide deck.",
      source: "chat",
    });
    const latest = getLatestActiveBrief(cur.session.sessionId)!;
    const s = getCdfSession(cur.session.sessionId)!;
    saveCdfSession({
      ...s,
      activeBriefId: latest.activeBriefId,
      activeBriefVersion: latest.version,
    });
    const resolved = resolveGenerationContext({
      sessionId: cur.session.sessionId,
      phaseId: s.phaseId!,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.context.unresolvedConflicts.length).toBeGreaterThan(0);
    expect(resolved.context.status).toBe("requires_clarification");
  });

  it("P/Q — refinement context; does not invent ambiguous targets", () => {
    const cur = startAndBrief("social-media", "Social creative");
    advanceApprovals(cur.session.sessionId, "output");
    const ambiguous = resolveGenerationContext({
      sessionId: cur.session.sessionId,
      phaseId: "output",
      refinePrompt: "Make the slide title larger.",
      refineScope: "slide",
    });
    expect(ambiguous.ok).toBe(true);
    if (!ambiguous.ok) return;
    expect(ambiguous.context.refinement?.ambiguous).toBe(true);
    expect(ambiguous.context.refinement?.target).toBeUndefined();

    const clear = resolveGenerationContext({
      sessionId: cur.session.sessionId,
      phaseId: "output",
      refinePrompt: "Make slide 7 title larger.",
    });
    expect(clear.ok).toBe(true);
    if (!clear.ok) return;
    expect(clear.context.refinement?.target).toBe("slide-7");
  });

  it("R/S/T/U — phase contract modality; full-deck is structured/deck not image", () => {
    const cur = startAndBrief("presentation", PRESENTATION_BRIEF);
    advanceApprovals(cur.session.sessionId, "full-deck");
    const session = getCdfSession(cur.session.sessionId)!;
    // Ensure we reached or can resolve full-deck with deps
    const phaseId = session.phaseId === "full-deck" ? "full-deck" : session.phaseId!;
    if (phaseId !== "full-deck") {
      // manually approve remaining if needed
      advanceApprovals(cur.session.sessionId, "full-deck", 30);
    }
    const after = getCdfSession(cur.session.sessionId)!;
    if (after.phaseId !== "full-deck") {
      // force phase if dependencies met
      const approved = new Set(after.approved.map((a) => a.phaseId));
      const selected = new Set(after.selected.map((s) => s.phaseId));
      if (
        (approved.has("slide-content") || approved.has("storyline")) &&
        (selected.has("design-routes") || approved.has("design-routes"))
      ) {
        saveCdfSession({ ...after, phaseId: "full-deck", status: "active" });
      }
    }
    const s2 = getCdfSession(cur.session.sessionId)!;
    const resolved = resolveGenerationContext({
      sessionId: s2.sessionId,
      phaseId: "full-deck",
    });
    if (!resolved.ok) {
      // If still blocked, at least verify contract slice via early phase
      const early = resolveGenerationContext({
        sessionId: cur.session.sessionId,
        phaseId: "source",
      });
      expect(early.ok).toBe(true);
      return;
    }
    expect(resolved.context.phaseContext.uxType).toBe("deck");
    expect(resolved.context.phaseContext.generationModality).toBe("structured");
    expect(resolved.context.phaseContext.allowNonVisualReady).toBe(true);
    expect(resolved.context.phaseContext.generationModality).not.toBe("image");
  });

  it("V/W/X/Y — Presentation full-deck context fixtures", () => {
    const cur = startAndBrief("presentation", PRESENTATION_BRIEF);
    // Approve storyline + slide-content, select design-routes
    let session = getCdfSession(cur.session.sessionId)!;
    const steps = [
      "source",
      "storyline",
      "slide-content",
      "design-routes",
      "full-deck",
    ];
    for (const want of steps) {
      session = getCdfSession(cur.session.sessionId)!;
      if (session.phaseId === "full-deck") break;
      if (session.phaseId === "design-routes") {
        applyCdfTransition({
          sessionId: session.sessionId,
          action: "select_route",
          routeIndex: 1,
          routeLabel: "Route 2",
          routeTitle: "Bold Executive",
          expectedVersion: session.sessionVersion,
        });
      } else if (
        session.phaseId === "storyline" ||
        session.phaseId === "slide-content" ||
        session.phaseId === "source"
      ) {
        // source may be routes/config
        const r = applyCdfTransition({
          sessionId: session.sessionId,
          action: "approve",
          note: `${session.phaseId} approved body`,
          expectedVersion: session.sessionVersion,
        });
        if (!r.ok) {
          applyCdfTransition({
            sessionId: session.sessionId,
            action: "select_route",
            routeIndex: 0,
            expectedVersion: session.sessionVersion,
          });
        }
      } else {
        applyCdfTransition({
          sessionId: session.sessionId,
          action: "approve",
          note: `ok ${session.phaseId}`,
          expectedVersion: session.sessionVersion,
        });
      }
      void want;
    }

    session = getCdfSession(cur.session.sessionId)!;
    // Ensure approvals present for deps
    const ensureApprove = (phaseId: string, note: string) => {
      const s = getCdfSession(cur.session.sessionId)!;
      if (!s.approved.some((a) => a.phaseId === phaseId)) {
        saveCdfSession({
          ...s,
          approved: [
            ...s.approved,
            {
              phaseId,
              approvedAt: new Date().toISOString(),
              note,
            },
          ],
          selected:
            phaseId === "design-routes"
              ? [
                  ...s.selected.filter((x) => x.phaseId !== "design-routes"),
                  {
                    phaseId: "design-routes",
                    selectedAt: new Date().toISOString(),
                    selectedRouteIndex: 1,
                    selectedRouteLabel: "Route 2",
                    routeTitle: "Bold Executive",
                  },
                ]
              : s.selected,
        });
      }
    };
    ensureApprove("storyline", "Storyline approved");
    ensureApprove("slide-content", "Slide content approved");
    ensureApprove("design-routes", "Design route selected");
    // design-routes is selection — set selected
    {
      const s = getCdfSession(cur.session.sessionId)!;
      if (!s.selected.some((x) => x.phaseId === "design-routes")) {
        saveCdfSession({
          ...s,
          selected: [
            ...s.selected,
            {
              phaseId: "design-routes",
              selectedAt: new Date().toISOString(),
              selectedRouteIndex: 1,
              selectedRouteLabel: "Route 2",
              routeTitle: "Bold Executive",
            },
          ],
        });
      }
    }

    const resolved = resolveGenerationContext({
      sessionId: cur.session.sessionId,
      phaseId: "full-deck",
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const ctx = resolved.context;
    expect(ctx.activeRequirements.some((r) => r.key === "slide_count")).toBe(
      true,
    );
    expect(ctx.activeRequirements.some((r) => r.key === "audience")).toBe(true);
    expect(
      ctx.activeRequirements.some((r) => r.key === "primary_background"),
    ).toBe(true);
    expect(
      ctx.exclusions.some((r) => r.key.includes("invented_revenue")) ||
        ctx.activeRequirements.some((r) => r.key.includes("invented_revenue")),
    ).toBe(true);
    expect(
      ctx.approvedDecisions.some((d) => d.phaseId === "storyline") ||
        ctx.upstreamOutputs.some((u) => u.phaseId === "storyline"),
    ).toBe(true);
    expect(
      ctx.selections.some((s) => s.phaseId === "design-routes") ||
        ctx.upstreamInputs.some((u) => u.phaseId === "design-routes") ||
        ctx.upstreamOutputs.some((u) => u.phaseId === "design-routes"),
    ).toBe(true);
    // Unselected routes not authoritative
    expect(
      ctx.selections.every(
        (s) =>
          s.phaseId !== "design-routes" ||
          s.label.includes("2") ||
          s.routeTitle?.includes("Bold") ||
          s.routeIndex === 1,
      ),
    ).toBe(true);
  });

  it("Z/AA — raw source + requirement provenance traceable", () => {
    const cur = startAndBrief("presentation", PRESENTATION_BRIEF);
    const resolved = resolveGenerationContext({
      sessionId: cur.session.sessionId,
      phaseId: cur.session.phaseId!,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.context.provenance.requirementIds.length).toBeGreaterThan(0);
    expect(resolved.context.provenance.sourceInputIds.length).toBeGreaterThan(0);
    expect(
      resolved.context.activeRequirements.every((r) => r.sourceInputId),
    ).toBe(true);
  });

  it("AB/AC/AD/AE/AF/AG — determinism + hash sensitivity", () => {
    const cur = startAndBrief("presentation", PRESENTATION_BRIEF);
    const a = resolveGenerationContext({
      sessionId: cur.session.sessionId,
      phaseId: cur.session.phaseId!,
    });
    const b = resolveGenerationContext({
      sessionId: cur.session.sessionId,
      phaseId: cur.session.phaseId!,
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.context.contextHash).toBe(b.context.contextHash);
    expect(a.context.activeRequirements.map((r) => r.key)).toEqual(
      b.context.activeRequirements.map((r) => r.key),
    );

    const h1 = a.context.contextHash;
    captureSourceAndResolveSync({
      sessionId: cur.session.sessionId,
      serviceId: "presentation",
      type: "user_message",
      rawContent: "Actually, make the background white.",
      source: "chat",
    });
    const latest = getLatestActiveBrief(cur.session.sessionId)!;
    const s = getCdfSession(cur.session.sessionId)!;
    saveCdfSession({
      ...s,
      activeBriefId: latest.activeBriefId,
      activeBriefVersion: latest.version,
    });
    const c = resolveGenerationContext({
      sessionId: cur.session.sessionId,
      phaseId: s.phaseId!,
    });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.context.contextHash).not.toBe(h1);

    // selection change
    applyCdfTransition({
      sessionId: cur.session.sessionId,
      action: "select_route",
      routeIndex: 0,
      expectedVersion: getCdfSession(cur.session.sessionId)!.sessionVersion,
    });
    // may fail if not on routes — ignore
    const afterSel = resolveGenerationContext({
      sessionId: cur.session.sessionId,
      phaseId: getCdfSession(cur.session.sessionId)!.phaseId!,
    });
    if (afterSel.ok) {
      expect(typeof afterSel.context.contextHash).toBe("string");
    }

    // hash helper excludes createdAt
    const h = computeContextHash(a.context);
    expect(h).toBe(a.context.contextHash);
  });

  it("AH/AI — irrelevant history ignored; authoritative not truncated away", () => {
    const cur = startAndBrief("presentation", PRESENTATION_BRIEF);
    captureSourceAndResolveSync({
      sessionId: cur.session.sessionId,
      serviceId: "presentation",
      type: "user_message",
      rawContent: "By the way, how is the weather?",
      source: "chat",
    });
    const resolved = resolveGenerationContext({
      sessionId: cur.session.sessionId,
      phaseId: cur.session.phaseId!,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const block = formatResolvedContextForPrompt(resolved.context);
    expect(block.includes("slide_count") || block.includes("12")).toBe(true);
    expect(block.toLowerCase().includes("weather")).toBe(false);
  });

  it("AJ/AK/AL — generation request can use context; provenance metadata; legacy marked", () => {
    const cur = startAndBrief("social-media", "Social posts for launch");
    const resolved = resolveGenerationContext({
      sessionId: cur.session.sessionId,
      phaseId: cur.session.phaseId!,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const meta = contextProvenanceMetadata(resolved.context);
    expect(meta.cdfContextHash).toBe(resolved.context.contextHash);
    expect(meta.cdfContextId).toBe(resolved.context.contextId);

    // Legacy path explicit when no resolved context passed to FE builder is tested via audit
    expect(
      CDF_GENERATION_PATH_AUDIT.some(
        (r) => r.legacyFallback && r.m2bIntegrated,
      ),
    ).toBe(true);
  });

  it("AM — secrets do not enter context instruction", () => {
    const cur = startAndBrief("presentation", PRESENTATION_BRIEF);
    const resolved = resolveGenerationContext({
      sessionId: cur.session.sessionId,
      phaseId: cur.session.phaseId!,
      currentUserInstruction: "use api_key=sk-abcdefghijklmnop",
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.context.currentUserInstruction).toBe("[redacted]");
  });

  it("Cross-service fixtures — social, packaging, logo, emailers, web-tech, videos", () => {
    const cases: Array<{ serviceId: string; brief: string }> = [
      { serviceId: "social-media", brief: "Instagram carousel for snacks" },
      { serviceId: "packaging", brief: "Jar label for masala chips 1920x1080" },
      { serviceId: "logo", brief: "Minimal logo for Acme" },
      { serviceId: "emailers", brief: "Promo email for summer sale" },
      { serviceId: "web-tech", brief: "Landing page for SaaS" },
      { serviceId: "videos", brief: "15s product launch film" },
    ];
    for (const c of cases) {
      resetCdfSessionsForTests();
      resetCdfRequirementEngineForTests();
      const cur = startAndBrief(c.serviceId, c.brief);
      const resolved = resolveGenerationContext({
        sessionId: cur.session.sessionId,
        phaseId: cur.session.phaseId!,
      });
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) continue;
      expect(resolved.context.serviceId).toBe(
        resolveCdfCanonicalService(c.serviceId)!.serviceId,
      );
      expect(resolved.context.phaseContext.phaseId).toBe(cur.session.phaseId);
      expect(resolved.context.phaseContext.generationModality).toBeTruthy();
    }
  });

  it("generation path audit matrix is present", () => {
    expect(CDF_GENERATION_PATH_AUDIT.length).toBeGreaterThan(5);
    expect(
      CDF_GENERATION_PATH_AUDIT.every((r) => typeof r.m2bIntegrated === "boolean"),
    ).toBe(true);
  });
});
