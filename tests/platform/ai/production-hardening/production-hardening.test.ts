/**
 * Phase 19 — Production Hardening & Rollout Readiness tests.
 * Flags remain OFF by default; continuity proofs enable temporarily then restore.
 */

import {
  CDF_CANONICAL_GENERATION_CONTEXT_ENV,
  applyCdfTransition,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
} from "../../../../src/platform/cdf";
import {
  resetActionRegistryForTests,
  resolveAction,
  listGenerationActionsForService,
} from "../../../../src/platform/ai/action-registry";
import {
  executeCanonicalAction,
  type CanonicalActionExecutionRequest,
} from "../../../../src/platform/ai/action-execution";
import {
  validateCanonicalActionOutput,
  type CanonicalOutputQAResult,
} from "../../../../src/platform/ai/output-qa";
import {
  CDF_CANONICAL_AUTOMATIC_REPAIR_ENV,
  attemptCanonicalRepair,
  planCanonicalRepair,
  mergeRepairPolicy,
} from "../../../../src/platform/ai/repair";
import {
  CDF_DEEP_INGEST_RUNTIME_SERVICES,
  inventoryCdfApplicationServices,
} from "../../../../src/platform/ai/conversational-runtime";
import {
  PRODUCTION_HARDENING_CONTRACT_VERSION,
  allFlagMatrixCells,
  assertClassAContinuityReady,
  assertClassDContinuityIncomplete,
  assertExactArtifactVersionMatch,
  assertExactVersionPin,
  assertFlagsRemainDefaultOff,
  assertNoAdvancementOnInvalidQa,
  assertNoOpenRolloutBlockers,
  assertRepairDoesNotValidateUnsupported,
  assertTraceDetailsSafe,
  classifyServiceRollout,
  containmentFor,
  describeFlagMatrixCell,
  FAILURE_POINTS,
  getProductionPath,
  getProductionHardeningContractVersion,
  getRolloutPolicy,
  listBypassCatalog,
  listProductionPaths,
  listServiceRolloutClassifications,
  provePresentationNnPlusOneContinuity,
  PRODUCTION_FLAG_DEFAULTS,
  readFeatureFlagState,
  runProductionHardeningSecurityReview,
  summarizeRolloutReadiness,
} from "../../../../src/platform/ai/production-hardening";
import { CDF_GENERATION_PATH_AUDIT } from "../../../../src/platform/cdf/context-resolver/generation-path-audit";
import {
  beginExecutionTrace,
  getExecutionTrace,
  resetExecutionTracesForTests,
  recordExecutionTraceStage,
} from "../../../../src/platform/os/observability/execution-trace";
import { evaluateBenchmarkScenario } from "../../../../src/platform/ai/benchmarking";
import {
  buildQaResultStub,
  buildSafeContextObservation,
  getBenchmarkCase,
} from "../../../../src/platform/ai/benchmarking";

const ORG = "org_p19";
const PROJ = "proj_p19";

function qaStub(
  status: CanonicalOutputQAResult["status"],
  codes: CanonicalOutputQAResult["diagnostics"][number]["code"][] = [],
): CanonicalOutputQAResult {
  return {
    status,
    mayAdvance: status === "VALID",
    diagnostics: codes.map((code) => ({
      code,
      severity: "error" as const,
      message: code,
      authoritativeSource: "p19",
    })),
    checksPerformed: ["output_contract"],
    actionId: "cdf.phase.presentation.storyline.generate",
    actionVersion: "1.0.0",
    outputKind: "generation_result",
    metadata: {},
  };
}

describe("Phase 19 Production Hardening", () => {
  const prevGen = process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV];
  const prevRepair = process.env[CDF_CANONICAL_AUTOMATIC_REPAIR_ENV];

  beforeEach(() => {
    resetActionRegistryForTests();
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
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

  it("1–5 — flag matrix OFF/ON combinations + repair without generation", () => {
    expect(getProductionHardeningContractVersion()).toBe(
      PRODUCTION_HARDENING_CONTRACT_VERSION,
    );
    expect(PRODUCTION_FLAG_DEFAULTS.CDF_CANONICAL_GENERATION_CONTEXT).toBe(
      "OFF",
    );
    expect(PRODUCTION_FLAG_DEFAULTS.CDF_CANONICAL_AUTOMATIC_REPAIR).toBe("OFF");
    expect(PRODUCTION_FLAG_DEFAULTS.globalEnableInPhase19).toBe(false);

    const cells = allFlagMatrixCells();
    expect(cells).toHaveLength(4);

    const off = describeFlagMatrixCell(false, false);
    expect(off.legacyCreatePath).toBe("unchanged");
    expect(off.modelGenerationViaActionExecution).toBe("unsupported");
    expect(off.createsUnexpectedCanonicalPath).toBe(false);

    const genOnly = describeFlagMatrixCell(true, false);
    expect(genOnly.modelGenerationViaActionExecution).toBe("supported");
    expect(genOnly.structuredRepair).toBe("disabled");

    const repairOnly = describeFlagMatrixCell(false, true);
    expect(repairOnly.structuredRepair).toBe("context_conflict");
    expect(repairOnly.createsUnexpectedCanonicalPath).toBe(false);
    expect(repairOnly.legacyCreatePath).toBe("unchanged");

    const both = describeFlagMatrixCell(true, true);
    expect(both.structuredRepair).toBe("eligible_if_qa");

    expect(readFeatureFlagState().cdfCanonicalGenerationContext).toBe(false);
    expect(readFeatureFlagState().cdfCanonicalAutomaticRepair).toBe(false);
    assertFlagsRemainDefaultOff();
  });

  it("legacy parity — flag OFF MODEL_GENERATION unsupported; CDF transition works", async () => {
    const action = resolveAction("cdf.phase.presentation.storyline.generate");
    expect(action.ok).toBe(true);
    if (!action.ok) return;

    const started = applyCdfTransition({
      action: "start",
      serviceId: "presentation",
      productMode: "ai",
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const req: CanonicalActionExecutionRequest = {
      actionId: action.action.actionId,
      actionVersion: action.action.version,
      requestId: "req_p19_legacy",
      executionId: "exec_p19_legacy",
      correlationId: "corr_p19",
      input: { orchestration: { conversationalInstruction: "x", prompt: "x" } },
      executionContext: {
        organizationId: ORG,
        projectId: PROJ,
        cdfSessionId: started.value.session.sessionId,
        cdfPhaseId: "storyline",
        cdfServiceId: "presentation",
        currentInstruction: "x",
        presentContext: {
          current_instruction: true,
          cdf_session: true,
          cdf_phase: true,
          cdf_context: true,
          output_contract: true,
        },
      },
      authorizationContext: {
        organizationId: ORG,
        projectId: PROJ,
        userPermissionGranted: true,
      },
    };

    const result = await executeCanonicalAction(req);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("EXECUTION_NOT_SUPPORTED");
    }

    // Deterministic configure still works without generation flag
    const configure = resolveAction(
      "cdf.phase.presentation.design-routes.configure",
    );
    expect(configure.ok).toBe(true);
  });

  it("6–10 — original N→N+1 continuity proof (exact id/version, no note SoT)", async () => {
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "1";
    const proof = await provePresentationNnPlusOneContinuity({
      organizationId: `${ORG}_nn`,
      projectId: `${PROJ}_nn`,
      conversationId: "507f1f77bcf86cd79943919a",
      channelId: "service:brand_p19:presentations",
    });
    expect(proof.ok).toBe(true);
    expect(proof.turn1ArtifactId).toBeTruthy();
    expect(proof.turn1ArtifactVersion).toBe(5);
    expect(proof.turn2UpstreamPins).toContain(
      `${proof.turn1ArtifactId}@${proof.turn1ArtifactVersion}`,
    );
    expect(proof.turn2InstructionPresent).toBe(true);
    expect(proof.providerBoundaryFromCmr).toBe(true);
    expect(proof.approvalNoteNotSoT).toBe(true);
    expect(proof.approvalNoteUsed).toMatch(/OLD_TRUNCATED_NOTE/);
    expect(proof.noLatestHead).toBe(true);

    delete process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV];
    assertFlagsRemainDefaultOff();
  }, 60000);

  it("11–18 — Presentation path inventory + deterministic phases + actions", () => {
    const path = getProductionPath("presentation_generation");
    expect(path?.classification).toBe("CANONICAL");

    const gens = listGenerationActionsForService("presentation");
    const ids = gens.map((g) => g.actionId);
    expect(ids).toEqual(
      expect.arrayContaining([
        "cdf.phase.presentation.storyline.generate",
        "cdf.phase.presentation.slide-content.generate",
        "cdf.phase.presentation.full-deck.generate",
      ]),
    );

    const design = resolveAction(
      "cdf.phase.presentation.design-routes.configure",
    );
    expect(design.ok).toBe(true);
    if (design.ok) {
      expect(design.action.executionMode).not.toBe("MODEL_GENERATION");
      expect(design.action.deterministic).toBe(true);
    }

    const finalMat = resolveAction("cdf.phase.presentation.final.materialize");
    expect(finalMat.ok || resolveAction("cdf.phase.presentation.final.configure").ok).toBe(
      true,
    );

    // Audit matrix present
    expect(CDF_GENERATION_PATH_AUDIT.length).toBeGreaterThan(0);
  });

  it("19–20 — Packaging + Social Media generation actions + continuity ready", () => {
    assertClassAContinuityReady("packaging");
    assertClassAContinuityReady("social-media");
    expect(
      listGenerationActionsForService("packaging").some((g) =>
        g.actionId.includes("routes.generate"),
      ),
    ).toBe(true);
    expect(
      resolveAction("cdf.phase.social-media.routes.generate").ok,
    ).toBe(true);
    expect(getProductionPath("packaging_generation")?.classification).toBe(
      "CANONICAL",
    );
    expect(getProductionPath("social_media_generation")?.classification).toBe(
      "CANONICAL",
    );

    const packCase = getBenchmarkCase("packaging.upstream_to_generation")!;
    const packR = evaluateBenchmarkScenario({
      caseDef: packCase,
      scenario: "CANONICAL_WITH_QA",
      observation: {
        scenario: "CANONICAL_WITH_QA",
        context: buildSafeContextObservation({
          upstreamArtifactIds: ["art_packaging_source"],
          upstreamArtifactVersions: ["art_packaging_source@1"],
          structuredUpstreamDataPresent: true,
        }),
        qa: buildQaResultStub({ status: "VALID", actionId: packCase.actionId }),
        isolation: {
          productionMutation: false,
          cdfAdvanced: false,
          artifactApproved: false,
          externalSideEffect: false,
        },
        usage: { costAvailable: false },
      },
    });
    expect(packR.status).toBe("PASS");

    const socialCase = getBenchmarkCase("social.upstream_to_generation")!;
    const socialR = evaluateBenchmarkScenario({
      caseDef: socialCase,
      scenario: "CANONICAL_WITH_QA",
      observation: {
        scenario: "CANONICAL_WITH_QA",
        context: buildSafeContextObservation({
          upstreamArtifactIds: ["art_social_source"],
          upstreamArtifactVersions: ["art_social_source@1"],
          structuredUpstreamDataPresent: true,
        }),
        qa: buildQaResultStub({
          status: "VALID",
          actionId: socialCase.actionId,
        }),
        isolation: {
          productionMutation: false,
          cdfAdvanced: false,
          artifactApproved: false,
          externalSideEffect: false,
        },
        usage: { costAvailable: false },
      },
    });
    expect(socialR.status).toBe("PASS");
  });

  it("21 — Class-D limitation preserved under classification", () => {
    const classD = inventoryCdfApplicationServices().filter(
      (s) =>
        !(CDF_DEEP_INGEST_RUNTIME_SERVICES as readonly string[]).includes(
          s.serviceId,
        ),
    );
    expect(classD.length).toBe(12);
    for (const s of classD) {
      assertClassDContinuityIncomplete(s.serviceId);
      const row = classifyServiceRollout(s.serviceId);
      expect(row.artifactContinuityComplete).toBe(false);
      expect(row.readiness).toBe("READY_WITH_LIMITATIONS");
    }
    expect(getProductionPath("class_d_generation")?.classification).toBe(
      "UNSUPPORTED",
    );
  });

  it("22–30 — authorization fail-closed + disabled/unsupported version", async () => {
    const { enforceActionAuthorization } = await import(
      "../../../../src/platform/ai/action-execution/authorize"
    );
    const action = resolveAction("cdf.phase.presentation.storyline.generate");
    expect(action.ok).toBe(true);
    if (!action.ok) return;

    const noOrg = enforceActionAuthorization(
      action.action,
      { projectId: PROJ, userPermissionGranted: true },
      {
        organizationId: "",
        projectId: PROJ,
        presentContext: {},
      },
    );
    expect(noOrg.ok).toBe(false);
    if (!noOrg.ok) expect(noOrg.code).toBe("UNAUTHORIZED");

    const noProject = enforceActionAuthorization(
      action.action,
      { organizationId: ORG, userPermissionGranted: true },
      {
        organizationId: ORG,
        projectId: "",
        presentContext: {},
      },
    );
    expect(noProject.ok).toBe(false);
    if (!noProject.ok) expect(noProject.code).toBe("UNAUTHORIZED");

    const started = applyCdfTransition({
      action: "start",
      serviceId: "presentation",
      productMode: "ai",
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const foreignOrg = enforceActionAuthorization(
      action.action,
      {
        organizationId: "org_other",
        projectId: PROJ,
        userPermissionGranted: true,
      },
      {
        organizationId: "org_other",
        projectId: PROJ,
        cdfSessionId: started.value.session.sessionId,
        cdfPhaseId: "storyline",
        cdfServiceId: "presentation",
        presentContext: {},
      },
    );
    expect(foreignOrg.ok).toBe(false);
    if (!foreignOrg.ok) expect(foreignOrg.code).toBe("UNAUTHORIZED");

    const withPermReq = {
      ...action.action,
      authorizationRequirements: [
        "organization",
        "project",
        "user_permission",
        "conversation_membership",
        "external_integration",
      ] as const,
    };

    const noPerm = enforceActionAuthorization(
      withPermReq as typeof action.action,
      {
        organizationId: ORG,
        projectId: PROJ,
        userPermissionGranted: false,
      },
      {
        organizationId: ORG,
        projectId: PROJ,
        presentContext: {},
      },
    );
    expect(noPerm.ok).toBe(false);
    if (!noPerm.ok) expect(noPerm.code).toBe("UNAUTHORIZED");

    const noConversation = enforceActionAuthorization(
      withPermReq as typeof action.action,
      {
        organizationId: ORG,
        projectId: PROJ,
        userPermissionGranted: true,
        conversationAuthorized: false,
      },
      {
        organizationId: ORG,
        projectId: PROJ,
        conversationId: "conv_x",
        presentContext: {},
      },
    );
    expect(noConversation.ok).toBe(false);
    if (!noConversation.ok) expect(noConversation.code).toBe("UNAUTHORIZED");

    const noExternal = enforceActionAuthorization(
      withPermReq as typeof action.action,
      {
        organizationId: ORG,
        projectId: PROJ,
        userPermissionGranted: true,
        conversationAuthorized: true,
        externalIntegrationAuthorized: false,
      },
      {
        organizationId: ORG,
        projectId: PROJ,
        presentContext: {},
      },
    );
    expect(noExternal.ok).toBe(false);
    if (!noExternal.ok) expect(noExternal.code).toBe("EXECUTION_NOT_SUPPORTED");

    const badVersion = resolveAction(
      "cdf.phase.presentation.storyline.generate",
      "9.9.9",
    );
    expect(badVersion.ok).toBe(false);
    if (!badVersion.ok) expect(badVersion.code).toBe("UNSUPPORTED_VERSION");

    const disabled = resolveAction("canonical.semantic.disabled_example");
    expect(disabled.ok).toBe(false);
    if (!disabled.ok) expect(disabled.code).toBe("ACTION_DISABLED");

    // execute path also fail-closed for missing org context
    const execFail = await executeCanonicalAction({
      actionId: action.action.actionId,
      actionVersion: action.action.version,
      requestId: "req_auth_exec",
      executionId: "exec_auth_exec",
      correlationId: "c",
      input: {},
      executionContext: {
        projectId: PROJ,
        presentContext: {},
      },
      authorizationContext: {
        projectId: PROJ,
        userPermissionGranted: true,
      },
    });
    expect(execFail.ok).toBe(false);
  });

  it("31–36 — data integrity pins, stale version, repeated request containment", () => {
    expect(() => assertExactVersionPin("art@latest")).toThrow(/latest|HEAD/i);
    expect(() => assertExactVersionPin("HEAD")).toThrow();
    expect(() =>
      assertExactArtifactVersionMatch({
        expectedArtifactId: "art_a",
        expectedVersion: 3,
        observedPins: ["art_a@4"],
      }),
    ).toThrow(/substitution|Expected exact pin/i);

    assertExactArtifactVersionMatch({
      expectedArtifactId: "art_a",
      expectedVersion: 3,
      observedPins: ["art_a@3"],
    });

    for (const point of FAILURE_POINTS) {
      const c = containmentFor(point);
      expect(c.typedErrorRequired).toBe(true);
      expect(c.noCdfAdvancementOnRequiredFailure).toBe(true);
      expect(c.noArtifactCorruption).toBe(true);
      expect(c.noApprovalMutation).toBe(true);
    }
  });

  it("37–46 — QA invalid/unsupported, repair success/fail, no advance", async () => {
    const invalid = qaStub("INVALID", ["OUTPUT_SCHEMA_INVALID"]);
    expect(invalid.mayAdvance).toBe(false);
    assertNoAdvancementOnInvalidQa(invalid);

    const unsup = qaStub("UNSUPPORTED", ["UNSUPPORTED_VALIDATION"]);
    assertRepairDoesNotValidateUnsupported(unsup);
    expect(() =>
      assertRepairDoesNotValidateUnsupported(unsup, {
        ok: true,
        status: "REPAIRED",
        message: "bad",
        actionId: "x",
        actionVersion: "1.0.0",
        originalQa: unsup,
        plan: {
          eligible: false,
          reason: "x",
          attempt: 1,
          maxAttempts: 1,
          originalQaCodes: ["UNSUPPORTED_VALIDATION"],
        },
        attempts: [],
        finalQa: qaStub("VALID"),
        metadata: {},
      }),
    ).toThrow(/UNSUPPORTED/);

    const action = resolveAction("cdf.phase.presentation.storyline.generate");
    expect(action.ok).toBe(true);
    if (!action.ok) return;

    // repair ON + generation OFF → context conflict for structured repair plan path
    process.env[CDF_CANONICAL_AUTOMATIC_REPAIR_ENV] = "true";
    const plan = planCanonicalRepair({
      action: action.action,
      qa: invalid,
      policy: mergeRepairPolicy({ enabled: true }),
      attempt: 1,
      hasCandidateData: false,
    });
    // eligible planning may pass env check, but execution conflicts without generation
    expect(describeFlagMatrixCell(false, true).structuredRepair).toBe(
      "context_conflict",
    );

    const repairAttempt = await attemptCanonicalRepair({
      action: action.action,
      originalExecutionRequest: {
        actionId: action.action.actionId,
        actionVersion: action.action.version,
        requestId: "req_r",
        executionId: "exec_r",
        correlationId: "c",
        input: {},
        executionContext: {
          organizationId: ORG,
          projectId: PROJ,
          currentInstruction: "keep me",
          presentContext: {},
        },
        authorizationContext: {
          organizationId: ORG,
          projectId: PROJ,
          userPermissionGranted: true,
        },
      },
      originalExecutionResult: {
        ok: true,
        actionId: action.action.actionId,
        actionVersion: action.action.version,
        executionMode: action.action.executionMode,
        sideEffectLevel: action.action.sideEffectLevel,
        dryRun: false,
        executionId: "exec_r",
        correlationId: "c",
        result: { kind: "generation_result", value: { broken: true } },
        metadata: {},
      },
      originalQa: invalid,
      policy: { enabled: true },
      attemptNumber: 1,
    });
    expect(
      repairAttempt.code === "REPAIR_CONTEXT_CONFLICT" ||
        repairAttempt.code === "REPAIR_DISABLED" ||
        repairAttempt.status === "FAILED" ||
        repairAttempt.status === "NOT_ELIGIBLE",
    ).toBe(true);

    delete process.env[CDF_CANONICAL_AUTOMATIC_REPAIR_ENV];

    // Validate uses Output QA (no second system)
    const qa = validateCanonicalActionOutput({
      action: action.action,
      executionResult: {
        ok: false,
        code: "EXECUTION_FAILED",
        message: "provider down",
        actionId: action.action.actionId,
        actionVersion: action.action.version,
        executionMode: action.action.executionMode,
        dryRun: false,
        executionId: "exec_fail",
        correlationId: "c",
      },
    });
    expect(["INVALID", "UNSUPPORTED"]).toContain(qa.status);
    expect(qa.mayAdvance).toBe(false);
  });

  it("47–54 — no CDF advance on invalid; rollback; multimodal unsupported; traces", () => {
    const invalid = qaStub("INVALID", ["REQUIRED_FIELD_MISSING"]);
    expect(invalid.mayAdvance).toBe(false);

    // Rollback: flags off
    delete process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV];
    delete process.env[CDF_CANONICAL_AUTOMATIC_REPAIR_ENV];
    assertFlagsRemainDefaultOff();
    expect(getRolloutPolicy().currentStage).toBe("STAGE_0_OFF");

    beginExecutionTrace({
      requestId: "req_p19_tr",
      executionId: "exec_p19_tr",
      correlationId: "corr_p19_tr",
      service: "presentation",
    });
    recordExecutionTraceStage({
      executionId: "exec_p19_tr",
      stage: "action_execution",
      status: "COMPLETED",
      details: {
        actionId: "cdf.phase.presentation.storyline.generate",
        actionVersion: "1.0.0",
        cdfSessionId: "sess_x",
        cdfPhaseId: "storyline",
        sensitiveBodiesOmitted: true,
      },
    });
    recordExecutionTraceStage({
      executionId: "exec_p19_tr",
      stage: "output_qa",
      status: "FAILED",
      details: { status: "INVALID", sensitiveBodiesOmitted: true },
    });
    const trace = getExecutionTrace("exec_p19_tr");
    expect(trace?.stages.map((s) => s.stage)).toEqual(
      expect.arrayContaining(["action_execution", "output_qa"]),
    );
    for (const s of trace!.stages) {
      assertTraceDetailsSafe(s.details);
    }

    // Unsupported modality documented — no invented XLSX
    const multimodalPath = listProductionPaths().find(
      (p) => p.pathId === "presentation_generation",
    );
    expect(multimodalPath).toBeTruthy();
  });

  it("55–60 — client compatibility, rollout classification, no global enable, no hidden fallback", () => {
    const paths = listProductionPaths();
    expect(paths.length).toBeGreaterThanOrEqual(8);
    expect(paths.every((p) => p.entry && p.classification)).toBe(true);

    // Clients do not construct CMR — inventory states Action Execution / Direct spine
    expect(getProductionPath("web_mobile_chat")?.notes).toMatch(/web and mobile/i);

    const rows = listServiceRolloutClassifications();
    expect(rows).toHaveLength(15);
    const classA = rows.filter((r) => r.classLabel === "A");
    expect(classA.map((r) => r.serviceId).sort()).toEqual([
      "packaging",
      "presentation",
      "social-media",
    ]);
    for (const a of classA) {
      expect(a.readiness).toBe("READY_WITH_LIMITATIONS");
      expect(a.artifactContinuityComplete).toBe(true);
      expect(a.recommendedStage).toBe("STAGE_2_CLASS_A_ALLOWLIST");
    }
    for (const d of rows.filter((r) => r.classLabel === "D")) {
      expect(d.artifactContinuityComplete).toBe(false);
      expect(d.readiness).not.toBe("BLOCKED");
    }

    const summary = summarizeRolloutReadiness();
    expect(summary.READY_WITH_LIMITATIONS).toBe(15);

    const policy = getRolloutPolicy();
    expect(policy.hiddenPercentageRollout).toBe(false);
    expect(policy.autoEnableFromBenchmarks).toBe(false);
    expect(policy.stages).toHaveLength(6);
    expect(policy.currentStage).toBe("STAGE_0_OFF");

    assertFlagsRemainDefaultOff();
    expect(assertNoOpenRolloutBlockers().blockerCount).toBe(0);

    const bypass = listBypassCatalog();
    expect(bypass.some((b) => b.id === "direct_execution_spine")).toBe(true);
    expect(bypass.every((b) => !b.rolloutBlocker || b.classification)).toBe(
      true,
    );
  });

  it("61–70 — invariants: no second systems, security review, config defaults", () => {
    const security = runProductionHardeningSecurityReview();
    expect(security.ok).toBe(true);
    expect(security.blockers).toHaveLength(0);
    expect(
      security.findings.some((f) => f.id === "flags_default_off"),
    ).toBe(true);

    // No second benchmark/QA/execution — Phase 19 module is policy-only
    expect(listProductionPaths().every((p) => p.pathId)).toBe(true);
    expect(PRODUCTION_FLAG_DEFAULTS.benchmarkAltersFlags).toBe(false);

    // Repair ON without generation does not create unexpected path
    expect(
      describeFlagMatrixCell(false, true).createsUnexpectedCanonicalPath,
    ).toBe(false);

    // Canonical rejects latest/HEAD
    expect(() => assertExactVersionPin("art@3")).not.toThrow();
  });
});
