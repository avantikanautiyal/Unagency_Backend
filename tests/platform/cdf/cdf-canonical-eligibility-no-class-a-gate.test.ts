/**
 * Canonical execution eligibility is contract-derived — Class-A is never a gate.
 *
 * Authority: resolveCdfPhaseExecutionContract(...).executionStrategy === "canonical"
 * Class-A / CDF_DEEP_INGEST_RUNTIME_SERVICES may select deep adapters only.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  applyCdfTransition,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  resolveCdfServiceConfig,
  tryApplyCanonicalGenerationContext,
  CDF_CANONICAL_GENERATION_CONTEXT_ENV,
} from "../../../src/platform/cdf";
import { resolveCdfPhaseExecutionContract } from "../../../src/platform/cdf/canonical";
import { CDF_DEEP_INGEST_RUNTIME_SERVICES } from "../../../src/platform/ai/conversational-runtime/acceptance-matrix";
import {
  CDF_CANONICAL_ROLLOUT_STAGE_ENV,
  CDF_CANONICAL_INTERNAL_ORG_ALLOWLIST_ENV,
  resolveCanonicalGenerationEligibility,
  isClassARolloutService,
  STAGE_2_CLASS_A_SERVICES,
} from "../../../src/platform/ai/production-hardening";

const DEEP = new Set<string>(CDF_DEEP_INGEST_RUNTIME_SERVICES);

function stage2Env(extra?: Record<string, string>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    [CDF_CANONICAL_GENERATION_CONTEXT_ENV]: "1",
    [CDF_CANONICAL_ROLLOUT_STAGE_ENV]: "STAGE_2_CLASS_A_ALLOWLIST",
    ...extra,
  };
}

describe("CDF canonical eligibility — contract over Class-A", () => {
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
    for (const k of [
      CDF_CANONICAL_GENERATION_CONTEXT_ENV,
      CDF_CANONICAL_ROLLOUT_STAGE_ENV,
      CDF_CANONICAL_INTERNAL_ORG_ALLOWLIST_ENV,
    ]) {
      prev[k] = process.env[k];
    }
    process.env[CDF_CANONICAL_GENERATION_CONTEXT_ENV] = "1";
    process.env[CDF_CANONICAL_ROLLOUT_STAGE_ENV] = "STAGE_2_CLASS_A_ALLOWLIST";
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("1 — Logo canonical phase allowed without Class-A membership", () => {
    assert.equal(isClassARolloutService("logo"), false);
    assert.ok(!DEEP.has("logo"));
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: "logo",
      phaseId: "logo-options",
    });
    assert.equal(contract?.executionStrategy, "canonical");

    const d = resolveCanonicalGenerationEligibility(
      {
        organizationId: "org_any",
        serviceId: "logo",
        cdfPhaseId: "logo-options",
      },
      stage2Env(),
    );
    assert.equal(d.eligible, true);
    assert.equal(d.path, "canonical");
    assert.equal(d.denyReason, undefined);
    assert.doesNotMatch(d.reason, /Class-A allowlist/i);
  });

  it("2 — Another non-Class-A canonical service (emailers) is allowed", () => {
    assert.equal(isClassARolloutService("emailers"), false);
    const d = resolveCanonicalGenerationEligibility(
      {
        organizationId: "org_any",
        serviceId: "emailers",
        cdfPhaseId: "copy-routes",
      },
      stage2Env(),
    );
    assert.equal(d.eligible, true);
    assert.equal(d.path, "canonical");
  });

  it("3 — Class-A membership does not affect canonical eligibility", () => {
    const classA = resolveCanonicalGenerationEligibility(
      {
        organizationId: "org_any",
        serviceId: "packaging",
        cdfPhaseId: "3d-direction",
      },
      stage2Env(),
    );
    const nonClassA = resolveCanonicalGenerationEligibility(
      {
        organizationId: "org_any",
        serviceId: "logo",
        cdfPhaseId: "logo-options",
      },
      stage2Env(),
    );
    assert.equal(classA.eligible, true);
    assert.equal(nonClassA.eligible, true);
    assert.equal(classA.path, nonClassA.path);
    assert.ok([...STAGE_2_CLASS_A_SERVICES].includes("packaging"));
    assert.ok(![...STAGE_2_CLASS_A_SERVICES].includes("logo"));
  });

  it("4 — Canonical phase with deep adapter stays deep-capable (Class-A overlay)", () => {
    assert.ok(DEEP.has("packaging"));
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: "packaging",
      phaseId: "3d-direction",
    });
    assert.equal(contract?.executionStrategy, "canonical");
    // Deep list remains for adapter selection — packaging is deep.
    assert.equal(isClassARolloutService("packaging"), true);
  });

  it("5 — Canonical phase without deep adapter uses generic completion class", () => {
    assert.ok(!DEEP.has("logo"));
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: "logo",
      phaseId: "logo-system",
    });
    assert.equal(contract?.executionStrategy, "canonical");
    assert.equal(isClassARolloutService("logo"), false);
  });

  it("6 — executionStrategy=none does not enter canonical generation", () => {
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: "logo",
      phaseId: "logo-type",
    });
    assert.equal(contract?.executionStrategy, "none");
    const d = resolveCanonicalGenerationEligibility(
      {
        organizationId: "org_any",
        serviceId: "logo",
        cdfPhaseId: "logo-type",
      },
      stage2Env(),
    );
    assert.equal(d.eligible, false);
    assert.equal(d.path, "legacy");
    assert.equal(d.denyReason, "phase_strategy_none");
  });

  it("7 — Unsupported / non-canonical strategy does not silently become canonical", () => {
    // final is none — never silently promoted
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: "logo",
      phaseId: "final",
    });
    assert.equal(contract?.executionStrategy, "none");
    const d = resolveCanonicalGenerationEligibility(
      {
        organizationId: "org_any",
        serviceId: "logo",
        cdfPhaseId: "final",
      },
      stage2Env(),
    );
    assert.equal(d.eligible, false);
    assert.notEqual(d.path, "canonical");
  });

  it("8 — No env restores Class-A as a prerequisite for contract-canonical", () => {
    // Even STAGE_2_CLASS_A_ALLOWLIST must allow logo.
    const envs: NodeJS.ProcessEnv[] = [
      stage2Env(),
      stage2Env({ [CDF_CANONICAL_ROLLOUT_STAGE_ENV]: "2" }),
      stage2Env({ [CDF_CANONICAL_ROLLOUT_STAGE_ENV]: "stage_2_class_a" }),
    ];
    for (const env of envs) {
      const d = resolveCanonicalGenerationEligibility(
        {
          organizationId: "org_any",
          serviceId: "logo",
          cdfPhaseId: "logo-options",
        },
        env,
      );
      assert.equal(d.eligible, true, `env stage=${env[CDF_CANONICAL_ROLLOUT_STAGE_ENV]}`);
      assert.doesNotMatch(d.reason, /not in Class-A/i);
    }

    // Contract-forced apply path never surfaces Class-A block.
    const applied = tryApplyCanonicalGenerationContext({
      prompt: "Generate logo options",
      organizationId: "org_any",
      metadata: {
        cdfSessionId: "cdf_sess_logo_gate",
        cdfServiceId: "logo",
        cdfPhaseId: "logo-options",
        cdfExecutionStrategy: "canonical",
      },
    });
    if (!applied.ok) {
      assert.doesNotMatch(applied.message, /Class-A allowlist/i);
      // Missing session may fail for other reasons — Class-A must not be why.
      assert.notEqual(
        (applied.details as { reason?: string } | undefined)?.reason,
        "service_not_class_a",
      );
    } else {
      assert.ok(applied.ok);
    }
  });

  it("9 — Remote nextWork comes from result.nextWork (not inventLocal)", () => {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "logo",
      productMode: "ai",
    });
    assert.equal(started.ok, true);
    if (!started.ok) return;
    assert.ok(started.value.nextWork);
    assert.ok(!started.value.session.sessionId.startsWith("local_"));
    // Brief → territories (or first active phase)
    const briefed = applyCdfTransition({
      sessionId: started.value.session.sessionId,
      action: "submit_brief",
      brief: "Minimal wordmark for a fintech brand",
      expectedVersion: started.value.session.sessionVersion,
    });
    assert.equal(briefed.ok, true, JSON.stringify(briefed));
    if (!briefed.ok) return;
    assert.ok(briefed.value.nextWork);
    assert.equal(typeof briefed.value.nextWork.kind, "string");
  });

  it("10/11/12 — No serviceId / phaseId / provider-specific eligibility bypass branches", () => {
    const eligibilitySrc = fs.readFileSync(
      path.join(
        __dirname,
        "../../../src/platform/ai/production-hardening/eligibility.ts",
      ),
      "utf8",
    );
    assert.doesNotMatch(
      eligibilitySrc,
      /serviceId\s*===\s*["']logo["']/,
    );
    assert.doesNotMatch(
      eligibilitySrc,
      /phaseId\s*===\s*["']logo-options["']/,
    );
    assert.doesNotMatch(eligibilitySrc, /providerId\s*===\s*/);
    // Class-A membership must not deny eligibility.
    assert.doesNotMatch(
      eligibilitySrc,
      /not in Class-A allowlist/,
    );
    assert.doesNotMatch(
      eligibilitySrc,
      /CLASS_A\.has\(serviceId\)[\s\S]{0,120}eligible:\s*false/,
    );
  });

  it("13 — No UI-only bypass: failure string must not be Class-A for logo contract", () => {
    const applySrc = fs.readFileSync(
      path.join(
        __dirname,
        "../../../src/platform/cdf/generation-context/apply.ts",
      ),
      "utf8",
    );
    // Contract-canonical path must short-circuit before Class-A fail.
    assert.match(applySrc, /contract_canonical_overrides_rollout_eligibility/);
    assert.match(applySrc, /mustStayCanonical/);
  });

  it("14 — Logo Options reachable after Territories in config order", () => {
    const config = resolveCdfServiceConfig("logo");
    assert.ok(config);
    const ids = config!.phases.map((p) => p.id);
    const t = ids.indexOf("territories");
    const o = ids.indexOf("logo-options");
    assert.ok(t >= 0 && o > t);
    assert.equal(
      resolveCdfPhaseExecutionContract({
        serviceId: "logo",
        phaseId: "logo-options",
      })?.executionStrategy,
      "canonical",
    );
  });

  it("15 — Logo System reachable after Logo Options in config order", () => {
    const config = resolveCdfServiceConfig("logo");
    assert.ok(config);
    const ids = config!.phases.map((p) => p.id);
    const o = ids.indexOf("logo-options");
    const s = ids.indexOf("logo-system");
    assert.ok(o >= 0 && s > o);
    assert.equal(
      resolveCdfPhaseExecutionContract({
        serviceId: "logo",
        phaseId: "logo-system",
      })?.executionStrategy,
      "canonical",
    );
  });

  it("static — eligibility never emits service_not_class_a", () => {
    for (const serviceId of ["logo", "emailers", "web-tech", "packaging"]) {
      const d = resolveCanonicalGenerationEligibility(
        { organizationId: "org_x", serviceId },
        stage2Env(),
      );
      assert.notEqual(d.denyReason, "service_not_class_a");
      if (d.eligible) {
        assert.doesNotMatch(d.reason, /Class-A allowlist/i);
      }
    }
  });
});
