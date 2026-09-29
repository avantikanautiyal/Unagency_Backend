/**
 * CDF M2 — Requirement Fidelity Engine tests.
 */

import {
  applyCdfTransition,
  captureSourceAndResolveSync,
  checkRequirementFidelity,
  extractRequirementsFromSource,
  formatRequirementSnapshotForPrompt,
  getLatestActiveBrief,
  getRequirementQuery,
  listRequirements,
  listSourceInputs,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  resolveActiveRequirements,
  validateRequirement,
  CDF_REQUIREMENT_PRIORITY_RANK,
  type CdfRequirement,
  type CdfSourceInput,
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

describe("CDF M2 Requirement Engine", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
  });

  function startSession(serviceId = "presentation") {
    const started = applyCdfTransition({
      action: "start",
      serviceId,
      productMode: "ai",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error("start failed");
    return started.value;
  }

  it("A/B/V/W/X/Y — submit_brief persists raw SourceInput + ActiveBrief; SM still advances phase", () => {
    const started = startSession();
    const beforePhase = started.session.phaseIndex;
    const briefed = applyCdfTransition({
      sessionId: started.session.sessionId,
      action: "submit_brief",
      brief: PRESENTATION_BRIEF,
      expectedVersion: started.session.sessionVersion,
    });
    expect(briefed.ok).toBe(true);
    if (!briefed.ok) return;

    const sources = listSourceInputs(started.session.sessionId);
    expect(sources.length).toBeGreaterThanOrEqual(1);
    expect(sources[0]!.rawContent).toBe(PRESENTATION_BRIEF);
    expect(sources[0]!.type).toBe("user_prompt");

    const brief = getLatestActiveBrief(started.session.sessionId);
    expect(brief).toBeTruthy();
    expect(brief!.version).toBe(1);
    expect(briefed.value.session.activeBriefId).toBe(brief!.activeBriefId);
    expect(briefed.value.session.activeBriefVersion).toBe(1);

    // State machine advanced independently
    expect(briefed.value.session.phaseIndex).toBeGreaterThan(beforePhase);
    expect(briefed.value.session.brief).toBe(PRESENTATION_BRIEF);
  });

  it("C/D/E/AD — explicit vs inferred; inference cannot outrank explicit", () => {
    const started = startSession();
    applyCdfTransition({
      sessionId: started.session.sessionId,
      action: "submit_brief",
      brief: "Tone: premium. Use blue.",
      expectedVersion: started.session.sessionVersion,
    });

    const active = listRequirements(started.session.sessionId).filter(
      (r) => r.status === "active" && r.key.startsWith("tone."),
    );
    expect(active.some((r) => r.explicit && r.displayValue === "premium")).toBe(
      true,
    );

    const historical = listRequirements(started.session.sessionId);
    const source = listSourceInputs(started.session.sessionId)[0]!;
    const inference: CdfRequirement = {
      requirementId: "req_infer_test",
      sessionId: started.session.sessionId,
      serviceId: "presentation",
      key: "tone.premium",
      value: { kind: "string", value: "means black gold serif" },
      displayValue: "means black gold serif",
      category: "tone",
      priority: "ai_inference",
      provenance: {
        sourceInputId: source.sourceInputId,
        sourceType: "user_prompt",
        extractionMethod: "ai_inferred",
        explicit: false,
        confidence: 0.4,
      },
      status: "active",
      confidence: 0.4,
      explicit: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const resolved = resolveActiveRequirements({
      sessionId: started.session.sessionId,
      serviceId: "presentation",
      historical,
      incoming: [inference],
      sourceInputIds: [source.sourceInputId],
      previousBrief: getLatestActiveBrief(started.session.sessionId)!,
    });

    const toneActive = resolved.brief.activeRequirements.filter(
      (r) => r.key === "tone.premium",
    );
    expect(toneActive.every((r) => r.explicit)).toBe(true);
    expect(
      toneActive.some((r) => r.displayValue === "means black gold serif"),
    ).toBe(false);
    expect(CDF_REQUIREMENT_PRIORITY_RANK.ai_inference).toBeGreaterThan(
      CDF_REQUIREMENT_PRIORITY_RANK.explicit_current_user_instruction,
    );
  });

  it("F/G/H/K/AA — override supersedes; ambiguous nudge does not wipe color; lineage immutable", () => {
    const started = startSession();
    const s1 = applyCdfTransition({
      sessionId: started.session.sessionId,
      action: "submit_brief",
      brief: "Use a dark navy background.",
      expectedVersion: started.session.sessionVersion,
    });
    expect(s1.ok).toBe(true);
    if (!s1.ok) return;

    const navy = listRequirements(started.session.sessionId).find(
      (r) => r.key === "primary_background" && r.status === "active",
    );
    expect(navy?.displayValue).toMatch(/dark_navy|navy/);
    const navyValue = JSON.stringify(navy!.value);

    captureSourceAndResolveSync({
      sessionId: started.session.sessionId,
      serviceId: "presentation",
      type: "user_message",
      rawContent: "Actually, make the background white.",
      source: "chat",
    });

    const after = listRequirements(started.session.sessionId);
    const oldNavy = after.find((r) => r.requirementId === navy!.requirementId);
    expect(oldNavy!.status).toBe("superseded");
    expect(JSON.stringify(oldNavy!.value)).toBe(navyValue); // immutable

    const white = after.find(
      (r) => r.key === "primary_background" && r.status === "active",
    );
    expect(white?.displayValue).toBe("white");
    expect(white?.supersedesRequirementId).toBe(navy!.requirementId);

    const briefV = getLatestActiveBrief(started.session.sessionId)!;
    expect(briefV.version).toBeGreaterThanOrEqual(2);
    expect(briefV.overrides.length).toBeGreaterThanOrEqual(1);

    // Ambiguous premium nudge must NOT restore dark_navy
    captureSourceAndResolveSync({
      sessionId: started.session.sessionId,
      serviceId: "presentation",
      type: "user_message",
      rawContent: "Can we make it feel more premium?",
      source: "chat",
    });

    const finalBg = listRequirements(started.session.sessionId).find(
      (r) => r.key === "primary_background" && r.status === "active",
    );
    expect(finalBg?.displayValue).toBe("white");
    expect(
      listRequirements(started.session.sessionId).some(
        (r) =>
          r.key.startsWith("tone.") &&
          r.displayValue === "premium" &&
          r.status === "active",
      ),
    ).toBe(true);
  });

  it("I — ActiveBrief versions increment", () => {
    const started = startSession("social-media");
    applyCdfTransition({
      sessionId: started.session.sessionId,
      action: "submit_brief",
      brief: "First brief for social",
      expectedVersion: started.session.sessionVersion,
    });
    expect(getLatestActiveBrief(started.session.sessionId)!.version).toBe(1);
    captureSourceAndResolveSync({
      sessionId: started.session.sessionId,
      serviceId: "social-media",
      type: "user_message",
      rawContent: "Also target Instagram",
      source: "chat",
    });
    expect(getLatestActiveBrief(started.session.sessionId)!.version).toBe(2);
  });

  it("J — conflicting requirements without clear override are marked conflicted", () => {
    const started = startSession();
    applyCdfTransition({
      sessionId: started.session.sessionId,
      action: "submit_brief",
      brief: "Create a 10-slide deck.",
      expectedVersion: started.session.sessionVersion,
    });
    captureSourceAndResolveSync({
      sessionId: started.session.sessionId,
      serviceId: "presentation",
      type: "user_message",
      rawContent: "Create a 15-slide deck.",
      source: "chat",
    });
    const q = getRequirementQuery(started.session.sessionId);
    const slideStates = q.requirements.filter((r) => r.key === "slide_count");
    expect(
      slideStates.some((r) => r.status === "conflicted") ||
        q.conflicts.length > 0,
    ).toBe(true);
  });

  it("L/M — selection distinct from approval; legacy compat marked", () => {
    const started = startSession("social-media");
    let cur = applyCdfTransition({
      sessionId: started.session.sessionId,
      action: "submit_brief",
      brief: "Social launch",
      expectedVersion: started.session.sessionVersion,
    });
    expect(cur.ok).toBe(true);
    if (!cur.ok) return;
    cur = applyCdfTransition({
      sessionId: started.session.sessionId,
      action: "select_route",
      routeIndex: 0,
      expectedVersion: cur.value.session.sessionVersion,
    });
    // may need more selects depending on gates
    while (cur.ok && cur.value.ui.currentPhase?.type === "routes") {
      cur = applyCdfTransition({
        sessionId: started.session.sessionId,
        action: "select_route",
        routeIndex: 0,
        expectedVersion: cur.value.session.sessionVersion,
      });
    }

    const sources = listSourceInputs(started.session.sessionId);
    expect(sources.some((s) => s.type === "selection")).toBe(true);
    expect(sources.some((s) => s.type === "legacy_select_compat")).toBe(true);

    const reqs = listRequirements(started.session.sessionId);
    expect(reqs.some((r) => r.key.startsWith("selection."))).toBe(true);
    // legacy compat must not become approval.*
    expect(
      reqs
        .filter((r) => r.provenance.sourceType === "legacy_select_compat")
        .every((r) => !r.key.startsWith("approval.")),
    ).toBe(true);
  });

  it("N/Z — multiple messages accumulate; raw prompt retrievable later", () => {
    const started = startSession();
    applyCdfTransition({
      sessionId: started.session.sessionId,
      action: "submit_brief",
      brief: PRESENTATION_BRIEF,
      expectedVersion: started.session.sessionVersion,
    });
    captureSourceAndResolveSync({
      sessionId: started.session.sessionId,
      serviceId: "presentation",
      type: "user_message",
      rawContent: "Also emphasize product screenshots.",
      source: "chat",
    });
    const q = getRequirementQuery(started.session.sessionId);
    expect(q.sources.length).toBeGreaterThanOrEqual(2);
    expect(q.sources[0]!.rawContent).toBe(PRESENTATION_BRIEF);
    expect(q.sources.some((s) => s.rawContent.includes("screenshots"))).toBe(
      true,
    );
  });

  it("O — critical requirements survive beyond prompt truncation", () => {
    const longTail = "X".repeat(5000);
    const started = startSession();
    applyCdfTransition({
      sessionId: started.session.sessionId,
      action: "submit_brief",
      brief: `${PRESENTATION_BRIEF}\n\nNotes:\n${longTail}`,
      expectedVersion: started.session.sessionVersion,
    });
    const snap = getRequirementQuery(started.session.sessionId).snapshot!;
    expect(snap.rawSourceTexts[0]!.rawContent.includes("12-slide")).toBe(true);
    expect(snap.rawSourceTexts[0]!.rawContent.length).toBeGreaterThan(4000);
    const prompt = formatRequirementSnapshotForPrompt(snap);
    expect(prompt.includes("slide_count") || prompt.includes("12")).toBe(true);
    expect(prompt.includes("dark_navy") || prompt.includes("navy")).toBe(true);
  });

  it("P — uploaded references without binary duplication", () => {
    const started = startSession();
    applyCdfTransition({
      sessionId: started.session.sessionId,
      action: "submit_brief",
      brief: "Deck with logo reference",
      expectedVersion: started.session.sessionVersion,
    });
    captureSourceAndResolveSync({
      sessionId: started.session.sessionId,
      serviceId: "presentation",
      type: "uploaded_image",
      rawContent: "asset:logo_ref_1",
      metadata: { assetId: "logo_ref_1", mimeType: "image/png", fileName: "logo.png" },
      source: "upload",
    });
    const ref = listRequirements(started.session.sessionId).find(
      (r) => r.key === "reference.asset",
    );
    expect(ref).toBeTruthy();
    expect(ref!.value.kind).toBe("object");
  });

  it("Q — refinement becomes source input", () => {
    const started = startSession("social-media");
    let cur = applyCdfTransition({
      sessionId: started.session.sessionId,
      action: "submit_brief",
      brief: "Social creative",
      expectedVersion: started.session.sessionVersion,
    });
    expect(cur.ok).toBe(true);
    if (!cur.ok) return;
    // advance to output
    for (let i = 0; i < 6 && cur.ok; i++) {
      const phase = cur.value.ui.currentPhase;
      if (!phase) break;
      if (phase.type === "routes") {
        cur = applyCdfTransition({
          sessionId: started.session.sessionId,
          action: "select_route",
          routeIndex: 0,
          expectedVersion: cur.value.session.sessionVersion,
        });
      } else if (phase.type === "output") break;
      else break;
    }
    if (cur.ok && cur.value.ui.currentPhase?.type === "output") {
      const refined = applyCdfTransition({
        sessionId: started.session.sessionId,
        action: "refine",
        refinePrompt: "Make slide 7 title larger.",
        expectedVersion: cur.value.session.sessionVersion,
      });
      expect(refined.ok).toBe(true);
      expect(
        listSourceInputs(started.session.sessionId).some(
          (s) =>
            s.type === "refinement" &&
            s.rawContent.includes("Make slide 7 title larger"),
        ),
      ).toBe(true);
    }
  });

  it("R/S — ActiveBrief reconstructable; references valid requirements only", () => {
    const started = startSession();
    applyCdfTransition({
      sessionId: started.session.sessionId,
      action: "submit_brief",
      brief: PRESENTATION_BRIEF,
      expectedVersion: started.session.sessionVersion,
    });
    const q = getRequirementQuery(started.session.sessionId);
    expect(q.brief).toBeTruthy();
    const ids = new Set(q.requirements.map((r) => r.requirementId));
    for (const id of q.brief!.requirementIds) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it("T — invalid requirement records rejected", () => {
    const bad: CdfRequirement = {
      requirementId: "x",
      sessionId: "s",
      serviceId: "presentation",
      key: "tone",
      value: { kind: "string", value: "x" },
      displayValue: "x",
      category: "tone",
      priority: "ai_inference",
      provenance: {
        sourceInputId: "src",
        sourceType: "user_prompt",
        extractionMethod: "ai_inferred",
        explicit: true,
        confidence: 0.2,
      },
      status: "active",
      confidence: 0.2,
      explicit: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const issues = validateRequirement(bad);
    expect(issues.some((i) => i.code === "INVALID_PROVENANCE" || i.code === "EXPLICIT_MISMATCH")).toBe(
      true,
    );
  });

  it("U — requirement context snapshot contains active requirements", () => {
    const started = startSession();
    applyCdfTransition({
      sessionId: started.session.sessionId,
      action: "submit_brief",
      brief: PRESENTATION_BRIEF,
      expectedVersion: started.session.sessionVersion,
    });
    const snap = getRequirementQuery(started.session.sessionId).snapshot!;
    expect(snap.explicitRequirements.length).toBeGreaterThan(0);
    expect(snap.activeBriefVersion).toBe(1);
  });

  it("AB/AC — resolution deterministic", () => {
    resetCdfRequirementEngineForTests();
    const source: CdfSourceInput = {
      sourceInputId: "src_det",
      sessionId: "sess_det",
      serviceId: "presentation",
      type: "user_prompt",
      rawContent: PRESENTATION_BRIEF,
      createdAt: "2026-01-01T00:00:00.000Z",
      sequence: 1,
    };
    const a = extractRequirementsFromSource(source);
    const b = extractRequirementsFromSource(source);
    expect(a.map((r) => r.key).sort()).toEqual(b.map((r) => r.key).sort());

    const r1 = resolveActiveRequirements({
      sessionId: "sess_det",
      serviceId: "presentation",
      historical: [],
      incoming: a.map((r, i) => ({
        ...r,
        requirementId: `req_a_${i}`,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      })),
      sourceInputIds: ["src_det"],
      previousBrief: null,
    });
    const r2 = resolveActiveRequirements({
      sessionId: "sess_det",
      serviceId: "presentation",
      historical: [],
      incoming: a.map((r, i) => ({
        ...r,
        requirementId: `req_a_${i}`,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      })),
      sourceInputIds: ["src_det"],
      previousBrief: null,
    });
    expect(
      r1.brief.activeRequirements.map((x) => `${x.key}:${x.displayValue}`).sort(),
    ).toEqual(
      r2.brief.activeRequirements.map((x) => `${x.key}:${x.displayValue}`).sort(),
    );
  });

  it("Presentation fixture — expected structured requirements", () => {
    const started = startSession();
    applyCdfTransition({
      sessionId: started.session.sessionId,
      action: "submit_brief",
      brief: PRESENTATION_BRIEF,
      expectedVersion: started.session.sessionVersion,
    });
    const active = listRequirements(started.session.sessionId).filter(
      (r) => r.status === "active",
    );
    const byKey = Object.fromEntries(active.map((r) => [r.key, r.displayValue]));
    expect(byKey.slide_count).toBe("12");
    expect(String(byKey.audience).toLowerCase()).toContain("series");
    expect(byKey.primary_background).toMatch(/dark_navy|navy/);
    expect(byKey.text_color).toBe("white");
    expect(byKey.accent_color).toBe("green");
    expect(active.some((r) => r.key === "tone.premium")).toBe(true);
    expect(active.some((r) => r.key === "tone.credible")).toBe(true);
    const sections = active.find((r) => r.key === "mandatory_sections");
    expect(sections?.value.kind).toBe("string[]");
    if (sections?.value.kind === "string[]") {
      for (const s of [
        "problem",
        "solution",
        "market",
        "product",
        "ask",
      ]) {
        expect(sections.value.value).toContain(s);
      }
    }
    expect(
      active.some((r) => r.key.includes("invented_revenue")),
    ).toBe(true);

    const fidelity = checkRequirementFidelity(active, {
      slideCount: 12,
      sections: ["problem", "solution", "market", "product", "ask"],
    });
    expect(fidelity.checks.some((c) => c.key === "slide_count" && c.passed)).toBe(
      true,
    );
  });
});
