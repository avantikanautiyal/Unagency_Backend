/**
 * Phase 21 — STAGE_2_CLASS_A_ALLOWLIST certification suite.
 * Production contract lockdown, mixed-traffic isolation, rollback, QA/repair safety.
 */

import {
  CDF_CANONICAL_GENERATION_CONTEXT_ENV,
  applyCdfTransition,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  tryApplyCanonicalGenerationContext,
} from "../../../../src/platform/cdf";
import {
  CDF_CANONICAL_AUTOMATIC_REPAIR_ENV,
  attemptCanonicalRepair,
  mergeRepairPolicy,
  planCanonicalRepair,
} from "../../../../src/platform/ai/repair";
import {
  PRODUCTION_HARDENING_CONTRACT_VERSION,
  PRODUCTION_ROLLOUT_CONTRACT,
  CDF_CANONICAL_ROLLOUT_STAGE_ENV,
  CDF_CANONICAL_INTERNAL_ORG_ALLOWLIST_ENV,
  CDF_CANONICAL_INTERNAL_PROJECT_ALLOWLIST_ENV,
  CDF_CANONICAL_HTTP_OUTPUT_QA_ENV,
  CDF_CANONICAL_HTTP_REPAIR_ENV,
  CDF_CANONICAL_ROLLOUT_COMPAT_ENV,
  resolveCanonicalGenerationEligibility,
  getRolloutPolicy,
  STAGE_2_CLASS_A_SERVICES,
  listStage1To2Gates,
  listCanonicalIngressAudit,
  assertAllModelIngressesGated,
  verifyFlagOffRollback,
  maybeRunHttpCreateOutputQa,
  assertExactVersionPin,
  assertExactArtifactVersionMatch,
  assertNoAdvancementOnInvalidQa,
  assertRepairDoesNotValidateUnsupported,
  assertTraceDetailsSafe,
  provePresentationNnPlusOneContinuity,
  classifyServiceRollout,
  runProductionHardeningSecurityReview,
  getProductionHardeningContractVersion,
  emitCanonicalRolloutDecisionTrace,
} from "../../../../src/platform/ai/production-hardening";
import {
  evaluateBenchmarkScenario,
  buildSafeContextObservation,
  buildQaResultStub,
  getBenchmarkCase,
} from "../../../../src/platform/ai/benchmarking";
import {
  enforceActionAuthorization,
} from "../../../../src/platform/ai/action-execution/authorize";
import {
  resetActionRegistryForTests,
  resolveAction,
} from "../../../../src/platform/ai/action-registry";
import {
  beginExecutionTrace,
  getExecutionTrace,
  resetExecutionTracesForTests,
} from "../../../../src/platform/os/observability/execution-trace";
import type { CanonicalOutputQAResult } from "../../../../src/platform/ai/output-qa";

const ORG_A = "org_p21_a";
const ORG_B = "org_p21_b";
const PROJ_A = "proj_p21_a";
const PROJ_B = "proj_p21_b";

function prodEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env[CDF_CANONICAL_ROLLOUT_COMPAT_ENV];
  delete env.CDF_CANONICAL_ROLLOUT_COMPAT;
  for (const [k, v] of Object.entries(extra)) env[k] = v;
  return env;
}

function qaStub(
  status: CanonicalOutputQAResult["status"],
): CanonicalOutputQAResult {
  return {
    status,
    mayAdvance: status === "VALID",
    diagnostics:
      status === "INVALID"
        ? [
            {
              code: "OUTPUT_SCHEMA_INVALID",
              severity: "error",
              message: "x",
              authoritativeSource: "p21",
            },
          ]
        : status === "UNSUPPORTED"
          ? [
              {
                code: "UNSUPPORTED_VALIDATION",
                severity: "error",
                message: "u",
                authoritativeSource: "p21",
              },
            ]
          : [],
    checksPerformed: ["output_contract"],
    actionId: "cdf.phase.presentation.storyline.generate",
    actionVersion: "1.0.0",
    outputKind: "generation_result",
    metadata: {},
  };
}

describe("Phase 21 Stage-2 Certification", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    resetActionRegistryForTests();
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
    resetExecutionTracesForTests();
    for (const k of [
      CDF_CANONICAL_GENERATION_CONTEXT_ENV,
      CDF_CANONICAL_AUTOMATIC_REPAIR_ENV,
      CDF_CANONICAL_ROLLOUT_STAGE_ENV,
      CDF_CANONICAL_INTERNAL_ORG_ALLOWLIST_ENV,
      CDF_CANONICAL_INTERNAL_PROJECT_ALLOWLIST_ENV,
      CDF_CANONICAL_HTTP_OUTPUT_QA_ENV,
      CDF_CANONICAL_HTTP_REPAIR_ENV,
      CDF_CANONICAL_ROLLOUT_COMPAT_ENV,
    ]) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    // Restore jest test compat default unless a test clears it via prodEnv()
    process.env[CDF_CANONICAL_ROLLOUT_COMPAT_ENV] = "1";
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("1–7 — production contract + compatibility isolation", () => {
    expect(getProductionHardeningContractVersion()).toBe("21.0.0");
    expect(PRODUCTION_HARDENING_CONTRACT_VERSION).toBe("21.0.0");
    expect(PRODUCTION_ROLLOUT_CONTRACT.CDF_CANONICAL_ROLLOUT_STAGE).toBe(
      "STAGE_0_OFF",
    );
    expect(PRODUCTION_ROLLOUT_CONTRACT.CDF_CANONICAL_ROLLOUT_COMPAT).toBe("OFF");
    expect(PRODUCTION_ROLLOUT_CONTRACT.autoEnable).toBe(false);
    expect(getRolloutPolicy().stage2Certification).toBe("phase_21");

    // GEN OFF
    expect(
      resolveCanonicalGenerationEligibility(
        { serviceId: "presentation", organizationId: ORG_A },
        prodEnv(),
      ).path,
    ).toBe("legacy");

    // STAGE_0 + GEN ON
    expect(
      resolveCanonicalGenerationEligibility(
        { serviceId: "presentation", organizationId: ORG_A },
        prodEnv({
          [CDF_CANONICAL_GENERATION_CONTEXT_ENV]: "1",
          [CDF_CANONICAL_ROLLOUT_STAGE_ENV]: "STAGE_0_OFF",
        }),
      ).denyReason,
    ).toBe("stage_0_off");

    // unset without compat → fail closed
    const unset = resolveCanonicalGenerationEligibility(
      { serviceId: "presentation", organizationId: ORG_A },
      prodEnv({ [CDF_CANONICAL_GENERATION_CONTEXT_ENV]: "1" }),
    );
    expect(unset.denyReason).toBe("unset_stage_without_compat");
    expect(unset.failClosed).toBe(true);

    // malformed / stage 3+
    expect(
      resolveCanonicalGenerationEligibility(
        { serviceId: "presentation", organizationId: ORG_A },
        prodEnv({
          [CDF_CANONICAL_GENERATION_CONTEXT_ENV]: "1",
          [CDF_CANONICAL_ROLLOUT_STAGE_ENV]: "STAGE_3_BROADER_SERVICES",
        }),
      ).failClosed,
    ).toBe(true);

    // Stage 1 eligible
    expect(
      resolveCanonicalGenerationEligibility(
        { serviceId: "emailers", organizationId: ORG_A, projectId: PROJ_A },
        prodEnv({
          [CDF_CANONICAL_GENERATION_CONTEXT_ENV]: "1",
          [CDF_CANONICAL_ROLLOUT_STAGE_ENV]: "STAGE_1_INTERNAL_TEST",
          [CDF_CANONICAL_INTERNAL_ORG_ALLOWLIST_ENV]: ORG_A,
        }),
      ).path,
    ).toBe("canonical");

    // Stage 2 Class-A
    expect(
      resolveCanonicalGenerationEligibility(
        { serviceId: "presentation", organizationId: ORG_B },
        prodEnv({
          [CDF_CANONICAL_GENERATION_CONTEXT_ENV]: "1",
          [CDF_CANONICAL_ROLLOUT_STAGE_ENV]: "STAGE_2_CLASS_A_ALLOWLIST",
        }),
      ).path,
    ).toBe("canonical");
  });

  it("8–12 — ingress audit: all model paths gated", () => {
    const rows = listCanonicalIngressAudit();
    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect(rows.some((r) => r.ingressId === "chat_web_mobile")).toBe(true);
    expect(rows.some((r) => r.ingressId === "http_executions_create")).toBe(
      true,
    );
    expect(
      rows.some((r) => r.ingressId === "action_execution_model_generation"),
    ).toBe(true);
    expect(assertAllModelIngressesGated().ok).toBe(true);
    for (const r of rows) {
      if (r.status === "intentionally_exempt_non_model") continue;
      if (r.status === "intentionally_legacy_spine") {
        expect(r.preservesLegacy).toBe(true);
        continue;
      }
      expect(r.resolvesEligibility).toBe(true);
      expect(r.respectsGenFlag).toBe(true);
      expect(r.respectsRolloutStage).toBe(true);
    }
  });

  it("13 — Presentation live N→N+1 under Stage 2", async () => {
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "1";
    process.env[CDF_CANONICAL_ROLLOUT_STAGE_ENV] = "STAGE_2_CLASS_A_ALLOWLIST";
    const proof = await provePresentationNnPlusOneContinuity({
      organizationId: "org_p21_nn",
      projectId: "proj_p21_nn",
      conversationId: "507f1f77bcf86cd79943921a",
      channelId: "service:brand_p21:presentations",
    });
    expect(proof.ok).toBe(true);
    expect(proof.turn1ArtifactVersion).toBe(5);
    assertExactArtifactVersionMatch({
      expectedArtifactId: proof.turn1ArtifactId!,
      expectedVersion: proof.turn1ArtifactVersion!,
      observedPins: proof.turn2UpstreamPins,
    });
    expect(proof.approvalNoteNotSoT).toBe(true);
    expect(classifyServiceRollout("presentation").readiness).toBe(
      "READY_WITH_LIMITATIONS",
    );
  }, 60000);

  it("14–15 — Packaging + Social Class-A continuity certification", () => {
    for (const caseId of [
      "packaging.upstream_to_generation",
      "social.upstream_to_generation",
    ]) {
      const c = getBenchmarkCase(caseId)!;
      expect(resolveAction(c.actionId).ok).toBe(true);
      const up = c.expectedUpstreamArtifacts![0];
      const r = evaluateBenchmarkScenario({
        caseDef: c,
        scenario: "CANONICAL_WITH_QA",
        observation: {
          scenario: "CANONICAL_WITH_QA",
          context: buildSafeContextObservation({
            upstreamArtifactIds: [up.artifactId],
            upstreamArtifactVersions: [`${up.artifactId}@${up.version}`],
            structuredUpstreamDataPresent: true,
          }),
          qa: buildQaResultStub({ status: "VALID", actionId: c.actionId }),
          isolation: {
            productionMutation: false,
            cdfAdvanced: false,
            artifactApproved: false,
            externalSideEffect: false,
          },
          usage: { costAvailable: false },
        },
      });
      expect(r.status).toBe("PASS");
      expect(r.artifact.exactVersionPresent).toBe(true);
      expect(classifyServiceRollout(c.serviceId).artifactContinuityComplete).toBe(
        true,
      );
      expect(classifyServiceRollout(c.serviceId).readiness).toBe(
        "READY_WITH_LIMITATIONS",
      );
    }
    expect([...STAGE_2_CLASS_A_SERVICES]).toEqual([
      "presentation",
      "packaging",
      "social-media",
    ]);
  });

  it("16–20 — mixed-traffic isolation (concurrent eligibility)", async () => {
    const stage2 = {
      [CDF_CANONICAL_GENERATION_CONTEXT_ENV]: "1",
      [CDF_CANONICAL_ROLLOUT_STAGE_ENV]: "STAGE_2_CLASS_A_ALLOWLIST",
      [CDF_CANONICAL_INTERNAL_ORG_ALLOWLIST_ENV]: ORG_A,
    };

    const decisions = await Promise.all([
      // A Class-A eligible org
      Promise.resolve(
        resolveCanonicalGenerationEligibility(
          {
            organizationId: ORG_A,
            projectId: PROJ_A,
            serviceId: "presentation",
            executionId: "exec_a",
          },
          prodEnv(stage2),
        ),
      ),
      // B non–Class-A CDF service (emailers) — still canonical; Class-A is not a gate
      Promise.resolve(
        resolveCanonicalGenerationEligibility(
          {
            organizationId: ORG_A,
            projectId: PROJ_A,
            serviceId: "emailers",
            executionId: "exec_b",
          },
          prodEnv(stage2),
        ),
      ),
      // C non-eligible org
      Promise.resolve(
        resolveCanonicalGenerationEligibility(
          {
            organizationId: ORG_B,
            projectId: PROJ_B,
            serviceId: "presentation",
            executionId: "exec_c",
          },
          prodEnv(stage2),
        ),
      ),
      // D Stage 0
      Promise.resolve(
        resolveCanonicalGenerationEligibility(
          {
            organizationId: ORG_A,
            serviceId: "presentation",
            executionId: "exec_d",
          },
          prodEnv({
            [CDF_CANONICAL_GENERATION_CONTEXT_ENV]: "1",
            [CDF_CANONICAL_ROLLOUT_STAGE_ENV]: "STAGE_0_OFF",
          }),
        ),
      ),
      // E malformed
      Promise.resolve(
        resolveCanonicalGenerationEligibility(
          {
            organizationId: ORG_A,
            serviceId: "presentation",
            executionId: "exec_e",
          },
          prodEnv({
            [CDF_CANONICAL_GENERATION_CONTEXT_ENV]: "1",
            [CDF_CANONICAL_ROLLOUT_STAGE_ENV]: "STAGE_99",
          }),
        ),
      ),
    ]);

    expect(decisions[0].path).toBe("canonical");
    expect(decisions[1].path).toBe("canonical");
    expect(decisions[1].denyReason).toBeUndefined();
    expect(decisions[1].reason).not.toMatch(/Class-A allowlist/i);
    expect(decisions[2].path).toBe("legacy");
    expect(decisions[2].denyReason).toBe("org_not_allowlisted");
    expect(decisions[3].path).toBe("legacy");
    expect(decisions[4].path).toBe("legacy");
    expect(decisions[4].failClosed).toBe(true);

    // Project allowlist isolation (Stage 1)
    const stage1 = prodEnv({
      [CDF_CANONICAL_GENERATION_CONTEXT_ENV]: "1",
      [CDF_CANONICAL_ROLLOUT_STAGE_ENV]: "STAGE_1_INTERNAL_TEST",
      [CDF_CANONICAL_INTERNAL_ORG_ALLOWLIST_ENV]: ORG_A,
      [CDF_CANONICAL_INTERNAL_PROJECT_ALLOWLIST_ENV]: PROJ_A,
    });
    expect(
      resolveCanonicalGenerationEligibility(
        { organizationId: ORG_A, projectId: PROJ_A, serviceId: "presentation" },
        stage1,
      ).path,
    ).toBe("canonical");
    expect(
      resolveCanonicalGenerationEligibility(
        { organizationId: ORG_A, projectId: PROJ_B, serviceId: "presentation" },
        stage1,
      ).denyReason,
    ).toBe("project_not_allowlisted");

    // Trace path isolation
    beginExecutionTrace({
      requestId: "r_a",
      executionId: "exec_a",
      correlationId: "c_a",
    });
    beginExecutionTrace({
      requestId: "r_b",
      executionId: "exec_b",
      correlationId: "c_b",
    });
    emitCanonicalRolloutDecisionTrace(decisions[0], "exec_a");
    emitCanonicalRolloutDecisionTrace(decisions[1], "exec_b");
    const ta = getExecutionTrace("exec_a")!;
    const tb = getExecutionTrace("exec_b")!;
    expect(ta.stages.find((s) => s.stage === "canonical_rollout")?.details?.path).toBe(
      "canonical",
    );
    expect(tb.stages.find((s) => s.stage === "canonical_rollout")?.details?.path).toBe(
      "canonical",
    );
    assertTraceDetailsSafe(
      ta.stages.find((s) => s.stage === "canonical_rollout")?.details,
    );
  });

  it("21–24 — rollback: Stage 2 → GEN OFF → new work legacy; CDF still works", () => {
    const envOn = prodEnv({
      [CDF_CANONICAL_GENERATION_CONTEXT_ENV]: "1",
      [CDF_CANONICAL_ROLLOUT_STAGE_ENV]: "STAGE_2_CLASS_A_ALLOWLIST",
    });
    expect(
      resolveCanonicalGenerationEligibility(
        { organizationId: ORG_A, serviceId: "packaging" },
        envOn,
      ).path,
    ).toBe("canonical");

    const envOff = prodEnv({
      [CDF_CANONICAL_ROLLOUT_STAGE_ENV]: "STAGE_0_OFF",
    });
    // GEN unset/off
    delete envOff[CDF_CANONICAL_GENERATION_CONTEXT_ENV];
    delete envOff[CDF_CANONICAL_AUTOMATIC_REPAIR_ENV];
    const rb = verifyFlagOffRollback(envOff);
    expect(rb.ok).toBe(true);

    process.env[CDF_CANONICAL_ROLLOUT_STAGE_ENV] = "STAGE_0_OFF";
    delete process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV];
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      organizationId: ORG_A,
      projectId: PROJ_A,
      metadata: {
        cdfSessionId: "sess_after_rb",
        cdfPhaseId: "storyline",
        cdfServiceId: "presentation",
        executionId: "exec_after_rb",
      },
    });
    expect(applied.ok && applied.skipped).toBe(true);

    const started = applyCdfTransition({
      action: "start",
      serviceId: "presentation",
      productMode: "ai",
      organizationId: ORG_A,
      projectId: PROJ_A,
    });
    expect(started.ok).toBe(true);
  });

  it("25–30 — HTTP QA/Repair combinations + UNSUPPORTED/INVALID", async () => {
    const eligibility = resolveCanonicalGenerationEligibility(
      { organizationId: ORG_A, serviceId: "presentation" },
      prodEnv({
        [CDF_CANONICAL_GENERATION_CONTEXT_ENV]: "1",
        [CDF_CANONICAL_ROLLOUT_STAGE_ENV]: "STAGE_2_CLASS_A_ALLOWLIST",
      }),
    );
    const execResult = {
      ok: true as const,
      actionId: "cdf.phase.presentation.storyline.generate",
      actionVersion: "1.0.0",
      executionMode: "MODEL_GENERATION" as const,
      sideEffectLevel: "MUTATING" as const,
      dryRun: false,
      executionId: "exec_qa",
      result: {
        kind: "generation_result" as const,
        value: { objective: "x" },
      },
      metadata: {},
    };

    // QA OFF REPAIR OFF
    expect(
      (
        await maybeRunHttpCreateOutputQa({
          executionId: "exec_qa",
          eligibility,
          serviceId: "presentation",
          phaseId: "storyline",
          executionResult: execResult,
          env: prodEnv(),
        })
      ).path,
    ).toBe("skipped");

    // REPAIR ON + QA OFF → repair must NOT execute
    const repairNoQa = await maybeRunHttpCreateOutputQa({
      executionId: "exec_qa",
      eligibility,
      serviceId: "presentation",
      phaseId: "storyline",
      executionResult: execResult,
      env: prodEnv({ [CDF_CANONICAL_HTTP_REPAIR_ENV]: "1" }),
    });
    expect(repairNoQa.attempted).toBe(false);
    expect(repairNoQa.repairAttempted).toBe(false);

    // QA ON
    const qaOn = await maybeRunHttpCreateOutputQa({
      executionId: "exec_qa2",
      eligibility,
      serviceId: "presentation",
      phaseId: "storyline",
      executionResult: execResult,
      env: prodEnv({ [CDF_CANONICAL_HTTP_OUTPUT_QA_ENV]: "1" }),
    });
    expect(qaOn.attempted).toBe(true);
    expect(qaOn.repairAttempted).toBe(false);

    const invalid = qaStub("INVALID");
    assertNoAdvancementOnInvalidQa(invalid);
    expect(invalid.mayAdvance).toBe(false);
    const unsup = qaStub("UNSUPPORTED");
    assertRepairDoesNotValidateUnsupported(unsup);

    // Repair ON + GEN OFF → context conflict matrix preserved via plan
    process.env[CDF_CANONICAL_AUTOMATIC_REPAIR_ENV] = "1";
    delete process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV];
    const action = resolveAction("cdf.phase.presentation.storyline.generate");
    expect(action.ok).toBe(true);
    if (action.ok) {
      const plan = planCanonicalRepair({
        action: action.action,
        qa: invalid,
        policy: mergeRepairPolicy({ enabled: true }),
        attempt: 1,
        hasCandidateData: false,
      });
      // may be eligible at plan level; execution conflicts — attemptCanonicalRepair
      const attempt = await attemptCanonicalRepair({
        action: action.action,
        originalExecutionRequest: {
          actionId: action.action.actionId,
          actionVersion: action.action.version,
          requestId: "r",
          executionId: "e",
          correlationId: "c",
          input: {},
          executionContext: {
            organizationId: ORG_A,
            projectId: PROJ_A,
            currentInstruction: "keep",
            presentContext: {},
          },
          authorizationContext: {
            organizationId: ORG_A,
            projectId: PROJ_A,
            userPermissionGranted: true,
          },
        },
        originalExecutionResult: execResult,
        originalQa: invalid,
        policy: { enabled: true },
      });
      expect(
        attempt.code === "REPAIR_CONTEXT_CONFLICT" ||
          attempt.status === "FAILED" ||
          attempt.status === "NOT_ELIGIBLE" ||
          attempt.status === "DISABLED",
      ).toBe(true);
      void plan;
    }
  });

  it("31–32 — allowlist does not grant authorization", () => {
    const action = resolveAction("cdf.phase.presentation.storyline.generate");
    expect(action.ok).toBe(true);
    if (!action.ok) return;
    // Org on Stage 2 allowlist path but missing permission
    const auth = enforceActionAuthorization(
      {
        ...action.action,
        authorizationRequirements: [
          "organization",
          "project",
          "user_permission",
        ],
      } as typeof action.action,
      {
        organizationId: ORG_A,
        projectId: PROJ_A,
        userPermissionGranted: false,
      },
      {
        organizationId: ORG_A,
        projectId: PROJ_A,
        presentContext: {},
      },
    );
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.code).toBe("UNAUTHORIZED");
  });

  it("33–35 — exact version authority; latest/HEAD rejected", () => {
    expect(() => assertExactVersionPin("art@latest")).toThrow();
    expect(() => assertExactVersionPin("HEAD")).toThrow();
    assertExactArtifactVersionMatch({
      expectedArtifactId: "art_x",
      expectedVersion: 5,
      observedPins: ["art_x@5"],
    });
    expect(() =>
      assertExactArtifactVersionMatch({
        expectedArtifactId: "art_x",
        expectedVersion: 5,
        observedPins: ["art_x@6"],
      }),
    ).toThrow();
  });

  it("36–39 — observability + gates + security + Class-D boundary", () => {
    const gates = listStage1To2Gates();
    expect(gates.every((g) => g.requiredForStage2)).toBe(true);
    expect(gates.some((g) => g.id === "correctness_artifact_pin")).toBe(true);

    const sec = runProductionHardeningSecurityReview();
    expect(sec.ok).toBe(true);
    expect(sec.blockers).toHaveLength(0);
    expect(sec.findings.some((f) => f.id === "phase21_unset_stage_locked")).toBe(
      true,
    );

    expect(
      resolveCanonicalGenerationEligibility(
        { organizationId: ORG_A, serviceId: "logo" },
        prodEnv({
          [CDF_CANONICAL_GENERATION_CONTEXT_ENV]: "1",
          [CDF_CANONICAL_ROLLOUT_STAGE_ENV]: "STAGE_2_CLASS_A_ALLOWLIST",
        }),
      ).path,
    ).toBe("canonical");
    // Continuity completeness is orthogonal to Stage-2 eligibility.
    expect(classifyServiceRollout("logo").artifactContinuityComplete).toBe(
      false,
    );
  });
});
