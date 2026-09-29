/**
 * Outcome planes must stay independent:
 * provider SUCCESS + structural NON_COMPLIANT ≠ PROVIDER_EXECUTION_FAILURE.
 */

import assert from "node:assert/strict";
import { buildProductionExecutionIntegrity } from "../../../src/platform/os/observability/production-execution-integrity";
import { buildProductionPerformanceRecord } from "../../../src/platform/providers/routing/performance/benchmark/production/production-record-builder";

const identity = Object.freeze({
  requestedProviderId: "provider.ideogram",
  requestedModelId: "ideogram-3",
  selectedProviderId: "provider.ideogram",
  selectedModelId: "ideogram-3",
  actualProviderId: "provider.ideogram",
  actualModelId: "ideogram-3",
  fallbackUsed: false,
});

const emptyValidation = Object.freeze({
  contractId: "contract.test",
  contractVersion: "1.0.0",
  effectiveContractId: "contract.test",
  status: "PASS" as const,
  completionAllowed: true,
  qualityScore: 70,
  hardRequirementSummary: Object.freeze({
    passed: 1,
    failed: 0,
    total: 1,
    unverified: 0,
  }),
  qualityDimensions: Object.freeze([]),
  failureSummary: Object.freeze({ failures: Object.freeze([]) }),
  requirementStatuses: Object.freeze([]),
  requirements: Object.freeze([]),
  provenance: Object.freeze([]),
});

describe("outcome-plane classification (structural vs provider)", () => {
  it("exec_59 pattern: structural block → STRUCTURAL_COMPLIANCE_FAILURE (not PROVIDER_*)", () => {
    const integrity = buildProductionExecutionIntegrity({
      executionId: "exec_59_1789410902308",
      correlationId: "corr_exec_59",
      service: "social-media",
      subtype: "instagram-post",
      outputKind: "image",
      capabilityId: "image.generate",
      providerIdentity: identity,
      providerSuccess: true,
      mediaArtifactIds: ["art_syncimg_100_1789410925879_0"],
      metadata: {
        cdfStructuralComplianceStatus: "NON_COMPLIANT",
        cdfStructuralCompliance: {
          blockingDecision: true,
          canonicalIngestDecision: "blocked",
          overallStructuralVerdict: "NON_COMPLIANT",
          blocksCanonicalCompletion: true,
        },
        presentationEligibility: { status: "REJECTED" },
        providerJobSucceeded: true,
      },
      allowMissingArtifacts: true,
    });

    assert.equal(integrity.integrityStatus, "FAIL");
    assert.equal(integrity.failureCategory, "STRUCTURAL_COMPLIANCE_FAILURE");
    assert.notEqual(integrity.failureCategory, "PROVIDER_EXECUTION_FAILURE");
  });

  it("true provider operational failure remains PROVIDER_EXECUTION_FAILURE", () => {
    const integrity = buildProductionExecutionIntegrity({
      executionId: "exec_provider_429",
      correlationId: "corr_429",
      service: "social-media",
      subtype: "instagram-post",
      outputKind: "image",
      capabilityId: "image.generate",
      providerIdentity: identity,
      providerSuccess: false,
      mediaArtifactIds: [],
      metadata: {},
      allowMissingArtifacts: true,
    });

    assert.equal(integrity.integrityStatus, "FAIL");
    assert.equal(integrity.failureCategory, "PROVIDER_EXECUTION_FAILURE");
  });

  it("COMPOSITION_FAILED stamp → STRUCTURAL_COMPLIANCE_FAILURE (never MODEL_QUALITY / PASS)", () => {
    const integrity = buildProductionExecutionIntegrity({
      executionId: "exec_composition_failed",
      correlationId: "corr_comp",
      service: "social-media",
      subtype: "instagram-post",
      outputKind: "image",
      capabilityId: "image.generate",
      providerIdentity: identity,
      providerSuccess: true,
      mediaArtifactIds: ["art_syncimg_comp_0"],
      metadata: {
        cdfCompositionOutcome: "COMPOSITION_FAILED",
        presentationEligibility: { status: "REJECTED" },
        providerJobSucceeded: true,
      },
      allowMissingArtifacts: true,
    });

    assert.equal(integrity.integrityStatus, "FAIL");
    assert.equal(integrity.failureCategory, "STRUCTURAL_COMPLIANCE_FAILURE");
    assert.notEqual(integrity.failureCategory, "PROVIDER_EXECUTION_FAILURE");

    const record = buildProductionPerformanceRecord({
      productionExecutionId: "exec_composition_failed",
      organizationId: "org_test",
      providerId: "provider.ideogram",
      modelId: "ideogram-3",
      capabilityId: "image.generate",
      service: "social-media",
      subtype: "instagram-post",
      outputKind: "image",
      strategyId: "strategy.baseline",
      strategyVersion: "1.0.0",
      knowledgeId: "knowledge.baseline",
      knowledgeVersion: "1.0.0",
      knowledgeFingerprint: "fp",
      validation: emptyValidation,
      preview: "preview",
      mediaArtifactIds: ["art_syncimg_comp_0"],
      latencyMs: 900,
      providerSuccess: true,
      structuralComplianceBlocked: true,
      createId: (prefix) => `${prefix}_comp`,
      nowIso: () => "2026-09-15T00:00:00.000Z",
    });
    assert.equal(record.benchmarkOutcome, "STRUCTURAL_COMPLIANCE_FAILURE");
    assert.notEqual(record.benchmarkOutcome, "MODEL_QUALITY_FAILURE");
    assert.notEqual(record.benchmarkOutcome, "PROVIDER_OPERATIONAL_FAILURE");
  });

  it("HTTP provider failure remains PROVIDER_OPERATIONAL_FAILURE on production record", () => {
    const record = buildProductionPerformanceRecord({
      productionExecutionId: "exec_http_fail",
      organizationId: "org_test",
      providerId: "provider.openai",
      modelId: "gpt-image-2",
      capabilityId: "image.generate",
      service: "social-media",
      subtype: "instagram-post",
      outputKind: "image",
      strategyId: "strategy.baseline",
      strategyVersion: "1.0.0",
      knowledgeId: "knowledge.baseline",
      knowledgeVersion: "1.0.0",
      knowledgeFingerprint: "fp",
      validation: emptyValidation,
      preview: "preview",
      mediaArtifactIds: [],
      latencyMs: 200,
      providerSuccess: false,
      createId: (prefix) => `${prefix}_http`,
      nowIso: () => "2026-09-15T00:00:00.000Z",
    });
    assert.equal(record.benchmarkOutcome, "PROVIDER_OPERATIONAL_FAILURE");
    assert.notEqual(record.benchmarkOutcome, "STRUCTURAL_COMPLIANCE_FAILURE");
    assert.notEqual(record.benchmarkOutcome, "MODEL_QUALITY_FAILURE");
  });

  it("production record outcome uses structural plane when blocked", () => {
    const record = buildProductionPerformanceRecord({
      productionExecutionId: "exec_59_1789410902308",
      organizationId: "org_test",
      providerId: "provider.ideogram",
      modelId: "ideogram-3",
      capabilityId: "image.generate",
      service: "social-media",
      subtype: "instagram-post",
      outputKind: "image",
      strategyId: "strategy.baseline",
      strategyVersion: "1.0.0",
      knowledgeId: "knowledge.baseline",
      knowledgeVersion: "1.0.0",
      knowledgeFingerprint: "fp",
      validation: emptyValidation,
      preview: "preview",
      mediaArtifactIds: ["art_syncimg_100_1789410925879_0"],
      latencyMs: 1200,
      providerSuccess: true,
      structuralComplianceBlocked: true,
      createId: (prefix) => `${prefix}_test`,
      nowIso: () => "2026-09-15T00:00:00.000Z",
    });

    assert.equal(record.benchmarkOutcome, "STRUCTURAL_COMPLIANCE_FAILURE");
    assert.notEqual(record.benchmarkOutcome, "PROVIDER_OPERATIONAL_FAILURE");
  });

  it("API status failed + media present still keeps provider plane SUCCESS for integrity", () => {
    // Mirrors rewrite: product status failed after structural block, but
    // providerJobSucceeded / media ids remain on metadata.
    const integrity = buildProductionExecutionIntegrity({
      executionId: "exec_59_poll_hydrate",
      correlationId: "corr_hydrate",
      service: "packaging",
      subtype: "front-pack",
      outputKind: "image",
      capabilityId: "image.generate",
      providerIdentity: identity,
      // Authoritative product plane may report false after rewrite —
      // integrity must still prefer structural category when stamps exist.
      providerSuccess: false,
      mediaArtifactIds: ["art_syncimg_hydrate_0"],
      metadata: {
        providerJobSucceeded: true,
        cdfStructuralComplianceStatus: "NON_COMPLIANT",
        cdfStructuralCompliance: {
          overallStructuralVerdict: "NON_COMPLIANT",
          blocksCanonicalCompletion: true,
          canonicalIngestDecision: "blocked",
        },
      },
      allowMissingArtifacts: true,
    });

    assert.equal(integrity.failureCategory, "STRUCTURAL_COMPLIANCE_FAILURE");
  });
});
