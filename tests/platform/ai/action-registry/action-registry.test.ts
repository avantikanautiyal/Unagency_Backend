/**
 * Phase 14 — Action Registry / Capability Contract tests.
 * Declarative registry only — no executeAction / provider / artifact lookup.
 */

import {
  buildServiceDependencyContract,
  CDF_CANONICAL_GENERATION_CONTEXT_ENV,
  listCdfCanonicalServiceIds,
  orchestrateCanonicalGenerationContext,
  applyCdfTransition,
  resetCdfSessionsForTests,
  resetCdfRequirementEngineForTests,
  resetCdfArtifactEngineForTests,
} from "../../../../src/platform/cdf";
import {
  getActionRegistryContractVersion,
  listAllActionDefinitions,
  listAvailableActions,
  listGenerationActionsForService,
  resetActionRegistryForTests,
  resolveAction,
  type ActionDefinition,
} from "../../../../src/platform/ai/action-registry";

describe("Phase 14 Action Registry / Capability Contract", () => {
  const prevFlag = process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV];

  beforeEach(() => {
    resetActionRegistryForTests();
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "1";
  });

  afterAll(() => {
    if (prevFlag === undefined) {
      delete process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV];
    } else {
      process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = prevFlag;
    }
  });

  it("1 — all registered action IDs resolve", () => {
    const all = listAllActionDefinitions();
    expect(all.length).toBeGreaterThan(50);
    for (const a of all) {
      if (!a.enabled) continue;
      const r = resolveAction(a.actionId, a.version);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.action.actionId).toBe(a.actionId);
    }
  });

  it("2 — exact action version resolves", () => {
    const r = resolveAction("canonical.semantic.versioned_example", "1.0.0");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action.version).toBe("1.0.0");
  });

  it("3 — unsupported action version fails", () => {
    const r = resolveAction("cdf.transition.approve", "9.9.9");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("UNSUPPORTED_VERSION");
  });

  it("4 — unknown action fails", () => {
    const r = resolveAction("does.not.exist");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("UNKNOWN_ACTION");
  });

  it("5 — disabled action is explicit", () => {
    const r = resolveAction("canonical.semantic.disabled_example");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("ACTION_DISABLED");
  });

  it("6 — no silent version downgrade", () => {
    const current = resolveAction("canonical.semantic.versioned_example");
    expect(current.ok).toBe(true);
    if (current.ok) expect(current.action.version).toBe("2.0.0");
    const miss = resolveAction("canonical.semantic.versioned_example", "1.5.0");
    expect(miss.ok).toBe(false);
    if (!miss.ok) {
      expect(miss.code).toBe("UNSUPPORTED_VERSION");
      expect(miss.availableVersions).toEqual(
        expect.arrayContaining(["1.0.0", "2.0.0"]),
      );
    }
  });

  it("7 — CDF phases map without duplicate source definitions", () => {
    const phases = listAllActionDefinitions().filter(
      (a) => a.sourceRegistry === "cdf_canonical_phases",
    );
    const refs = new Set(phases.map((a) => a.sourceReference));
    expect(refs.size).toBe(phases.length);
    expect(phases.every((a) => a.sourceReference.startsWith("CDF_CANONICAL"))).toBe(
      true,
    );
  });

  it("8 — CTI capabilities map without replacing CTI", () => {
    const cti = listAllActionDefinitions().filter(
      (a) => a.sourceRegistry === "cti_conversational_actions",
    );
    expect(cti.length).toBeGreaterThanOrEqual(20);
    expect(cti.every((a) => a.metadata.replacesCti === false)).toBe(true);
    expect(cti.every((a) => a.metadata.identifiesOnly === true)).toBe(true);
  });

  it("9 — generation actions declare required canonical context", () => {
    const gens = listAllActionDefinitions().filter(
      (a) => a.executionMode === "MODEL_GENERATION" && a.domain.startsWith("cdf."),
    );
    expect(gens.length).toBeGreaterThan(10);
    for (const g of gens) {
      expect(g.requiredContext).toEqual(
        expect.arrayContaining([
          "current_instruction",
          "cdf_session",
          "cdf_phase",
        ]),
      );
      expect(g.metadata.contextAssembly).toBe("context_orchestrator");
    }
  });

  it("10 — artifact-consuming actions declare upstream artifact", () => {
    const approve = resolveAction("cdf.transition.approve");
    expect(approve.ok).toBe(true);
    if (approve.ok) {
      expect(approve.action.requiredContext).toContain("upstream_artifact");
    }
    const art = resolveAction("artifact.approve");
    expect(art.ok).toBe(true);
    if (art.ok) {
      expect(art.action.requiredContext).toContain("upstream_artifact");
    }
  });

  it("11 — reference-consuming actions declare resolved_reference (optional/required)", () => {
    const slide = resolveAction(
      "cdf.phase.presentation.slide-content.generate",
    );
    expect(slide.ok).toBe(true);
    if (slide.ok) {
      const ctx = [
        ...slide.action.requiredContext,
        ...slide.action.optionalContext,
      ];
      expect(ctx).toContain("resolved_reference");
    }
  });

  it("12 — multimodal actions declare multimodal requirements", () => {
    const story = resolveAction("cdf.phase.presentation.storyline.generate");
    expect(story.ok).toBe(true);
    if (story.ok) {
      expect(story.action.optionalContext).toContain("multimodal_context");
    }
    const img = resolveAction("capability.image.generate");
    expect(img.ok).toBe(true);
    if (img.ok) {
      expect(img.action.optionalContext).toContain("multimodal_context");
    }
  });

  it("13 — working-memory requirements are explicit", () => {
    const gens = listGenerationActionsForService("presentation");
    for (const g of gens) {
      expect(g.optionalContext).toContain("working_memory");
    }
  });

  it("14 — deterministic actions are marked deterministic", () => {
    const det = listAllActionDefinitions().filter(
      (a) =>
        a.executionMode === "STATE_TRANSITION" ||
        a.executionMode === "DETERMINISTIC_EXECUTION" ||
        a.executionMode === "ARTIFACT_OPERATION" ||
        (a.executionMode === "RENDER_EXPORT" && a.actionType !== "generation"),
    );
    for (const a of det) {
      if (a.actionId.includes("refine") && a.executionMode === "MODEL_GENERATION") {
        continue;
      }
      expect(a.deterministic).toBe(true);
    }
  });

  it("15 — deterministic actions do not require model runtime", () => {
    const select = resolveAction("cdf.transition.select_route");
    expect(select.ok).toBe(true);
    if (select.ok) {
      expect(select.action.deterministic).toBe(true);
      expect(select.action.executionMode).not.toBe("MODEL_GENERATION");
      expect(select.action.metadata.requiresModelRuntime).not.toBe(true);
    }
    const dieline = resolveAction("cdf.phase.packaging.dieline.configure");
    expect(dieline.ok).toBe(true);
    if (dieline.ok) {
      expect(dieline.action.deterministic).toBe(true);
      expect(dieline.action.executionMode).not.toBe("MODEL_GENERATION");
    }
  });

  it("16 — action contracts contain output definitions", () => {
    for (const a of listAllActionDefinitions()) {
      expect(a.outputContract.kind).toBeTruthy();
    }
  });

  it("17 — authorization requirements are represented", () => {
    const approve = resolveAction("cdf.transition.approve");
    expect(approve.ok).toBe(true);
    if (approve.ok) {
      expect(approve.action.authorizationRequirements.length).toBeGreaterThan(0);
      expect(approve.action.authorizationRequirements).toContain(
        "cdf_session_ownership",
      );
    }
  });

  it("18 — side-effect classification works", () => {
    const levels = new Set(
      listAllActionDefinitions().map((a) => a.sideEffectLevel),
    );
    expect(levels.has("MUTATING")).toBe(true);
    expect(levels.has("READ_ONLY") || levels.has("NONE")).toBe(true);
  });

  it("19 — action versioning works", () => {
    expect(getActionRegistryContractVersion()).toBe("14.0.0");
    const v1 = resolveAction("canonical.semantic.versioned_example", "1.0.0");
    const v2 = resolveAction("canonical.semantic.versioned_example", "2.0.0");
    expect(v1.ok && v2.ok).toBe(true);
    if (v1.ok && v2.ok) {
      expect(v1.action.displayName).not.toBe(v2.action.displayName);
    }
  });

  it("20 — provider neutrality", () => {
    for (const a of listAllActionDefinitions()) {
      expect(a.actionId.toLowerCase()).not.toMatch(/openai|anthropic|gemini/);
      expect(JSON.stringify(a)).not.toMatch(/OpenAIAction|AnthropicAction/);
    }
  });

  it("21 — no raw prompt exists in ActionDefinition", () => {
    for (const a of listAllActionDefinitions()) {
      expect(a).not.toHaveProperty("prompt");
      expect(a.metadata.rawPrompt).toBeUndefined();
      expect(JSON.stringify(a.inputContract)).not.toMatch(/systemPrompt|rawPrompt/);
    }
  });

  it("22 — Presentation action mapping", () => {
    const gens = listGenerationActionsForService("presentation");
    const ids = gens.map((g) => g.actionId);
    expect(ids).toEqual(
      expect.arrayContaining([
        "cdf.phase.presentation.storyline.generate",
        "cdf.phase.presentation.slide-content.generate",
        "cdf.phase.presentation.full-deck.generate",
      ]),
    );
    const slide = resolveAction(
      "cdf.phase.presentation.slide-content.generate",
    );
    expect(slide.ok).toBe(true);
    if (slide.ok) {
      expect(slide.action.requiredContext).toContain("upstream_artifact");
      expect(slide.action.metadata.artifactContinuityComplete).toBe(true);
    }
  });

  it("23 — Packaging action mapping", () => {
    const gens = listGenerationActionsForService("packaging");
    expect(gens.some((g) => g.actionId.includes("routes.generate"))).toBe(
      true,
    );
    expect(gens.some((g) => g.actionId.includes("3d-direction.generate"))).toBe(
      true,
    );
  });

  it("24 — Social Media action mapping", () => {
    const gens = listGenerationActionsForService("social-media");
    expect(
      gens.some((g) => g.actionId === "cdf.phase.social-media.routes.generate"),
    ).toBe(true);
    expect(
      gens.some((g) => g.actionId === "cdf.phase.social-media.output.generate"),
    ).toBe(true);
  });

  it("25 — all 15 CDF services have expected action coverage", () => {
    const ids = listCdfCanonicalServiceIds();
    expect(ids).toHaveLength(15);
    for (const serviceId of ids) {
      const phases = listAllActionDefinitions().filter(
        (a) => a.metadata.serviceId === serviceId,
      );
      expect(phases.length).toBeGreaterThan(0);
      const gens = listGenerationActionsForService(serviceId);
      expect(gens.length).toBeGreaterThan(0);
    }
  });

  it("26 — Class-D services not falsely marked artifact-complete", () => {
    for (const serviceId of listCdfCanonicalServiceIds()) {
      const contract = buildServiceDependencyContract(serviceId);
      const gens = listGenerationActionsForService(serviceId);
      for (const g of gens) {
        if (contract.classification === "D") {
          expect(g.metadata.artifactContinuityComplete).toBe(false);
          expect(String(g.metadata.classDLimitation ?? "")).toMatch(
            /deep ArtifactVersion|lacks deep/i,
          );
        }
        if (contract.classification === "A") {
          expect(g.metadata.serviceDependencyClass).toBe("A");
        }
      }
    }
  });

  it("27 — Action Registry does not perform artifact lookup", () => {
    const src = JSON.stringify(
      listAllActionDefinitions().filter((a) => a.domain === "artifact"),
    );
    expect(src).not.toMatch(/getArtifactVersion\(|loadUpstream/);
    expect(
      listAllActionDefinitions().every(
        (a) => a.metadata.performsLookup !== true,
      ),
    ).toBe(true);
  });

  it("28 — Action Registry does not perform reference resolution", () => {
    for (const a of listAllActionDefinitions()) {
      expect(a.metadata.resolvesReferences).not.toBe(true);
    }
  });

  it("29 — Action Registry does not perform conversation retrieval", () => {
    for (const a of listAllActionDefinitions()) {
      expect(a.metadata.loadsConversation).not.toBe(true);
    }
  });

  it("30 — Action Registry does not perform provider calls", () => {
    // Structural: no execute / dispatch symbols on public API surface via definitions
    for (const a of listAllActionDefinitions()) {
      expect(a).not.toHaveProperty("execute");
      expect(a).not.toHaveProperty("dispatch");
      expect(a.metadata.providerCall).not.toBe(true);
    }
  });

  it("31 — flag-OFF canonical generation behavior remains unchanged", () => {
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "0";
    const started = applyCdfTransition({
      action: "start",
      serviceId: "presentation",
      productMode: "ai",
      organizationId: "org_p14",
      projectId: "proj_p14",
    });
    if (!started.ok) throw new Error("start");
    const briefed = applyCdfTransition({
      action: "submit_brief",
      sessionId: started.value.session.sessionId,
      brief: "Brief",
      expectedVersion: started.value.session.sessionVersion,
    });
    if (!briefed.ok) throw new Error("brief");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "LEGACY_P14",
      conversationalInstruction: "x",
      metadata: {
        cdfSessionId: briefed.value.session.sessionId,
        cdfPhaseId: "source",
        cdfServiceId: "presentation",
      },
      organizationId: "org_p14",
      projectId: "proj_p14",
    });
    expect(orch.ok && orch.skipped).toBe(true);
    if (!orch.ok || !orch.skipped) throw new Error("skip");
    expect(orch.prompt).toBe("LEGACY_P14");
    // Registry still resolvable independently
    expect(resolveAction("cdf.transition.start").ok).toBe(true);
  });

  it("32 — registry integrity: sourceRegistry points at authoritative sources", () => {
    const allowed = new Set([
      "cdf_action_catalog",
      "cdf_canonical_phases",
      "cdf_state_machine",
      "cti_conversational_actions",
      "platform_capability_registry",
      "cdf_artifact_operations",
      "cdf_renderer_registry",
      "canonical_semantic",
    ]);
    for (const a of listAllActionDefinitions()) {
      expect(allowed.has(a.sourceRegistry)).toBe(true);
      expect(a.sourceReference.length).toBeGreaterThan(0);
    }
  });

  it("33 — slide-content requiredContext matches real workflow (upstream)", () => {
    const contract = buildServiceDependencyContract("presentation");
    const edge = contract.contentDependentEdges.find(
      (e) => e.toPhaseId === "slide-content",
    );
    expect(edge?.kind).toBe("content");
    const action = resolveAction(
      "cdf.phase.presentation.slide-content.generate",
    );
    expect(action.ok).toBe(true);
    if (action.ok) {
      expect(action.action.requiredContext).toContain("upstream_artifact");
    }
  });

  it("34 — listAvailableActions filters by service without leaking disabled", () => {
    const list = listAvailableActions({ serviceId: "presentation" });
    expect(list.some((a) => a.actionId.includes("presentation"))).toBe(true);
    expect(
      list.some((a) => a.actionId === "canonical.semantic.disabled_example"),
    ).toBe(false);
  });

  it("35 — design-routes remains deterministic (not MODEL_GENERATION)", () => {
    const r = resolveAction("cdf.phase.presentation.design-routes.configure");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.action.deterministic).toBe(true);
      expect(r.action.executionMode).not.toBe("MODEL_GENERATION");
    }
  });
});

// Ensure ActionDefinition type is used (compile-time hygiene)
void (null as unknown as ActionDefinition);
