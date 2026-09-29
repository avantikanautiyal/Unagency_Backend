/**
 * Outcome semantics across planes:
 *   measured failure  → NEEDS_REVISION/FAIL/BLOCKED → RETRY/BLOCK → MODEL_QUALITY_FAILURE
 *   not verifiable    → UNVERIFIED → HUMAN_REVIEW (or policy fail-closed RETRY)
 *                       → VERIFICATION_INCOMPLETE (never MODEL_QUALITY_FAILURE)
 * Hard failures stay hard; provider failures stay provider failures.
 */

import assert from "node:assert/strict";
import {
  applyQualityGate,
  gateStatusToEvaluationOutcome,
  summarizeHardRequirements,
  summarizeQualityDimensions,
  DEFAULT_QUALITY_GATE_POLICY,
} from "../../../../src/platform/os/evaluation/output-validation/quality-gate";
import type {
  QualityDimensionValidationResult,
  RequirementValidationResult,
} from "../../../../src/platform/os/evaluation/output-validation/validation-result";
import { buildProductionPerformanceRecord } from "../../../../src/platform/providers/routing/performance/benchmark/production/production-record-builder";
import {
  isFairModelComparisonOutcome,
  isModelQualityEvidence,
} from "../../../../src/platform/providers/routing/performance/benchmark/contracts/benchmark-outcome";
import { createOsGovernanceEngine } from "../../../../src/platform/os/governance/governance-engine";
import { createDefaultGovernancePolicy } from "../../../../src/platform/os/governance/policy";
import { SpecGuardEvaluator } from "../../../../src/platform/os/evaluation/evaluators/spec-guard";
import { previewIsMediaProxy } from "../../../../src/platform/os/evaluation/output-validation/validators/semantic-evaluator";
import { buildArtifactContext } from "../../../../src/platform/os/evaluation/output-validation/artifact-context";

function dim(id: string, status: QualityDimensionValidationResult["status"], score: number): QualityDimensionValidationResult {
  const measured = status === "PASS" || status === "FAIL";
  return {
    dimensionId: id,
    label: id,
    score: measured ? score : 0,
    threshold: 60,
    weight: 1,
    weightedContribution: measured ? score : 0,
    status,
    evidence: [],
    evaluatorVersion: "t",
    evaluationMethod: "t",
  };
}

function req(
  id: string,
  status: RequirementValidationResult["status"],
  extra: Partial<RequirementValidationResult> = {},
): RequirementValidationResult {
  return {
    requirementId: id,
    category: "c",
    description: id,
    evaluationMethod: "m",
    status,
    expectedValue: "x",
    severity: "high",
    blocksCompletion: true,
    evidence: [],
    validatorVersion: "t",
    ...extra,
  };
}

function gate(requirements: RequirementValidationResult[], dims: QualityDimensionValidationResult[], policy = DEFAULT_QUALITY_GATE_POLICY) {
  return applyQualityGate({
    hardSummary: summarizeHardRequirements(requirements),
    qualitySummary: summarizeQualityDimensions(dims),
    requirements,
    policy,
  });
}

const NON_BLOCKING_POLICY = { ...DEFAULT_QUALITY_GATE_POLICY, blockOnUnverifiedMandatory: false };

describe("quality summary separates measured from unmeasured", () => {
  it("unmeasured dimensions do not lower the measured score", () => {
    const q = summarizeQualityDimensions([dim("a", "PASS", 90), dim("b", "UNVERIFIED", 0), dim("c", "NOT_AUTOMATED", 0)]);
    assert.equal(q.overallScore, 30); // legacy all-dimension average kept
    assert.equal(q.measuredScore, 90);
  });
  it("no measured dimensions → measuredScore null", () => {
    assert.equal(summarizeQualityDimensions([dim("b", "UNVERIFIED", 0)]).measuredScore, null);
  });
});

describe("gate status conversions", () => {
  const ok = [req("r", "PASS")];

  it("all measured and passing → PASS", () => {
    assert.equal(gate(ok, [dim("a", "PASS", 90)]).status, "PASS");
  });
  it("measured quality below threshold → NEEDS_REVISION (measured failure)", () => {
    const g = gate(ok, [dim("a", "FAIL", 20)]);
    assert.equal(g.status, "NEEDS_REVISION");
    assert.equal(gateStatusToEvaluationOutcome(g.status, g.completionAllowed), "RETRY_REQUIRED");
  });
  it("quality only unmeasured → UNVERIFIED, completion allowed, human review", () => {
    const g = gate(ok, [dim("a", "PASS", 90), dim("b", "UNVERIFIED", 0), dim("c", "NOT_AUTOMATED", 0)]);
    assert.equal(g.status, "UNVERIFIED");
    assert.equal(g.completionAllowed, true);
    assert.equal(gateStatusToEvaluationOutcome(g.status, g.completionAllowed), "HUMAN_REVIEW_REQUIRED");
  });
  it("mandatory requirement NOT_AUTOMATED under blocking policy → UNVERIFIED but fail-closed", () => {
    const g = gate([req("build", "NOT_AUTOMATED", { severity: "critical" })], []);
    assert.equal(g.status, "UNVERIFIED");
    assert.equal(g.completionAllowed, false);
    assert.equal(gateStatusToEvaluationOutcome(g.status, g.completionAllowed), "RETRY_REQUIRED");
    // Unknown completion decision defaults to fail-closed.
    assert.equal(gateStatusToEvaluationOutcome("UNVERIFIED"), "RETRY_REQUIRED");
  });
  it("measured non-blocking FAIL stays FAIL; blocking/critical FAIL stays BLOCKED", () => {
    const f = gate([req("r", "FAIL", { severity: "medium", blocksCompletion: false })], [], NON_BLOCKING_POLICY);
    assert.equal(f.status, "FAIL");
    assert.equal(gateStatusToEvaluationOutcome(f.status, f.completionAllowed), "RETRY_REQUIRED");
    const b = gate([req("r", "FAIL", { severity: "critical" })], []);
    assert.equal(b.status, "BLOCKED");
    assert.equal(gateStatusToEvaluationOutcome(b.status, b.completionAllowed), "BLOCKED");
  });
});

describe("evidence outcome conversions", () => {
  const baseValidation = {
    contractId: "c",
    contractVersion: "1",
    effectiveContractId: "c",
    completionAllowed: true,
    qualityScore: 30,
    hardRequirementSummary: { passed: 1, failed: 0, total: 1, unverified: 0 },
    qualityDimensions: [],
    failureSummary: { failures: [] },
    requirementStatuses: [],
    requirements: [],
    provenance: [],
  };
  function outcome(status: string, extra: Record<string, unknown> = {}) {
    return buildProductionPerformanceRecord({
      productionExecutionId: "e",
      organizationId: "o",
      providerId: "provider.google",
      modelId: "gemini-3-pro-image",
      capabilityId: "image.generate",
      strategyId: "s",
      strategyVersion: "1",
      knowledgeId: "k",
      knowledgeVersion: "1",
      knowledgeFingerprint: "f",
      validation: { ...baseValidation, status, ...extra } as never,
      preview: "p",
      mediaArtifactIds: ["art_1"],
      latencyMs: 1,
      providerSuccess: true,
      createId: (p) => p,
      nowIso: () => "2026-09-23T00:00:00.000Z",
      ...(extra.__record as object),
    }).benchmarkOutcome;
  }

  it("UNVERIFIED (completion allowed) → VERIFICATION_INCOMPLETE, not model quality", () => {
    const o = outcome("UNVERIFIED");
    assert.equal(o, "VERIFICATION_INCOMPLETE");
    assert.equal(isModelQualityEvidence(o), false);
    assert.equal(isFairModelComparisonOutcome(o), false);
  });
  it("UNVERIFIED (policy fail-closed) → VERIFICATION_INCOMPLETE, never MODEL_QUALITY_FAILURE", () => {
    assert.equal(outcome("UNVERIFIED", { completionAllowed: false }), "VERIFICATION_INCOMPLETE");
  });
  it("measured NEEDS_REVISION → MODEL_QUALITY_FAILURE", () => {
    assert.equal(outcome("NEEDS_REVISION", { completionAllowed: false }), "MODEL_QUALITY_FAILURE");
  });
  it("PASS → MODEL_SUCCESS", () => {
    assert.equal(outcome("PASS"), "MODEL_SUCCESS");
  });
  it("provider failure → PROVIDER_OPERATIONAL_FAILURE (not structural, not unverified)", () => {
    assert.equal(outcome("UNVERIFIED", { __record: { providerSuccess: false } }), "PROVIDER_OPERATIONAL_FAILURE");
  });
  it("structural completion block → STRUCTURAL_COMPLIANCE_FAILURE", () => {
    assert.equal(outcome("PASS", { __record: { structuralComplianceBlocked: true } }), "STRUCTURAL_COMPLIANCE_FAILURE");
  });
});

describe("governance action per evaluation outcome", () => {
  function decide(outcome: "HUMAN_REVIEW_REQUIRED" | "RETRY_REQUIRED" | "BLOCKED" | "PASS_WITH_WARNINGS") {
    return createOsGovernanceEngine(createDefaultGovernancePolicy("o")).decideFromEvaluation({
      scope: "execution",
      providerSuccess: true,
      aggregate: {
        organizationId: "o",
        executionId: "e",
        planId: "p",
        planVersion: 1,
        worstOutcome: outcome,
        aggregateScores: {},
        results: [
          {
            evaluationId: "ev",
            version: "1",
            organizationId: "o",
            executionId: "e",
            planId: "p",
            planVersion: 1,
            evaluatorId: "spec_guard",
            evaluatorType: "specification",
            evaluatorVersion: "1",
            evaluatedAt: "t",
            outcome,
            scores: {},
            findings: [],
            severity: "warning",
            confidence: 1,
            provenance: [],
          },
        ],
      } as never,
    });
  }
  it("UNVERIFIED spec (HUMAN_REVIEW_REQUIRED) → HUMAN_REVIEW, non-blocking", () => {
    const d = decide("HUMAN_REVIEW_REQUIRED");
    assert.equal(d.action, "HUMAN_REVIEW");
    assert.equal(d.blocking, false);
  });
  it("measured revision (RETRY_REQUIRED) → RETRY, non-blocking", () => {
    const d = decide("RETRY_REQUIRED");
    assert.equal(d.action, "RETRY");
    assert.equal(d.blocking, false);
  });
  it("hard spec failure (BLOCKED) → BLOCK", () => {
    assert.equal(decide("BLOCKED").action, "BLOCK");
  });
});

describe("spec_guard on media deliverables — text preview is proxy evidence", () => {
  const base = {
    organizationId: "o",
    executionId: "e",
    planId: "p",
    planVersion: 1,
    outputContractId: "output.image",
    objective: "Logo for Lotus Leaf tea — calm, premium, botanical.",
    service: "branding",
    subtype: "logo-design",
    outputKind: "image",
    isImageCapability: true,
    mediaOutputCount: 1,
    capabilityId: "image.generate",
    mediaArtifactIds: ["art_1"],
    nowIso: () => "t",
    createId: (p: string) => p,
  };

  it("provider text part never measured as the media deliverable (same verdict with/without it)", () => {
    const withText = new SpecGuardEvaluator().evaluate({ ...base, preview: "Here is the Lotus Leaf logo system with colour palette." } as never);
    const placeholder = new SpecGuardEvaluator().evaluate({ ...base, preview: "[execution output]" } as never);
    assert.equal(withText.outcome, "HUMAN_REVIEW_REQUIRED");
    assert.equal(placeholder.outcome, "HUMAN_REVIEW_REQUIRED");
    assert.ok(!withText.findings.some((f) => f.code === "SPEC_CONTRACT_REQ_FAIL"));
    assert.ok(withText.findings.some((f) => f.code === "SPEC_QUALITY_GATE_UNVERIFIED"));
  });

  it("text deliverables are still measured from their text", () => {
    assert.equal(previewIsMediaProxy(buildArtifactContext({ preview: "copy", outputKind: "text" })), false);
    assert.equal(previewIsMediaProxy(buildArtifactContext({ preview: "copy", outputKind: "image", mediaArtifactIds: ["a"] })), true);
    assert.equal(previewIsMediaProxy(buildArtifactContext({ preview: "copy", mediaArtifactIds: ["a"] })), true);
    assert.equal(previewIsMediaProxy(buildArtifactContext({ preview: "copy" })), false);
  });
});

