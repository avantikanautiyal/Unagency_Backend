/**
 * Quality planes (structural verification, creative score) are observational.
 * An established canonical ArtifactVersion must not be converted into
 * STRUCTURAL_COMPLIANCE_FAILURE or a governance BLOCK by them.
 *
 * Fixture metadata mirrors live exec_172_1790149766439 (logo-system,
 * OpenAI quota → Gemini fallback, OCR rendered_text_match NON_COMPLIANT,
 * canonical cdfart_mudszvfl_3_logo-logo-system@1 accepted).
 */

import assert from "node:assert/strict";
import {
  hasStructuralFailureStamp,
  isCanonicalCompletionEstablished,
  isStructuralCompletionBlocked,
} from "../../../src/platform/cdf/generation-validation/structural-completion-authority";
import { buildProductionExecutionIntegrity } from "../../../src/platform/os/observability/production-execution-integrity";
import { attachProviderNetworkFailureMetadata } from "../../../src/platform/providers/runtime/diagnostics/provider-error-extraction";
import { META_CONFIG } from "../../../src/platform/providers/compat/configs/text-provider-configs";
import { FetchCompatHttpClient } from "../../../src/platform/providers/compat/http/compat-http-client";
import { CreativeScoreEvaluator } from "../../../src/platform/os/evaluation/evaluators/creative-score-evaluator";
import { createOsEvaluationEngine } from "../../../src/platform/os/evaluation/engine/evaluation-engine";
import { createOsGovernanceEngine } from "../../../src/platform/os/governance/governance-engine";
import { createDefaultGovernancePolicy } from "../../../src/platform/os/governance/policy";
import { creativeQaFromEvaluationResult } from "../../../src/platform/os/evaluation/creative-score/creative-qa-gate";
import { CREATIVE_SCORE_RELEASE_GATE } from "../../../src/platform/os/evaluation/creative-score/creative-score-dimensions";
import {
  effectiveEvaluationOutcome,
  evaluationMayBlock,
} from "../../../src/platform/os/evaluation/contracts/evaluation-result";

const STRUCTURAL_NON_COMPLIANT = Object.freeze({
  status: "NON_COMPLIANT",
  overallStructuralVerdict: "NON_COMPLIANT",
  failedRequirements: ["rendered_text_match"],
  blocksCanonicalCompletion: true,
  blockingDecision: true,
  canonicalIngestDecision: "blocked",
  diagnosticAuthority: "observational",
});

const CANONICAL_ACCEPTED = Object.freeze({
  cdfArtifactId: "cdfart_mudszvfl_3_logo-logo-system",
  cdfArtifactVersion: 1,
  cdfArtifactKey: "logo-system",
  cdfCanonicalCompletionEstablished: true,
  cdfGeneratedArtifactsBound: true,
});

const identity = Object.freeze({
  requestedProviderId: "provider.openai",
  requestedModelId: "gpt-image-2.5-sunburst",
  selectedProviderId: "provider.openai",
  selectedModelId: "gpt-image-2.5-sunburst",
  actualProviderId: "provider.google",
  actualModelId: "gemini-3-pro-image",
  fallbackUsed: true,
  fallbackReason: "quota",
});

function integrityFor(input: {
  metadata: Record<string, unknown>;
  providerSuccess: boolean;
  mediaArtifactIds?: string[];
}) {
  return buildProductionExecutionIntegrity({
    executionId: "exec_172_1790149766439",
    correlationId: "corr_173",
    service: "brand-identity",
    subtype: "logo-system",
    outputKind: "image",
    capabilityId: "image.generate",
    providerIdentity: identity,
    providerSuccess: input.providerSuccess,
    mediaArtifactIds: input.mediaArtifactIds ?? ["art_syncimg_185_1790149823455_0"],
    metadata: input.metadata,
    allowMissingArtifacts: true,
  });
}

describe("structural completion authority predicate", () => {
  it("structural failure on established canonical is not a completion block", () => {
    const meta = {
      ...CANONICAL_ACCEPTED,
      cdfStructuralComplianceStatus: "NON_COMPLIANT",
      cdfStructuralCompliance: STRUCTURAL_NON_COMPLIANT,
    };
    assert.equal(hasStructuralFailureStamp(meta), true);
    assert.equal(isCanonicalCompletionEstablished(meta), true);
    assert.equal(isStructuralCompletionBlocked(meta), false);
  });

  it("structural failure without canonical completion stays on structural plane", () => {
    const meta = {
      cdfStructuralComplianceStatus: "NON_COMPLIANT",
      cdfStructuralCompliance: STRUCTURAL_NON_COMPLIANT,
    };
    assert.equal(isStructuralCompletionBlocked(meta), true);
  });

  it("no structural stamp → never structural blocked", () => {
    assert.equal(isStructuralCompletionBlocked({ productCompletionBlocked: true }), false);
    assert.equal(isStructuralCompletionBlocked(undefined), false);
  });
});

describe("production integrity — structural quality plane", () => {
  it("provider SUCCESS + canonical ACCEPTED + NON_COMPLIANT → PASS (not STRUCTURAL_COMPLIANCE_FAILURE)", () => {
    const r = integrityFor({
      providerSuccess: true,
      metadata: {
        ...CANONICAL_ACCEPTED,
        cdfStructuralComplianceStatus: "NON_COMPLIANT",
        cdfStructuralCompliance: STRUCTURAL_NON_COMPLIANT,
        providerJobSucceeded: true,
      },
    });
    assert.notEqual(r.failureCategory, "STRUCTURAL_COMPLIANCE_FAILURE");
    assert.ok(!r.integrityFailures.includes("STRUCTURAL_COMPLIANCE_FAILURE"));
    assert.notEqual(r.integrityStatus, "FAIL");
  });

  it("provider SUCCESS + canonical ACCEPTED + UNVERIFIABLE → not FAIL", () => {
    const r = integrityFor({
      providerSuccess: true,
      metadata: {
        ...CANONICAL_ACCEPTED,
        cdfStructuralComplianceStatus: "UNVERIFIABLE",
        cdfStructuralCompliance: { status: "UNVERIFIABLE" },
      },
    });
    assert.notEqual(r.integrityStatus, "FAIL");
    assert.equal(r.failureCategory, undefined);
  });

  it("provider SUCCESS + canonical ACCEPTED + COMPLIANT → not FAIL", () => {
    const r = integrityFor({
      providerSuccess: true,
      metadata: { ...CANONICAL_ACCEPTED, cdfStructuralComplianceStatus: "COMPLIANT" },
    });
    assert.notEqual(r.integrityStatus, "FAIL");
  });

  it("provider FAILURE → PROVIDER_EXECUTION_FAILURE (not structural)", () => {
    const r = integrityFor({ providerSuccess: false, mediaArtifactIds: [], metadata: {} });
    assert.equal(r.integrityStatus, "FAIL");
    assert.equal(r.failureCategory, "PROVIDER_EXECUTION_FAILURE");
  });

  it("preserves requested / selected / actual model and fallback accounting", () => {
    const r = integrityFor({ providerSuccess: true, metadata: { ...CANONICAL_ACCEPTED } });
    assert.equal(r.requestedModel, "gpt-image-2.5-sunburst");
    assert.equal(r.selectedModel, "gpt-image-2.5-sunburst");
    assert.equal(r.actualProvider, "provider.google");
    assert.equal(r.actualModel, "gemini-3-pro-image");
    assert.equal(r.fallbackUsed, true);
    assert.equal(r.fallbackReason, "quota");
  });
});

describe("evaluator authority — creative score", () => {
  const prevQa = process.env.CREATIVE_QA;
  afterEach(() => {
    if (prevQa === undefined) delete process.env.CREATIVE_QA;
    else process.env.CREATIVE_QA = prevQa;
  });

  const BASE = {
    organizationId: "org_q",
    executionId: "exec_q",
    planId: "plan_q",
    planVersion: 1,
    outputContractId: "output.image",
    objective: "Create a finished Logo System for the selected brand",
    preview: "[execution output]",
    nowIso: () => "2026-09-23T00:00:00.000Z",
    createId: (p: string) => `${p}_t`,
  };

  function govern(aggregate: ReturnType<ReturnType<typeof createOsEvaluationEngine>["evaluateOutput"]>) {
    return createOsGovernanceEngine(createDefaultGovernancePolicy("org_q")).decideFromEvaluation({
      aggregate,
      scope: "execution",
      providerSuccess: true,
    });
  }

  it("media deliverable: raw BLOCKED judgment preserved, authority = proxy evidence", () => {
    process.env.CREATIVE_QA = "on";
    const r = new CreativeScoreEvaluator().evaluate({ ...BASE, isImageCapability: true });
    assert.ok((r.scores.creativeScoreTotal ?? 100) < CREATIVE_SCORE_RELEASE_GATE);
    assert.equal(r.outcome, "BLOCKED");
    assert.deepEqual(r.authority, {
      releaseGate: true,
      evidenceBasis: "proxy",
      basisReason: "text_preview_of_media_deliverable",
    });
    assert.ok(r.findings.some((f) => f.code === "CREATIVE_SCORE_BELOW_GATE"));
    assert.equal(evaluationMayBlock(r), false);
    assert.equal(effectiveEvaluationOutcome(r), "HUMAN_REVIEW_REQUIRED");
    const gate = creativeQaFromEvaluationResult(r);
    assert.equal(gate?.blockedRelease, false);
    assert.equal(gate?.releaseAllowed, false);
    assert.equal(gate?.totalScore, r.scores.creativeScoreTotal);
  });

  it("media deliverable below gate → governance HUMAN_REVIEW (non-blocking), score kept", () => {
    process.env.CREATIVE_QA = "on";
    const aggregate = createOsEvaluationEngine().evaluateOutput({
      ...BASE,
      isImageCapability: true,
      mediaOutputCount: 1,
    });
    const d = govern(aggregate);
    assert.equal(d.action, "HUMAN_REVIEW");
    assert.equal(d.blocking, false);
    assert.ok(aggregate.aggregateScores.creativeScoreTotal! < CREATIVE_SCORE_RELEASE_GATE);
    const check = d.checks.find((c) => c.checkId === "creative_score")!;
    assert.match(check.message, /^BLOCKED \(advisory → HUMAN_REVIEW_REQUIRED: proxy evidence\)/);
  });

  it("text deliverable below gate → BLOCK (evaluated the deliverable itself)", () => {
    process.env.CREATIVE_QA = "on";
    const r = new CreativeScoreEvaluator().evaluate({ ...BASE, preview: "tiny" });
    assert.equal(r.authority?.evidenceBasis, "deliverable");
    assert.equal(evaluationMayBlock(r), true);
    assert.equal(creativeQaFromEvaluationResult(r)?.blockedRelease, true);
    const d = govern(createOsEvaluationEngine().evaluateOutput({ ...BASE, preview: "tiny" }));
    assert.equal(d.action, "BLOCK");
  });

  it("shadow rollout is not a release gate → never BLOCK on creative total", () => {
    process.env.CREATIVE_QA = "shadow";
    const aggregate = createOsEvaluationEngine().evaluateOutput({ ...BASE, preview: "tiny" });
    const cr = aggregate.results.find((r) => r.evaluatorId === "creative_score")!;
    assert.equal(cr.authority?.releaseGate, false);
    assert.notEqual(govern(aggregate).action, "BLOCK");
  });

  it("evaluations without declared authority stay authoritative (legacy)", () => {
    assert.equal(evaluationMayBlock({}), true);
    assert.equal(effectiveEvaluationOutcome({ outcome: "BLOCKED" }), "BLOCKED");
  });
});

describe("Meta compat provider endpoint", () => {
  it("targets the resolvable Llama API host", () => {
    assert.equal(new URL(META_CONFIG.baseUrl).hostname, "api.llama.com");
    assert.equal(new URL(META_CONFIG.baseUrl).pathname, "/compat/v1");
  });

  it("DNS failure is classified network / noHttpResponse / ENOTFOUND", () => {
    const err = new TypeError("fetch failed");
    (err as { cause?: unknown }).cause = Object.assign(new Error("getaddrinfo ENOTFOUND"), {
      code: "ENOTFOUND",
    });
    const meta = attachProviderNetworkFailureMetadata({
      err,
      providerId: "provider.meta",
      vendor: "meta",
      durationMs: 12,
    });
    assert.equal(meta.failureCategoryHint, "network");
    assert.equal(meta.noHttpResponse, true);
    assert.equal(meta.networkErrorCode, "ENOTFOUND");
  });

  describe("live-shaped transport diagnostics (fetch stubbed)", () => {
    const KEY = "SECRET_KEY_SHOULD_NEVER_APPEAR_123";
    const realFetch = global.fetch;
    afterEach(() => {
      global.fetch = realFetch;
    });
    const send = () =>
      new FetchCompatHttpClient(META_CONFIG, { apiKey: KEY }).send({
        method: "POST",
        path: "/chat/completions",
        body: { model: "Llama-4-Maverick-17B-128E-Instruct-FP8", messages: [] },
      });

    it("HTTP 401 invalid_api_key → status, provider code, host, model; no secret", async () => {
      global.fetch = (async () =>
        new Response(
          JSON.stringify({
            error: { message: "Authentication Error", type: "authentication_error", code: "invalid_api_key" },
          }),
          { status: 401 },
        )) as typeof fetch;
      const r = await send();
      assert.equal(r.ok, false);
      if (r.ok) return;
      const m = (r.error as { metadata: Record<string, unknown> }).metadata;
      assert.equal(m.httpStatus, 401);
      assert.equal(m.noHttpResponse, false);
      assert.equal(m.providerErrorCode, "invalid_api_key");
      assert.equal(m.providerErrorType, "authentication_error");
      assert.equal(m.endpointHost, "api.llama.com");
      assert.equal(m.model, "Llama-4-Maverick-17B-128E-Instruct-FP8");
      assert.ok(!JSON.stringify(m).includes(KEY));
      assert.ok(!String(r.error.message).includes(KEY));
    });

    it("DNS failure → network / noHttpResponse / ENOTFOUND with host + model; no secret", async () => {
      global.fetch = (async () => {
        const err = new TypeError("fetch failed");
        (err as { cause?: unknown }).cause = Object.assign(new Error("getaddrinfo ENOTFOUND"), {
          code: "ENOTFOUND",
        });
        throw err;
      }) as typeof fetch;
      const r = await send();
      assert.equal(r.ok, false);
      if (r.ok) return;
      const m = (r.error as { metadata: Record<string, unknown> }).metadata;
      assert.equal(m.failureCategoryHint, "network");
      assert.equal(m.noHttpResponse, true);
      assert.equal(m.networkErrorCode, "ENOTFOUND");
      assert.equal(m.endpointHost, "api.llama.com");
      assert.equal(m.model, "Llama-4-Maverick-17B-128E-Instruct-FP8");
      assert.ok(!JSON.stringify(m, (_k, v) => (v instanceof Error ? v.message : v)).includes(KEY));
    });
  });
});
