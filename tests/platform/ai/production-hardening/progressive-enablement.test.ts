/**
 * Phase 20 — Progressive enablement, Stage 1/2, QA seam, rollback tests.
 */

import {
  CDF_CANONICAL_GENERATION_CONTEXT_ENV,
  tryApplyCanonicalGenerationContext,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  applyCdfTransition,
} from "../../../../src/platform/cdf";
import { CDF_CANONICAL_AUTOMATIC_REPAIR_ENV } from "../../../../src/platform/ai/repair";
import {
  PRODUCTION_HARDENING_CONTRACT_VERSION,
  CDF_CANONICAL_ROLLOUT_STAGE_ENV,
  CDF_CANONICAL_INTERNAL_ORG_ALLOWLIST_ENV,
  CDF_CANONICAL_INTERNAL_PROJECT_ALLOWLIST_ENV,
  CDF_CANONICAL_HTTP_OUTPUT_QA_ENV,
  CDF_CANONICAL_HTTP_REPAIR_ENV,
  resolveCanonicalGenerationEligibility,
  parseRolloutStageEnv,
  getRolloutPolicy,
  STAGE_2_CLASS_A_SERVICES,
  listStage1To2Gates,
  verifyFlagOffRollback,
  maybeRunHttpCreateOutputQa,
  assertNoAdvancementOnInvalidQa,
  assertRepairDoesNotValidateUnsupported,
  assertTraceDetailsSafe,
  assertFlagsRemainDefaultOff,
  classifyServiceRollout,
  provePresentationNnPlusOneContinuity,
  runProductionHardeningSecurityReview,
  getProductionHardeningContractVersion,
  describeFlagMatrixCell,
} from "../../../../src/platform/ai/production-hardening";
import {
  beginExecutionTrace,
  getExecutionTrace,
  resetExecutionTracesForTests,
} from "../../../../src/platform/os/observability/execution-trace";
import { resetActionRegistryForTests } from "../../../../src/platform/ai/action-registry";
import type { CanonicalOutputQAResult } from "../../../../src/platform/ai/output-qa";

const ORG_IN = "org_p20_internal";
const ORG_OUT = "org_p20_external";
const PROJ = "proj_p20";

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
              message: "invalid",
              authoritativeSource: "p20",
            },
          ]
        : status === "UNSUPPORTED"
          ? [
              {
                code: "UNSUPPORTED_VALIDATION",
                severity: "error",
                message: "unsupported",
                authoritativeSource: "p20",
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

describe("Phase 20 Progressive Enablement", () => {
  const prev: Record<string, string | undefined> = {};

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
    ]) {
      prev[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("20A — contract version + p11 baseline fix recorded", () => {
    expect(getProductionHardeningContractVersion()).toBe("21.0.0");
    expect(PRODUCTION_HARDENING_CONTRACT_VERSION).toBe("21.0.0");
    expect(getRolloutPolicy().phase20MaxStage).toBe(
      "STAGE_2_CLASS_A_ALLOWLIST",
    );
    expect(getRolloutPolicy().hiddenPercentageRollout).toBe(false);
  });

  it("Case 1 — GEN OFF REPAIR OFF → legacy", () => {
    const d = resolveCanonicalGenerationEligibility({
      organizationId: ORG_IN,
      projectId: PROJ,
      serviceId: "presentation",
    });
    expect(d.path).toBe("legacy");
    expect(d.eligible).toBe(false);
    expect(d.denyReason).toBe("generation_flag_off");
    expect(describeFlagMatrixCell(false, false).legacyCreatePath).toBe(
      "unchanged",
    );
  });

  it("Case 2 — GEN ON + Stage 1 eligible internal → canonical", () => {
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "1";
    process.env[CDF_CANONICAL_ROLLOUT_STAGE_ENV] = "STAGE_1_INTERNAL_TEST";
    process.env[CDF_CANONICAL_INTERNAL_ORG_ALLOWLIST_ENV] = ORG_IN;

    beginExecutionTrace({
      requestId: "req_p20_c2",
      executionId: "exec_p20_c2",
      correlationId: "corr_p20_c2",
    });

    const d = resolveCanonicalGenerationEligibility({
      organizationId: ORG_IN,
      projectId: PROJ,
      serviceId: "presentation",
      executionId: "exec_p20_c2",
    });
    expect(d.eligible).toBe(true);
    expect(d.path).toBe("canonical");
    expect(d.stage).toBe("STAGE_1_INTERNAL_TEST");

    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      organizationId: ORG_IN,
      projectId: PROJ,
      metadata: {
        // no session → will skip after eligibility for not_cdf_phase, but eligibility runs
        cdfServiceId: "presentation",
        apiExecutionId: "exec_p20_c2",
        executionId: "exec_p20_c2",
      },
    });
    // Without CDF session, still skipped — but rollout decision should be traced
    expect(applied.ok).toBe(true);
    const trace = getExecutionTrace("exec_p20_c2");
    expect(trace?.stages.some((s) => s.stage === "canonical_rollout")).toBe(
      true,
    );
    const stage = trace!.stages.find((s) => s.stage === "canonical_rollout")!;
    expect(stage.details?.path).toBe("canonical");
    assertTraceDetailsSafe(stage.details);
  });

  it("Case 3 — GEN ON + Stage 1 non-eligible org → eligibility legacy; contract-canonical still forced", () => {
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "1";
    process.env[CDF_CANONICAL_ROLLOUT_STAGE_ENV] = "1";
    process.env[CDF_CANONICAL_INTERNAL_ORG_ALLOWLIST_ENV] = ORG_IN;

    const d = resolveCanonicalGenerationEligibility({
      organizationId: ORG_OUT,
      projectId: PROJ,
      serviceId: "presentation",
    });
    expect(d.eligible).toBe(false);
    expect(d.path).toBe("legacy");
    expect(d.denyReason).toBe("org_not_allowlisted");

    // storyline is contract-canonical — Class-A/org rollout must not block entry.
    // Missing session surfaces the real context failure (not Class-A).
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate",
      organizationId: ORG_OUT,
      projectId: PROJ,
      metadata: {
        cdfSessionId: "sess_x",
        cdfPhaseId: "storyline",
        cdfServiceId: "presentation",
        executionId: "exec_p20_c3",
      },
    });
    expect(applied.ok).toBe(false);
    if (!applied.ok) {
      expect(applied.message).not.toMatch(/Class-A allowlist/i);
      expect(applied.message).toMatch(/session/i);
    }
  });

  it("Case 4 — GEN ON + malformed stage → fail closed legacy", () => {
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "true";
    process.env[CDF_CANONICAL_ROLLOUT_STAGE_ENV] = "STAGE_99_INVALID";
    expect(parseRolloutStageEnv().kind).toBe("malformed");
    const d = resolveCanonicalGenerationEligibility({
      organizationId: ORG_IN,
      serviceId: "presentation",
    });
    expect(d.eligible).toBe(false);
    expect(d.path).toBe("legacy");
    expect(d.failClosed).toBe(true);
    expect(d.denyReason).toBe("stage_malformed");

    // Stage 3+ also fail closed in Phase 20
    process.env[CDF_CANONICAL_ROLLOUT_STAGE_ENV] = "STAGE_3_BROADER_SERVICES";
    expect(
      resolveCanonicalGenerationEligibility({
        organizationId: ORG_IN,
        serviceId: "presentation",
      }).failClosed,
    ).toBe(true);
  });

  it("Case 5 — GEN OFF REPAIR ON → REPAIR_CONTEXT_CONFLICT matrix", () => {
    process.env[CDF_CANONICAL_AUTOMATIC_REPAIR_ENV] = "1";
    const cell = describeFlagMatrixCell(false, true);
    expect(cell.structuredRepair).toBe("context_conflict");
    expect(cell.createsUnexpectedCanonicalPath).toBe(false);
    expect(
      resolveCanonicalGenerationEligibility({
        organizationId: ORG_IN,
        serviceId: "presentation",
      }).path,
    ).toBe("legacy");
  });

  it("Case 6–7 — Stage 2 uses CDF contract eligibility; Class-A is not a gate", () => {
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "1";
    process.env[CDF_CANONICAL_ROLLOUT_STAGE_ENV] = "STAGE_2_CLASS_A_ALLOWLIST";

    expect([...STAGE_2_CLASS_A_SERVICES]).toEqual([
      "presentation",
      "packaging",
      "social-media",
    ]);

    for (const s of STAGE_2_CLASS_A_SERVICES) {
      const d = resolveCanonicalGenerationEligibility({
        organizationId: ORG_OUT,
        serviceId: s,
      });
      expect(d.eligible).toBe(true);
      expect(d.path).toBe("canonical");
      expect(classifyServiceRollout(s).readiness).toBe(
        "READY_WITH_LIMITATIONS",
      );
      expect(classifyServiceRollout(s).artifactContinuityComplete).toBe(true);
    }

    // Non–Class-A CDF services are eligible (Class-A membership irrelevant).
    const emailers = resolveCanonicalGenerationEligibility({
      organizationId: ORG_OUT,
      serviceId: "emailers",
    });
    expect(emailers.eligible).toBe(true);
    expect(emailers.path).toBe("canonical");
    expect(emailers.denyReason).toBeUndefined();
    expect(emailers.reason).not.toMatch(/Class-A allowlist/i);

    const logo = resolveCanonicalGenerationEligibility({
      organizationId: ORG_OUT,
      serviceId: "logo",
      cdfPhaseId: "logo-options",
    });
    expect(logo.eligible).toBe(true);
    expect(logo.path).toBe("canonical");

    const unknown = resolveCanonicalGenerationEligibility({
      organizationId: ORG_OUT,
      serviceId: "not-a-cdf-service",
    });
    expect(unknown.eligible).toBe(false);
    expect(unknown.denyReason).toBe("unknown_cdf_service");

    const unsup = qaStub("UNSUPPORTED");
    assertRepairDoesNotValidateUnsupported(unsup);
    const invalid = qaStub("INVALID");
    assertNoAdvancementOnInvalidQa(invalid);
    expect(invalid.mayAdvance).toBe(false);
  });

  it("Case 8 — disable canonical → subsequent eligibility legacy (rollback)", () => {
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "1";
    process.env[CDF_CANONICAL_ROLLOUT_STAGE_ENV] = "STAGE_1_INTERNAL_TEST";
    process.env[CDF_CANONICAL_INTERNAL_ORG_ALLOWLIST_ENV] = ORG_IN;
    expect(
      resolveCanonicalGenerationEligibility({
        organizationId: ORG_IN,
        serviceId: "presentation",
      }).path,
    ).toBe("canonical");

    delete process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV];
    delete process.env[CDF_CANONICAL_AUTOMATIC_REPAIR_ENV];
    const rb = verifyFlagOffRollback(process.env);
    expect(rb.ok).toBe(true);
    expect(rb.path).toBe("legacy");

    // CDF transitions still work after rollback
    const started = applyCdfTransition({
      action: "start",
      serviceId: "presentation",
      productMode: "ai",
      organizationId: ORG_IN,
      projectId: PROJ,
    });
    expect(started.ok).toBe(true);
  });

  it("Stage 1 empty allowlist fail-closed; Stage 0 blocks even if GEN ON", () => {
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "1";
    process.env[CDF_CANONICAL_ROLLOUT_STAGE_ENV] = "STAGE_1_INTERNAL_TEST";
    // empty allowlist
    const empty = resolveCanonicalGenerationEligibility({
      organizationId: ORG_IN,
      serviceId: "presentation",
    });
    expect(empty.failClosed).toBe(true);
    expect(empty.denyReason).toBe("org_allowlist_empty");

    process.env[CDF_CANONICAL_ROLLOUT_STAGE_ENV] = "STAGE_0_OFF";
    const s0 = resolveCanonicalGenerationEligibility({
      organizationId: ORG_IN,
      serviceId: "presentation",
    });
    expect(s0.eligible).toBe(false);
    expect(s0.denyReason).toBe("stage_0_off");
  });

  it("HTTP QA seam OFF by default; ON runs QA without inventing systems", async () => {
    expect(
      (
        await maybeRunHttpCreateOutputQa({
          executionId: "exec_qa_off",
          eligibility: resolveCanonicalGenerationEligibility({
            serviceId: "presentation",
          }),
          serviceId: "presentation",
          phaseId: "storyline",
          executionResult: {
            ok: true,
            actionId: "cdf.phase.presentation.storyline.generate",
            actionVersion: "1.0.0",
            executionMode: "MODEL_GENERATION",
            sideEffectLevel: "MUTATING",
            dryRun: false,
            executionId: "exec_qa_off",
            result: { kind: "generation_result", value: { ok: true } },
            metadata: {},
          },
        })
      ).path,
    ).toBe("skipped");

    process.env[CDF_CANONICAL_HTTP_OUTPUT_QA_ENV] = "1";
    beginExecutionTrace({
      requestId: "r",
      executionId: "exec_qa_on",
      correlationId: "c",
    });
    const on = await maybeRunHttpCreateOutputQa({
      executionId: "exec_qa_on",
      eligibility: {
        eligible: true,
        path: "canonical",
        generationFlag: true,
        repairFlag: false,
        stage: "STAGE_2_CLASS_A_ALLOWLIST",
        reason: "test",
        failClosed: false,
        serviceId: "presentation",
        compatMode: false,
      },
      serviceId: "presentation",
      phaseId: "storyline",
      executionResult: {
        ok: true,
        actionId: "cdf.phase.presentation.storyline.generate",
        actionVersion: "1.0.0",
        executionMode: "MODEL_GENERATION",
        sideEffectLevel: "MUTATING",
        dryRun: false,
        executionId: "exec_qa_on",
        result: { kind: "generation_result", value: { objective: "x" } },
        metadata: {},
      },
    });
    expect(on.attempted).toBe(true);
    expect(on.qa).toBeDefined();
    expect(on.repairAttempted).toBe(false);
  });

  it("Stage 1→2 gates listed; no global enable; security review", () => {
    const gates = listStage1To2Gates();
    expect(gates.length).toBeGreaterThanOrEqual(10);
    expect(gates.every((g) => g.requiredForStage2)).toBe(true);
    assertFlagsRemainDefaultOff();
    const sec = runProductionHardeningSecurityReview();
    expect(sec.ok).toBe(true);
    expect(sec.blockers).toHaveLength(0);
    expect(getRolloutPolicy().autoEnableFromBenchmarks).toBe(false);
  });

  it("Presentation N→N+1 still holds under Stage 2 eligibility", async () => {
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "1";
    process.env[CDF_CANONICAL_ROLLOUT_STAGE_ENV] = "STAGE_2_CLASS_A_ALLOWLIST";
    const proof = await provePresentationNnPlusOneContinuity({
      organizationId: "org_p20_nn",
      projectId: "proj_p20_nn",
      conversationId: "507f1f77bcf86cd79943920a",
      channelId: "service:brand_p20:presentations",
    });
    expect(proof.ok).toBe(true);
    expect(proof.turn2UpstreamPins).toContain(
      `${proof.turn1ArtifactId}@${proof.turn1ArtifactVersion}`,
    );
    expect(proof.approvalNoteNotSoT).toBe(true);
  }, 60000);

  it("compat: GEN ON with stage UNSET requires CDF_CANONICAL_ROLLOUT_COMPAT", () => {
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "1";
    // jest setup enables COMPAT by default
    const withCompat = resolveCanonicalGenerationEligibility({
      organizationId: ORG_OUT,
      serviceId: "emailers",
    });
    expect(withCompat.stage).toBe("UNSET");
    expect(withCompat.eligible).toBe(true);
    expect(withCompat.path).toBe("canonical");
    expect(withCompat.compatMode).toBe(true);

    // Production simulation: no compat
    const prodEnv = { ...process.env };
    delete prodEnv.CDF_CANONICAL_ROLLOUT_COMPAT;
    delete prodEnv[CDF_CANONICAL_ROLLOUT_STAGE_ENV];
    prodEnv[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "1";
    const without = resolveCanonicalGenerationEligibility(
      { organizationId: ORG_OUT, serviceId: "presentation" },
      prodEnv,
    );
    expect(without.eligible).toBe(false);
    expect(without.path).toBe("legacy");
    expect(without.denyReason).toBe("unset_stage_without_compat");
    expect(without.failClosed).toBe(true);
  });
});
