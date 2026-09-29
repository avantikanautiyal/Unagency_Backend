/**
 * Phase 13C — CDF service dependency & artifact contract classification tests.
 * Analysis gate — no new ingest adapters.
 */

import {
  assertNoSilentMetadataOnlyOnContentEdges,
  authoritativeMechanismForContentEdge,
  buildAllServiceDependencyContracts,
  buildServiceDependencyContract,
  CDF_CANONICAL_GENERATION_CONTEXT_ENV,
  CDF_DEEP_INGEST_RUNTIME_SERVICES,
  classifyDependencyEdge,
  hasDeepIngestRuntime,
  listCdfCanonicalServiceIds,
  orchestrateCanonicalGenerationContext,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  applyCdfTransition,
} from "../../../src/platform/cdf";
import type { CdfServiceDependencyClass } from "../../../src/platform/cdf";

const EXPECTED_CLASS: Record<string, CdfServiceDependencyClass> = {
  presentation: "A",
  packaging: "A",
  "social-media": "A",
  emailers: "D",
  "web-tech": "D",
  "brand-strategy": "D",
  "ad-campaigns": "D",
  logo: "D",
  "print-ooh": "D",
  videos: "D",
  "store-display": "D",
  merchandise: "D",
  illustration: "D",
  production: "D",
  "event-branding": "D",
};

describe("Phase 13C CDF Service Dependency Contracts", () => {
  const prevFlag = process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV];

  beforeEach(() => {
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

  it("1 — all 15 services are classified", () => {
    const ids = listCdfCanonicalServiceIds();
    expect(ids).toHaveLength(15);
    const contracts = buildAllServiceDependencyContracts();
    expect(contracts).toHaveLength(15);
    for (const id of ids) {
      const c = contracts.find((x) => x.serviceId === id);
      expect(c).toBeTruthy();
      expect(["A", "B", "C", "D"]).toContain(c!.classification);
      expect(EXPECTED_CLASS[id]).toBe(c!.classification);
    }
  });

  it("2 — every model phase and deterministic phase is identified", () => {
    for (const c of buildAllServiceDependencyContracts()) {
      expect(c.modelPhases.length + c.deterministicPhases.length).toBe(
        c.phases.length,
      );
      for (const p of c.phases) {
        if (p.isLlmGeneration) {
          expect(c.modelPhases).toContain(p.phaseId);
          expect(c.deterministicPhases).not.toContain(p.phaseId);
        }
        if (p.isDeterministic) {
          expect(c.deterministicPhases).toContain(p.phaseId);
        }
      }
      // Every service has a materialize final
      expect(c.deterministicPhases).toContain("final");
    }
  });

  it("3 — every multi-phase dependency edge is classified", () => {
    for (const c of buildAllServiceDependencyContracts()) {
      for (const e of c.edges) {
        expect(["content", "config", "none"]).toContain(e.kind);
      }
      assertNoSilentMetadataOnlyOnContentEdges(c);
    }
  });

  it("4 — Presentation contract is Class A with ArtifactVersion content edges", () => {
    const c = buildServiceDependencyContract("presentation");
    expect(c.classification).toBe("A");
    expect(c.hasDeepIngestRuntime).toBe(true);
    expect(c.modelPhases).toEqual(
      expect.arrayContaining([
        "storyline",
        "slide-content",
        "full-deck",
        "slide-refinement",
      ]),
    );
    expect(c.deterministicPhases).toEqual(
      expect.arrayContaining(["source", "design-routes", "final"]),
    );
    const storyToSlides = c.contentDependentEdges.find(
      (e) => e.fromPhaseId === "storyline" && e.toPhaseId === "slide-content",
    );
    expect(storyToSlides).toBeTruthy();
    expect(authoritativeMechanismForContentEdge(c, storyToSlides!)).toBe(
      "ArtifactVersion",
    );
    expect(c.acceptanceStatus).toBe("PASS");
  });

  it("5 — Packaging contract is Class A with routes→3d-direction content edge", () => {
    const c = buildServiceDependencyContract("packaging");
    expect(c.classification).toBe("A");
    expect(c.hasDeepIngestRuntime).toBe(true);
    const edge = c.contentDependentEdges.find(
      (e) => e.fromPhaseId === "routes" && e.toPhaseId === "3d-direction",
    );
    expect(edge).toBeTruthy();
    expect(authoritativeMechanismForContentEdge(c, edge!)).toBe(
      "ArtifactVersion",
    );
    expect(c.deterministicPhases).toContain("dieline");
    expect(c.deterministicPhases).toContain("final");
  });

  it("6 — Social Media contract is Class A with routes→output content edge", () => {
    const c = buildServiceDependencyContract("social-media");
    expect(c.classification).toBe("A");
    expect(c.hasDeepIngestRuntime).toBe(true);
    const edge = c.contentDependentEdges.find(
      (e) => e.fromPhaseId === "routes" && e.toPhaseId === "output",
    );
    expect(edge).toBeTruthy();
    expect(authoritativeMechanismForContentEdge(c, edge!)).toBe(
      "ArtifactVersion",
    );
    expect(c.deterministicPhases).toEqual(
      expect.arrayContaining(["platform", "size-reference", "final"]),
    );
  });

  it("7 — each remaining service has explicit dependency classification", () => {
    const deep = new Set(CDF_DEEP_INGEST_RUNTIME_SERVICES);
    for (const c of buildAllServiceDependencyContracts()) {
      if (deep.has(c.serviceId as (typeof CDF_DEEP_INGEST_RUNTIME_SERVICES)[number])) {
        continue;
      }
      expect(c.classification).toBe("D");
      expect(c.hasDeepIngestRuntime).toBe(false);
      expect(c.requiresArtifactVersionContinuity).toBe(true);
      expect(c.contentDependentEdges.length).toBeGreaterThan(0);
      expect(c.acceptanceStatus).toBe("DEFECT");
      expect(c.reason).toMatch(/no ArtifactVersion|legacy/i);
    }
  });

  it("8 — no content-dependent phase is silently classified as metadata-only", () => {
    for (const c of buildAllServiceDependencyContracts()) {
      for (const e of c.contentDependentEdges) {
        expect(e.kind).toBe("content");
        // Config-only classification must not apply to LLM→LLM
        const from = c.phases.find((p) => p.phaseId === e.fromPhaseId)!;
        const to = c.phases.find((p) => p.phaseId === e.toPhaseId)!;
        expect(classifyDependencyEdge(from, to)).toBe("content");
        expect(classifyDependencyEdge(from, to)).not.toBe("config");
      }
    }
  });

  it("9 — authoritative mechanism identified for every content-dependent edge", () => {
    for (const c of buildAllServiceDependencyContracts()) {
      for (const e of c.contentDependentEdges) {
        const mech = authoritativeMechanismForContentEdge(c, e);
        if (c.classification === "A") {
          expect(mech).toBe("ArtifactVersion");
        } else if (c.classification === "D") {
          expect(mech).toBe("MISSING");
        }
      }
    }
  });

  it("10 — deep ingest inventory matches Class A services only", () => {
    expect([...CDF_DEEP_INGEST_RUNTIME_SERVICES].sort()).toEqual(
      ["packaging", "presentation", "social-media"].sort(),
    );
    for (const id of listCdfCanonicalServiceIds()) {
      const deep = hasDeepIngestRuntime(id);
      const c = buildServiceDependencyContract(id);
      if (deep) expect(c.classification).toBe("A");
      if (c.classification === "A") expect(deep).toBe(true);
    }
  });

  it("11 — current user instruction authority unchanged (flag ON)", () => {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "brand-strategy",
      productMode: "ai",
      organizationId: "org_p13c",
      projectId: "proj_p13c",
    });
    if (!started.ok) throw new Error("start");
    const briefed = applyCdfTransition({
      action: "submit_brief",
      sessionId: started.value.session.sessionId,
      brief: "Brand audit brief",
      expectedVersion: started.value.session.sessionVersion,
    });
    if (!briefed.ok) throw new Error("brief");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "LEGACY",
      conversationalInstruction: "INSTRUCTION_A_AUTHORITATIVE",
      metadata: {
        cdfSessionId: briefed.value.session.sessionId,
        cdfPhaseId: briefed.value.session.phaseId,
        cdfServiceId: "brand-strategy",
        conversationalEffectiveInstruction: "INSTRUCTION_C",
      },
      organizationId: "org_p13c",
      projectId: "proj_p13c",
    });
    expect(orch.ok && !orch.skipped).toBe(true);
    if (!orch.ok || orch.skipped) throw new Error("orch");
    expect(orch.request.currentUserInstruction).toBe(
      "INSTRUCTION_A_AUTHORITATIVE",
    );
  });

  it("12 — deterministic phases are not classified as model generation", () => {
    for (const c of buildAllServiceDependencyContracts()) {
      for (const phaseId of c.deterministicPhases) {
        const p = c.phases.find((x) => x.phaseId === phaseId)!;
        expect(p.isLlmGeneration).toBe(false);
        expect(p.isDeterministic).toBe(true);
        const row = c.phaseRows.find((r) => r.phaseId === phaseId)!;
        expect(row.modelOrDeterministic).toBe("deterministic");
      }
    }
  });

  it("13 — config gates are config edges, not content edges", () => {
    const pack = buildServiceDependencyContract("packaging");
    const dielineToRoutes = pack.edges.find(
      (e) => e.fromPhaseId === "dieline" && e.toPhaseId === "routes",
    );
    expect(dielineToRoutes?.kind).toBe("config");

    const social = buildServiceDependencyContract("social-media");
    const sizeToRoutes = social.edges.find(
      (e) => e.fromPhaseId === "size-reference" && e.toPhaseId === "routes",
    );
    expect(sizeToRoutes?.kind).toBe("config");
  });

  it("14 — flag OFF remains unchanged", () => {
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "0";
    const started = applyCdfTransition({
      action: "start",
      serviceId: "emailers",
      productMode: "ai",
      organizationId: "org_p13c",
      projectId: "proj_p13c",
    });
    if (!started.ok) throw new Error("start");
    const briefed = applyCdfTransition({
      action: "submit_brief",
      sessionId: started.value.session.sessionId,
      brief: "Email brief",
      expectedVersion: started.value.session.sessionVersion,
    });
    if (!briefed.ok) throw new Error("brief");
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "LEGACY_PROMPT_P13C",
      conversationalInstruction: "ignored",
      metadata: {
        cdfSessionId: briefed.value.session.sessionId,
        cdfPhaseId: briefed.value.session.phaseId,
        cdfServiceId: "emailers",
      },
      organizationId: "org_p13c",
      projectId: "proj_p13c",
    });
    expect(orch.ok && orch.skipped).toBe(true);
    if (!orch.ok || !orch.skipped) throw new Error("expected skip");
    expect(orch.prompt).toBe("LEGACY_PROMPT_P13C");
  });
});
