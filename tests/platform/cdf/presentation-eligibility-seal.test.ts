/**
 * Backend stamp + eligibility for canonical-blocked raw media.
 */

import assert from "node:assert/strict";
import {
  buildPresentationEligibilityStamp,
  metadataRequiresCanonicalProductCompletion,
} from "../../../src/platform/api/services/execution-cdf-canonical-ingest";
import {
  resolveGeneratedDeliverablePresentationEligibility,
  isPresentationEligibilityAvailable,
} from "../../../../Unagency-frontend/packages/api/src/domain/cdf/generated-deliverable-presentation-eligibility";

describe("presentation eligibility seal (canonical vs raw media)", () => {
  it("H — raw media + structural block stamps DIAGNOSTIC_PREVIEW (not AVAILABLE)", () => {
    const meta = {
      cdfSessionId: "cdf_seal_pres",
      cdfPhaseId: "output",
      cdfExecutionStrategy: "canonical",
      cdfArtifactKey: "social-media.output",
      cdfGenerationModality: "image",
      preferredProviderId: "provider.ideogram",
      preferredModelId: "ideogram-3",
    };
    assert.equal(metadataRequiresCanonicalProductCompletion(meta), true);

    const stamp = buildPresentationEligibilityStamp({
      executionId: "exec_59_1789410902308",
      executionStatus: "failed",
      workingMetadata: meta,
      resultData: {
        cdfCanonicalRejected: true,
        cdfFallbackReason: "structural_compliance_failed",
        cdfStructuralCompliance: {
          blockingDecision: true,
          canonicalIngestDecision: "blocked",
          overallStructuralVerdict: "NON_COMPLIANT",
          diagnosticAuthority: "observational",
        },
      },
      artifactIds: ["art_syncimg_100_1789410925879_0"],
      productCompletionBlocked: true,
      productCompletionBlockReason: "structural_compliance_failed",
    });

    const elig = stamp.presentationEligibility as {
      status: string;
      rawMediaPresent: boolean;
      canonicalArtifact: unknown;
    };
    assert.equal(elig.status, "DIAGNOSTIC_PREVIEW_AVAILABLE");
    assert.equal(elig.rawMediaPresent, true);
    assert.equal(elig.canonicalArtifact, null);
    assert.equal(isPresentationEligibilityAvailable(elig as never), false);
  });

  it("I — fanout leaves independent (A AVAILABLE / B FAILED / C DIAGNOSTIC)", () => {
    const a = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_a",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      cdfCanonicalCompletionEstablished: true,
      cdfArtifactId: "cdfart_a_1_output",
      cdfArtifactVersion: 1,
    });
    const b = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_b",
      executionStatus: "failed",
      requiresCanonicalCompletion: true,
    });
    const c = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_c",
      executionStatus: "failed",
      requiresCanonicalCompletion: true,
      productCompletionBlocked: true,
      productCompletionBlockReason: "structural_compliance_failed",
      cdfCanonicalRejected: true,
      rawMediaArtifactIds: ["art_syncimg_c_0"],
    });
    assert.equal(a.status, "AVAILABLE");
    assert.equal(b.status, "FAILED");
    assert.equal(c.status, "DIAGNOSTIC_PREVIEW_AVAILABLE");
    assert.equal(isPresentationEligibilityAvailable(a), true);
    assert.equal(isPresentationEligibilityAvailable(b), false);
    assert.equal(isPresentationEligibilityAvailable(c), false);
  });

  it("J — rehydration: diagnostic preview stays not AVAILABLE even with raw media ids", () => {
    const afterHydrate = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_59_1789410902308",
      executionStatus: "failed",
      requiresCanonicalCompletion: true,
      productCompletionBlocked: true,
      productCompletionBlockReason: "structural_compliance_failed",
      cdfCanonicalRejected: true,
      rawMediaArtifactIds: ["art_syncimg_100_1789410925879_0"],
    });
    assert.equal(afterHydrate.status, "DIAGNOSTIC_PREVIEW_AVAILABLE");
    assert.equal(isPresentationEligibilityAvailable(afterHydrate), false);

    const acceptedAfterHydrate =
      resolveGeneratedDeliverablePresentationEligibility({
        executionId: "exec_accepted",
        executionStatus: "succeeded",
        requiresCanonicalCompletion: true,
        cdfCanonicalCompletionEstablished: true,
        cdfArtifactId: "cdfart_ok_1_output",
        cdfArtifactVersion: 1,
        rawMediaArtifactIds: ["art_syncimg_ok_0"],
      });
    assert.equal(acceptedAfterHydrate.status, "AVAILABLE");
  });

  it("L — packaging_canonicalization_unsupported + raw art_* stamps DIAGNOSTIC_PREVIEW", () => {
    const meta = {
      cdfSessionId: "cdf_seal_pack",
      cdfPhaseId: "output",
      cdfExecutionStrategy: "canonical",
      cdfArtifactKey: "packaging.output",
      cdfGenerationModality: "image",
    };
    assert.equal(metadataRequiresCanonicalProductCompletion(meta), true);

    const stamp = buildPresentationEligibilityStamp({
      executionId: "exec_59_1789496405673",
      executionStatus: "failed",
      workingMetadata: meta,
      resultData: {
        cdfCanonicalRejected: true,
        cdfFallbackReason: "packaging_canonicalization_unsupported",
      },
      artifactIds: ["art_syncimg_84_1789496433569_0"],
      productCompletionBlocked: true,
      productCompletionBlockReason: "packaging_canonicalization_unsupported",
    });

    const elig = stamp.presentationEligibility as {
      status: string;
      rawMediaPresent: boolean;
      canonicalArtifact: unknown;
    };
    assert.equal(elig.status, "DIAGNOSTIC_PREVIEW_AVAILABLE");
    assert.equal(elig.rawMediaPresent, true);
    assert.equal(elig.canonicalArtifact, null);
    assert.equal(isPresentationEligibilityAvailable(elig as never), false);
  });

  it("M — terminal failed + raw without structural allowlist → DIAGNOSTIC_PREVIEW", () => {
    const elig = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_49_1789496404504",
      executionStatus: "failed",
      requiresCanonicalCompletion: true,
      productCompletionBlockReason: "packaging_canonicalization_unsupported",
      cdfFallbackReason: "packaging_canonicalization_unsupported",
      rawMediaArtifactIds: ["art_syncimg_81_1789496422059_0"],
    });
    assert.equal(elig.status, "DIAGNOSTIC_PREVIEW_AVAILABLE");
    assert.equal(isPresentationEligibilityAvailable(elig), false);
  });

});
