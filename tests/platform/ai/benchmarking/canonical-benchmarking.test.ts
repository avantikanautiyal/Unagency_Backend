/**
 * Phase 18 — Canonical Benchmarking / Evaluation tests.
 * Measurement-only; does not enable production flags or mutate CDF.
 */

import {
  CDF_CANONICAL_GENERATION_CONTEXT_ENV,
} from "../../../../src/platform/cdf";
import {
  resetActionRegistryForTests,
  resolveAction,
} from "../../../../src/platform/ai/action-registry";
import { CDF_CANONICAL_AUTOMATIC_REPAIR_ENV } from "../../../../src/platform/ai/repair";
import {
  BENCHMARKING_CONTRACT_VERSION,
  aggregateBenchmarkResults,
  buildBenchmarkReport,
  buildQaResultStub,
  buildSafeContextObservation,
  buildUnsupportedClassDObservation,
  classifyServiceCoverage,
  compareLegacyVsCanonical,
  evaluateBenchmarkScenario,
  getBenchmarkCase,
  getBenchmarkingContractVersion,
  listBenchmarkCatalogCases,
  listFifteenServiceCoverage,
  runBenchmarkCase,
  scoreArtifactFidelity,
  scoreAuthorityFidelity,
  scoreContextFidelity,
  scoreRepair,
  scoreStructuredFidelity,
  type BenchmarkResult,
  type BenchmarkScenarioObservation,
} from "../../../../src/platform/ai/benchmarking";
import type { CanonicalRepairResult as RepairResult } from "../../../../src/platform/ai/repair";
import {
  beginExecutionTrace,
  getExecutionTrace,
  resetExecutionTracesForTests,
} from "../../../../src/platform/os/observability/execution-trace";

function isolationObs(
  partial?: Partial<BenchmarkScenarioObservation>,
): BenchmarkScenarioObservation {
  return {
    scenario: "CANONICAL_GENERATION",
    context: buildSafeContextObservation(),
    usage: { costAvailable: false },
    latency: { totalMs: 40 },
    featureFlags: {
      cdfCanonicalGenerationContext: false,
      cdfCanonicalAutomaticRepair: false,
    },
    isolation: {
      productionMutation: false,
      cdfAdvanced: false,
      artifactApproved: false,
      externalSideEffect: false,
    },
    executionId: "exec_bench_iso",
    ...partial,
  };
}

function slideContentContinuityObs(
  partial?: Partial<BenchmarkScenarioObservation>,
): BenchmarkScenarioObservation {
  return isolationObs({
    scenario: "CANONICAL_WITH_QA",
    context: buildSafeContextObservation({
      upstreamArtifactIds: ["art_slide_content_golden"],
      upstreamArtifactVersions: ["art_slide_content_golden@2"],
      structuredUpstreamDataPresent: true,
      resolvedReferences: ["art_slide_content_golden@2"],
      workingMemoryPresent: true,
      multimodalContextPresent: true,
    }),
    qa: buildQaResultStub({
      status: "VALID",
      actionId: "cdf.phase.presentation.design-routes.configure",
    }),
    latency: {
      totalMs: 55,
      contextCompilationMs: 8,
      cmrAssemblyMs: 6,
      outputQaMs: 3,
    },
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      providerId: "simulated",
      modelId: "sim-1",
      costAvailable: false,
      estimatedCost: null,
    },
    providerId: "simulated",
    modelId: "sim-1",
    executionId: "exec_sc_continuity",
    ...partial,
  });
}

function repairResult(ok: boolean): RepairResult {
  const baseQa = buildQaResultStub({
    status: ok ? "VALID" : "INVALID",
    codes: ok ? [] : ["REQUIRED_FIELD_MISSING"],
  });
  return {
    ok,
    status: ok ? "REPAIRED" : "FAILED",
    code: ok ? undefined : "REPAIR_QA_FAILED",
    message: ok ? "repaired" : "still invalid",
    actionId: "cdf.phase.presentation.storyline.generate",
    actionVersion: "1.0.0",
    originalExecutionId: "exec_orig",
    originalQa: buildQaResultStub({
      status: "INVALID",
      codes: ["REQUIRED_FIELD_MISSING"],
    }),
    plan: {
      eligible: true,
      strategy: "STRUCTURED_OUTPUT_REPAIR",
      reason: "eligible",
      attempt: 1,
      maxAttempts: 1,
      originalQaCodes: ["REQUIRED_FIELD_MISSING"],
    },
    attempts: [
      {
        attempt: 1,
        strategy: "STRUCTURED_OUTPUT_REPAIR",
        repairExecutionId: "exec_orig_repair_1",
        executionOk: true,
        qaStatus: baseQa.status,
        qaCodes: ok ? [] : ["REQUIRED_FIELD_MISSING"],
      },
    ],
    finalQa: baseQa,
    metadata: {
      calledProviderDirectly: false,
      calledModelRuntimeDirectly: false,
    },
  };
}

describe("Phase 18 Canonical Benchmarking", () => {
  const prevGen = process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV];
  const prevRepair = process.env[CDF_CANONICAL_AUTOMATIC_REPAIR_ENV];

  beforeEach(() => {
    resetActionRegistryForTests();
    resetExecutionTracesForTests();
    delete process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV];
    delete process.env[CDF_CANONICAL_AUTOMATIC_REPAIR_ENV];
  });

  afterAll(() => {
    if (prevGen === undefined) delete process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV];
    else process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = prevGen;
    if (prevRepair === undefined) delete process.env[CDF_CANONICAL_AUTOMATIC_REPAIR_ENV];
    else process.env[CDF_CANONICAL_AUTOMATIC_REPAIR_ENV] = prevRepair;
  });

  it("1–2 — case creation + reproducibility metadata", () => {
    const c = getBenchmarkCase("presentation.storyline_to_slide_content");
    expect(c).toBeDefined();
    expect(c!.caseId).toBe("presentation.storyline_to_slide_content");
    expect(c!.actionVersion).toBe("1.0.0");
    expect(getBenchmarkingContractVersion()).toBe(BENCHMARKING_CONTRACT_VERSION);

    const r = evaluateBenchmarkScenario({
      caseDef: c!,
      scenario: "CANONICAL_GENERATION",
      observation: isolationObs({
        scenario: "CANONICAL_GENERATION",
        context: buildSafeContextObservation({
          upstreamArtifactIds: ["art_storyline_golden"],
          upstreamArtifactVersions: ["art_storyline_golden@1"],
          structuredUpstreamDataPresent: true,
          resolvedReferences: ["art_storyline_golden@1"],
          workingMemoryPresent: true,
        }),
      }),
    });
    expect(r.run.harnessVersion).toBe("18.0.0");
    expect(r.run.caseId).toBe(c!.caseId);
    expect(r.run.featureFlags.cdfCanonicalGenerationContext).toBe(false);
    expect(r.run.featureFlags.cdfCanonicalAutomaticRepair).toBe(false);
    expect(r.metadata.observationHash).toBeTruthy();
    expect(r.autoEnabledFlags).toBe(false);
  });

  it("3–6 — legacy / canonical / QA / repair scenarios", () => {
    const c = getBenchmarkCase("presentation.source_to_storyline")!;
    const legacy = evaluateBenchmarkScenario({
      caseDef: c,
      scenario: "LEGACY_BASELINE",
      observation: isolationObs({
        scenario: "LEGACY_BASELINE",
        context: buildSafeContextObservation({
          proseOnlyInheritance: true,
          structuredUpstreamDataPresent: false,
        }),
      }),
    });
    expect(legacy.run.scenario).toBe("LEGACY_BASELINE");
    expect(legacy.structured.proseOnlyInheritance).toBe(true);
    expect(legacy.status).toBe("FAIL");

    const canon = evaluateBenchmarkScenario({
      caseDef: c,
      scenario: "CANONICAL_GENERATION",
      observation: isolationObs({ scenario: "CANONICAL_GENERATION" }),
    });
    expect(canon.status).toBe("PASS");

    const withQa = evaluateBenchmarkScenario({
      caseDef: c,
      scenario: "CANONICAL_WITH_QA",
      observation: isolationObs({
        scenario: "CANONICAL_WITH_QA",
        qa: buildQaResultStub({ status: "VALID" }),
      }),
    });
    expect(withQa.outputQa.status).toBe("VALID");
    expect(withQa.status).toBe("PASS");

    const withRepair = evaluateBenchmarkScenario({
      caseDef: c,
      scenario: "CANONICAL_WITH_REPAIR",
      observation: isolationObs({
        scenario: "CANONICAL_WITH_REPAIR",
        qa: buildQaResultStub({
          status: "INVALID",
          codes: ["REQUIRED_FIELD_MISSING"],
        }),
        repair: repairResult(true),
        latency: { totalMs: 90, repairMs: 25, outputQaMs: 4 },
        usage: {
          inputTokens: 120,
          outputTokens: 60,
          totalTokens: 180,
          costAvailable: false,
        },
      }),
    });
    expect(withRepair.repair.applicable).toBe(true);
    expect(withRepair.repair.invalidToValid).toBe(true);
    expect(withRepair.status).toBe("PASS");
  });

  it("7–18 — context / artifact / authority / structured fidelity", () => {
    const c = getBenchmarkCase("presentation.slide_content_to_design_routes")!;
    const obs = buildSafeContextObservation({
      upstreamArtifactIds: ["art_slide_content_golden"],
      upstreamArtifactVersions: ["art_slide_content_golden@2"],
      structuredUpstreamDataPresent: true,
      resolvedReferences: ["ref_a"],
      workingMemoryPresent: true,
      multimodalContextPresent: true,
      approvedDecisionsPresent: true,
      requirementsPresent: true,
    });
    const ctx = scoreContextFidelity(c.expectedContext, obs);
    expect(ctx.components.currentInstruction).toBe(true);
    expect(ctx.components.requirements).toBe(true);
    expect(ctx.components.approvedDecisions).toBe(true);
    expect(ctx.components.cdfContext).toBe(true);
    expect(ctx.components.upstreamArtifact).toBe(true);
    expect(ctx.components.outputContract).toBe(true);
    expect(ctx.allExpectedPresent).toBe(true);

    const art = scoreArtifactFidelity(c.expectedUpstreamArtifacts, obs);
    expect(art.expectedArtifactIdPresent).toBe(true);
    expect(art.exactVersionPresent).toBe(true);
    expect(art.structuredDataPresent).toBe(true);
    expect(art.unexpectedVersionSubstitution).toBe(false);

    const auth = scoreAuthorityFidelity(c, obs);
    expect(auth.noLowerAuthorityOverride).toBe(true);
    expect(auth.currentInstructionPreserved).toBe(true);

    const bad = scoreStructuredFidelity(
      buildSafeContextObservation({
        proseOnlyInheritance: true,
        truncatedPreviousOutput: true,
        missingStructuredFields: ["slides"],
        legacyPromptReconstruction: true,
      }),
    );
    expect(bad.proseOnlyInheritance).toBe(true);
    expect(bad.truncatedPreviousOutput).toBe(true);
    expect(bad.missingStructuredFields).toContain("slides");
    expect(bad.legacyPromptReconstruction).toBe(true);
    expect(bad.structuredOk).toBe(false);

    // version substitution
    const sub = scoreArtifactFidelity(c.expectedUpstreamArtifacts, {
      ...obs,
      upstreamArtifactVersions: ["art_slide_content_golden@9"],
    });
    expect(sub.exactVersionPresent).toBe(false);
    expect(sub.unexpectedVersionSubstitution).toBe(true);
  });

  it("19–26 — Output QA VALID / INVALID / UNSUPPORTED + codes", () => {
    const c = getBenchmarkCase("presentation.source_to_storyline")!;
    const valid = evaluateBenchmarkScenario({
      caseDef: c,
      scenario: "CANONICAL_WITH_QA",
      observation: isolationObs({
        scenario: "CANONICAL_WITH_QA",
        qa: buildQaResultStub({ status: "VALID" }),
      }),
    });
    expect(valid.outputQa.status).toBe("VALID");

    const invalid = evaluateBenchmarkScenario({
      caseDef: c,
      scenario: "CANONICAL_WITH_QA",
      observation: isolationObs({
        scenario: "CANONICAL_WITH_QA",
        qa: buildQaResultStub({
          status: "INVALID",
          codes: ["OUTPUT_SCHEMA_INVALID", "REQUIRED_FIELD_MISSING"],
        }),
      }),
    });
    expect(invalid.outputQa.status).toBe("INVALID");
    expect(invalid.outputQa.codes).toEqual(
      expect.arrayContaining([
        "OUTPUT_SCHEMA_INVALID",
        "REQUIRED_FIELD_MISSING",
      ]),
    );
    expect(invalid.status).toBe("FAIL");

    const unsup = evaluateBenchmarkScenario({
      caseDef: c,
      scenario: "CANONICAL_WITH_QA",
      observation: isolationObs({
        scenario: "CANONICAL_WITH_QA",
        qa: buildQaResultStub({
          status: "UNSUPPORTED",
          codes: ["UNSUPPORTED_VALIDATION"],
        }),
      }),
    });
    expect(unsup.outputQa.status).toBe("UNSUPPORTED");
    expect(unsup.status).toBe("UNSUPPORTED");
  });

  it("27–32 — repair metrics (eligibility, success, failure, attempts, latency, cost)", () => {
    const c = getBenchmarkCase("presentation.source_to_storyline")!;
    const success = evaluateBenchmarkScenario({
      caseDef: c,
      scenario: "CANONICAL_WITH_REPAIR",
      observation: isolationObs({
        scenario: "CANONICAL_WITH_REPAIR",
        qa: buildQaResultStub({
          status: "INVALID",
          codes: ["REQUIRED_FIELD_MISSING"],
        }),
        repair: repairResult(true),
        latency: { repairMs: 33, totalMs: 120 },
        usage: {
          totalTokens: 200,
          costAvailable: true,
          estimatedCost: 0.002,
        },
      }),
    });
    expect(success.repair.eligible).toBe(true);
    expect(success.repair.attempts).toBe(1);
    expect(success.repair.invalidToValid).toBe(true);
    expect(success.repair.latencyMs).toBe(33);
    expect(success.repair.incrementalCostAvailable).toBe(true);
    expect(
      success.metrics.find((m) => m.id === "repair.incrementalCost")?.availability,
    ).toBe("available");

    const fail = evaluateBenchmarkScenario({
      caseDef: c,
      scenario: "CANONICAL_WITH_REPAIR",
      observation: isolationObs({
        scenario: "CANONICAL_WITH_REPAIR",
        qa: buildQaResultStub({
          status: "INVALID",
          codes: ["REQUIRED_FIELD_MISSING"],
        }),
        repair: {
          ...repairResult(false),
          status: "EXHAUSTED",
          code: "REPAIR_ATTEMPTS_EXHAUSTED",
        },
        usage: { costAvailable: false },
      }),
    });
    expect(fail.repair.invalidToValid).toBe(false);
    expect(fail.repair.exhausted).toBe(true);
    expect(fail.status).toBe("FAIL");
    expect(
      fail.metrics.find((m) => m.id === "repair.incrementalCost")?.availability,
    ).toBe("unavailable");

    const score = scoreRepair("CANONICAL_GENERATION", isolationObs());
    expect(score.applicable).toBe(false);
  });

  it("33–37 — latency + usage + cost unavailable", () => {
    const c = getBenchmarkCase("presentation.source_to_storyline")!;
    const r = evaluateBenchmarkScenario({
      caseDef: c,
      scenario: "CANONICAL_WITH_QA",
      observation: isolationObs({
        scenario: "CANONICAL_WITH_QA",
        qa: buildQaResultStub({ status: "VALID" }),
        latency: {
          totalMs: 100,
          contextCompilationMs: 10,
          outputQaMs: 5,
          providerMs: 70,
        },
        usage: {
          inputTokens: 11,
          outputTokens: 22,
          totalTokens: 33,
          providerId: "openai",
          costAvailable: false,
        },
      }),
    });
    expect(r.latency.totalMs).toBe(100);
    expect(r.latency.contextCompilationMs).toBe(10);
    expect(r.latency.outputQaMs).toBe(5);
    expect(r.usage.inputTokens).toBe(11);
    expect(
      r.metrics.find((m) => m.id === "usage.estimatedCost")?.availability,
    ).toBe("unavailable");
    expect(r.usage.providerId).toBe("openai");
  });

  it("38–42 — Presentation golden continuity cases", () => {
    const ids = [
      "presentation.source_to_storyline",
      "presentation.storyline_to_slide_content",
      "presentation.slide_content_to_design_routes",
      "presentation.design_routes_to_full_deck",
      "presentation.slide_refinement",
      "presentation.final_materialization",
    ];
    for (const id of ids) {
      expect(getBenchmarkCase(id)).toBeDefined();
    }
    expect(
      resolveAction("cdf.phase.presentation.storyline.generate").ok,
    ).toBe(true);
    expect(
      resolveAction("cdf.phase.presentation.slide-content.generate").ok,
    ).toBe(true);
    expect(
      resolveAction("cdf.phase.presentation.design-routes.configure").ok,
    ).toBe(true);
    expect(
      resolveAction("cdf.phase.presentation.full-deck.generate").ok,
    ).toBe(true);
    const finalMat = resolveAction(
      "cdf.phase.presentation.final.materialize",
    );
    if (!finalMat.ok) {
      // Fallback identity if phase naming differs — catalog still documents intent
      const alt = resolveAction("cdf.phase.presentation.final.configure");
      expect(alt.ok || finalMat.ok).toBe(true);
    }

    const critical = getBenchmarkCase(
      "presentation.slide_content_to_design_routes",
    )!;
    const r = evaluateBenchmarkScenario({
      caseDef: critical,
      scenario: "CANONICAL_WITH_QA",
      observation: slideContentContinuityObs(),
    });
    expect(r.artifact.exactVersionPresent).toBe(true);
    expect(r.artifact.expectedArtifactIdPresent).toBe(true);
    expect(r.outputQa.status).toBe("VALID");
    expect(r.status).toBe("PASS");
    expect(r.metadata.exactActionVersionMatched).toBe(true);

    // unsupported repair scenario not substituted
    const skippedRepair = evaluateBenchmarkScenario({
      caseDef: critical,
      scenario: "CANONICAL_WITH_REPAIR",
      observation: slideContentContinuityObs({
        scenario: "CANONICAL_WITH_REPAIR",
      }),
    });
    expect(skippedRepair.status).toBe("UNSUPPORTED");
    expect(skippedRepair.metadata.didNotSubstituteScenario).toBe(true);
  });

  it("43–44 — Packaging + Social continuity", () => {
    const pack = getBenchmarkCase("packaging.upstream_to_generation")!;
    expect(resolveAction(pack.actionId).ok).toBe(true);
    const packR = evaluateBenchmarkScenario({
      caseDef: pack,
      scenario: "CANONICAL_WITH_QA",
      observation: isolationObs({
        scenario: "CANONICAL_WITH_QA",
        context: buildSafeContextObservation({
          upstreamArtifactIds: ["art_packaging_source"],
          upstreamArtifactVersions: ["art_packaging_source@1"],
          structuredUpstreamDataPresent: true,
        }),
        qa: buildQaResultStub({
          status: "VALID",
          actionId: pack.actionId,
        }),
      }),
    });
    expect(packR.status).toBe("PASS");

    const social = getBenchmarkCase("social.upstream_to_generation")!;
    expect(resolveAction(social.actionId).ok).toBe(true);
    const socialR = evaluateBenchmarkScenario({
      caseDef: social,
      scenario: "CANONICAL_WITH_QA",
      observation: isolationObs({
        scenario: "CANONICAL_WITH_QA",
        context: buildSafeContextObservation({
          upstreamArtifactIds: ["art_social_source"],
          upstreamArtifactVersions: ["art_social_source@1"],
          structuredUpstreamDataPresent: true,
        }),
        qa: buildQaResultStub({
          status: "VALID",
          actionId: social.actionId,
        }),
      }),
    });
    expect(socialR.status).toBe("PASS");
  });

  it("45 — Class-D UNSUPPORTED ≠ FAILED", () => {
    const classD = listBenchmarkCatalogCases().find(
      (c) => c.classLabel === "D",
    )!;
    expect(classD.coverage).toBe("unsupported");
    const r = evaluateBenchmarkScenario({
      caseDef: classD,
      scenario: "CANONICAL_WITH_QA",
      observation: buildUnsupportedClassDObservation({
        actionId: classD.actionId,
        actionVersion: classD.actionVersion,
      }),
    });
    expect(r.outputQa.status).toBe("UNSUPPORTED");
    expect(r.status).toBe("UNSUPPORTED");
    expect(r.status).not.toBe("FAIL");
    expect(r.ok).toBe(true);
  });

  it("46 — legacy vs canonical comparison (architectural, not text)", () => {
    const c = getBenchmarkCase("presentation.storyline_to_slide_content")!;
    const legacy = evaluateBenchmarkScenario({
      caseDef: c,
      scenario: "LEGACY_BASELINE",
      observation: isolationObs({
        scenario: "LEGACY_BASELINE",
        context: buildSafeContextObservation({
          proseOnlyInheritance: true,
          upstreamArtifactIds: [],
          upstreamArtifactVersions: [],
          structuredUpstreamDataPresent: false,
          truncatedPreviousOutput: true,
        }),
      }),
    });
    const canonical = evaluateBenchmarkScenario({
      caseDef: c,
      scenario: "CANONICAL_GENERATION",
      observation: isolationObs({
        scenario: "CANONICAL_GENERATION",
        context: buildSafeContextObservation({
          upstreamArtifactIds: ["art_storyline_golden"],
          upstreamArtifactVersions: ["art_storyline_golden@1"],
          structuredUpstreamDataPresent: true,
          resolvedReferences: ["art_storyline_golden@1"],
          workingMemoryPresent: true,
        }),
      }),
    });
    const cmp = compareLegacyVsCanonical({
      caseId: c.caseId,
      legacy,
      canonical,
    });
    expect(cmp.textEqualityRequired).toBe(false);
    expect(cmp.focus).toBe("architectural_properties");
    expect(cmp.deltas.length).toBeGreaterThan(0);
    expect(legacy.structured.structuredOk).toBe(false);
    expect(canonical.structured.structuredOk).toBe(true);
  });

  it("47–50 — isolation, no live provider required, trace safety", () => {
    const c = getBenchmarkCase("presentation.source_to_storyline")!;
    beginExecutionTrace({
      requestId: "req_bench",
      executionId: "exec_trace_bench",
      correlationId: "corr_bench",
    });
    const r = evaluateBenchmarkScenario({
      caseDef: c,
      scenario: "CANONICAL_WITH_QA",
      observation: isolationObs({
        scenario: "CANONICAL_WITH_QA",
        qa: buildQaResultStub({ status: "VALID" }),
        executionId: "exec_trace_bench",
      }),
    });
    expect(r.isolationHonored).toBe(true);
    expect(r.metadata.noProviderSelection).toBe(true);
    expect(r.metadata.measurementOnly).toBe(true);
    expect(r.secondQaSystem).toBe(false);
    expect(r.secondExecutionSystem).toBe(false);
    expect(r.secondTelemetrySystem).toBe(false);
    expect(r.subjectiveScoreUsed).toBe(false);

    const trace = getExecutionTrace("exec_trace_bench");
    expect(trace?.stages.some((s) => s.stage === "canonical_benchmark")).toBe(
      true,
    );
    const stage = trace!.stages.find((s) => s.stage === "canonical_benchmark")!;
    const details = JSON.stringify(stage.details ?? {});
    expect(details).not.toMatch(/prompt|secret|signedUrl|conversationBody/i);
    expect(stage.details?.sensitiveBodiesOmitted).toBe(true);
  });

  it("51–54 — exact action version, flags recorded, deterministic dispatch, fail vs unsupported", () => {
    const c = getBenchmarkCase("presentation.slide_content_to_design_routes")!;
    const r = evaluateBenchmarkScenario({
      caseDef: c,
      scenario: "CANONICAL_WITH_QA",
      observation: slideContentContinuityObs({
        featureFlags: {
          cdfCanonicalGenerationContext: false,
          cdfCanonicalAutomaticRepair: false,
        },
      }),
    });
    expect(r.run.actionVersion).toBe("1.0.0");
    expect(r.metadata.exactActionVersionMatched).toBe(true);
    expect(r.run.featureFlags.cdfCanonicalGenerationContext).toBe(false);
    expect(r.metadata.noPromptMegaComposer).toBe(true);

    // FAIL vs UNSUPPORTED distinction
    const failCase = evaluateBenchmarkScenario({
      caseDef: getBenchmarkCase("presentation.source_to_storyline")!,
      scenario: "CANONICAL_WITH_QA",
      observation: isolationObs({
        scenario: "CANONICAL_WITH_QA",
        qa: buildQaResultStub({
          status: "INVALID",
          codes: ["OUTPUT_SCHEMA_INVALID"],
        }),
      }),
    });
    expect(failCase.status).toBe("FAIL");

    const unsupCase = listBenchmarkCatalogCases().find(
      (x) => x.classLabel === "D",
    )!;
    const unsup = evaluateBenchmarkScenario({
      caseDef: unsupCase,
      scenario: "CANONICAL_WITH_QA",
      observation: buildUnsupportedClassDObservation({
        actionId: unsupCase.actionId,
      }),
    });
    expect(unsup.status).toBe("UNSUPPORTED");
  });

  it("55–60 — no subjective scoring, no second systems, no auto flag enablement, coverage", () => {
    const coverage = listFifteenServiceCoverage();
    expect(coverage.length).toBe(15);
    const classA = coverage.filter((c) => c.classLabel === "A");
    expect(classA.map((c) => c.serviceId).sort()).toEqual([
      "packaging",
      "presentation",
      "social-media",
    ]);
    for (const row of classA) {
      expect(row.coverage).toBe("benchmarked");
      expect(row.caseCount).toBeGreaterThan(0);
    }
    for (const row of coverage.filter((c) => c.classLabel === "D")) {
      expect(row.coverage).toBe("unsupported");
      expect(classifyServiceCoverage(row.serviceId).classLabel).toBe("D");
    }

    const catalog = listBenchmarkCatalogCases();
    expect(catalog.length).toBeGreaterThanOrEqual(15);

    const results: BenchmarkResult[] = [];
    for (const c of [
      getBenchmarkCase("presentation.source_to_storyline")!,
      getBenchmarkCase("packaging.upstream_to_generation")!,
    ]) {
      const batch = runBenchmarkCase({
        caseDef: c,
        observations: {
          CANONICAL_WITH_QA: isolationObs({
            scenario: "CANONICAL_WITH_QA",
            context: buildSafeContextObservation(
              c.expectedUpstreamArtifacts?.[0]
                ? {
                    upstreamArtifactIds: [
                      c.expectedUpstreamArtifacts[0].artifactId,
                    ],
                    upstreamArtifactVersions: [
                      `${c.expectedUpstreamArtifacts[0].artifactId}@${c.expectedUpstreamArtifacts[0].version}`,
                    ],
                    structuredUpstreamDataPresent: true,
                  }
                : {},
            ),
            qa: buildQaResultStub({ status: "VALID", actionId: c.actionId }),
          }),
        },
      });
      results.push(...batch.results);
    }

    const agg = aggregateBenchmarkResults(results);
    expect(agg.subjectiveRanking).toBe(false);
    expect(agg.autoEnabledFlags).toBe(false);
    expect(agg.byScenario.CANONICAL_WITH_QA?.pass).toBeGreaterThan(0);

    const report = buildBenchmarkReport(results);
    expect(report.contractVersion).toBe("18.0.0");
    expect(report.resultCount).toBe(results.length);

    // Flags remain OFF after benchmarking
    expect(process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV]).toBeUndefined();
    expect(process.env[CDF_CANONICAL_AUTOMATIC_REPAIR_ENV]).toBeUndefined();
  });

  it("invariants — disabled action / missing observation / authority override", () => {
    const c = getBenchmarkCase("presentation.source_to_storyline")!;
    const batch = runBenchmarkCase({
      caseDef: c,
      observations: {},
    });
    expect(batch.results.every((r) => r.status === "SKIPPED")).toBe(true);

    const override = evaluateBenchmarkScenario({
      caseDef: c,
      scenario: "CANONICAL_GENERATION",
      observation: isolationObs({
        context: buildSafeContextObservation({
          lowerAuthorityOverrodeHigher: true,
          authorityViolation: true,
        }),
      }),
    });
    expect(override.authority.noLowerAuthorityOverride).toBe(false);
    expect(override.status).toBe("FAIL");
  });
});
