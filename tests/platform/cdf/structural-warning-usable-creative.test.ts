/**
 * Structural verification vs usable creative.
 *
 * Blocking acceptance (blocksCanonicalCompletion / productCompletionBlocked):
 *   → DIAGNOSTIC_PREVIEW_AVAILABLE only (no AVAILABLE*).
 * Non-blocking structural warnings WITH accepted ArtifactVersion:
 *   → AVAILABLE_WITH_WARNINGS.
 * Generic framework tests — no service/provider/phase branches.
 */

import assert from "node:assert/strict";
import {
  resolveGeneratedDeliverablePresentationEligibility,
  presentationEligibilityFromExecutionSurfaces,
  isPresentationEligibilityAvailable,
  isPresentationEligibilityFullyCompliant,
  isPresentationEligibilityWithWarnings,
  classifyImageDeliverableOutcomePlanes,
} from "../../../../Unagency-frontend/packages/api/src/domain/cdf/generated-deliverable-presentation-eligibility";
import {
  resolveExecutionOutcomeUxCategory,
  projectExecutionOutcomeUx,
} from "../../../../Unagency-frontend/packages/api/src/domain/cdf/execution-outcome-ux";
import {
  resolveFanoutLeafLifecycle,
  projectFanoutGroupLifecycle,
  isFanoutLeafLifecycleAvailable,
  fanoutLeafMayPresentMedia,
} from "../../../../Unagency-frontend/packages/api/src/domain/cdf/fanout-group-lifecycle";

describe("structural warning ≠ suppress usable creative", () => {
  it("1 — provider success + structural COMPLIANT → AVAILABLE", () => {
    const elig = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_ok",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      cdfCanonicalCompletionEstablished: true,
      cdfGeneratedArtifactsBound: true,
      cdfArtifactId: "cdfart_ok_1",
      cdfArtifactVersion: 1,
      cdfArtifactKey: "social-media.output",
      structuralStatus: "COMPLIANT",
      rawMediaArtifactIds: ["art_syncimg_1"],
    });
    assert.equal(elig.status, "AVAILABLE");
    assert.equal(isPresentationEligibilityAvailable(elig), true);
    assert.equal(isPresentationEligibilityFullyCompliant(elig), true);
    assert.equal(resolveExecutionOutcomeUxCategory(elig), "AVAILABLE");
  });

  it("2 — blocking NON_COMPLIANT without accepted AV → DIAGNOSTIC_PREVIEW", () => {
    const elig = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_warn",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      structuralStatus: "NON_COMPLIANT",
      blocksCanonicalCompletion: true,
      productCompletionBlocked: true,
      productCompletionBlockReason: "structural_compliance_failed",
      rawMediaArtifactIds: ["art_syncimg_1"],
    });
    assert.equal(elig.status, "DIAGNOSTIC_PREVIEW_AVAILABLE");
    assert.equal(isPresentationEligibilityAvailable(elig), false);
    assert.equal(elig.canonicalArtifact, null);
    assert.equal(
      resolveExecutionOutcomeUxCategory(elig),
      "STRUCTURAL_COMPLIANCE_FAILURE",
    );
  });

  it("2b — non-blocking structural warning WITH accepted AV → AVAILABLE_WITH_WARNINGS", () => {
    const elig = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_warn_soft",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      cdfCanonicalCompletionEstablished: true,
      cdfGeneratedArtifactsBound: true,
      cdfArtifactId: "cdfart_warn_1",
      cdfArtifactVersion: 2,
      cdfArtifactKey: "social-media.output",
      structuralStatus: "NON_COMPLIANT",
      blocksCanonicalCompletion: false,
      rawMediaArtifactIds: ["art_syncimg_1"],
    });
    assert.equal(elig.status, "AVAILABLE_WITH_WARNINGS");
    assert.equal(isPresentationEligibilityAvailable(elig), true);
    assert.equal(isPresentationEligibilityFullyCompliant(elig), false);
    assert.equal(isPresentationEligibilityWithWarnings(elig.status), true);
    assert.equal(elig.canonicalArtifact?.artifactId, "cdfart_warn_1");
    assert.equal(elig.canonicalArtifact?.artifactVersion, 2);
  });

  it("3 — provider success + structural UNVERIFIABLE (accepted AV, non-blocking) → AVAILABLE_WITH_WARNINGS", () => {
    const elig = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_uv",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      cdfCanonicalCompletionEstablished: true,
      cdfArtifactId: "cdfart_uv_1",
      cdfArtifactVersion: 1,
      structuralStatus: "UNVERIFIABLE",
      blocksCanonicalCompletion: false,
      rawMediaArtifactIds: ["art_x"],
    });
    assert.equal(elig.status, "AVAILABLE_WITH_WARNINGS");
    assert.equal(
      elig.outcomePlanes?.structuralVerification,
      "UNVERIFIABLE",
    );
  });

  it("4 — provider failure → FAILED", () => {
    const elig = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_fail",
      executionStatus: "failed",
      requiresCanonicalCompletion: true,
      rawMediaArtifactIds: [],
      productCompletionBlockReason: "provider_timeout",
    });
    assert.equal(elig.status, "FAILED");
    assert.equal(isPresentationEligibilityAvailable(elig), false);
  });

  it("5 — provider success + missing artifact → FAILED / DIAGNOSTIC", () => {
    const elig = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_noart",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      productCompletionBlocked: true,
      productCompletionBlockReason: "canonical_artifact_missing",
    });
    assert.ok(
      elig.status === "FAILED" || elig.status === "REJECTED",
      elig.status,
    );
    assert.equal(isPresentationEligibilityAvailable(elig), false);
  });

  it("6/7 — persistence / ArtifactVersion failure stays hard blocked", () => {
    const elig = presentationEligibilityFromExecutionSurfaces({
      executionId: "exec_persist",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      metadata: {
        cdfFallbackReason: "vault_promote_failed",
        cdfCanonicalRejected: true,
      },
      artifactIds: ["art_only"],
    });
    assert.equal(isPresentationEligibilityAvailable(elig), false);
    assert.ok(
      elig.status === "DIAGNOSTIC_PREVIEW_AVAILABLE" ||
        elig.status === "REJECTED" ||
        elig.status === "FAILED",
    );
  });

  it("8 — exact X@V survives non-blocking warning state", () => {
    const elig = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_xv",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      cdfCanonicalCompletionEstablished: true,
      cdfArtifactId: "cdfart_exact_9",
      cdfArtifactVersion: 9,
      cdfArtifactKey: "packaging.front-pack",
      structuralStatus: "NON_COMPLIANT",
      blocksCanonicalCompletion: false,
    });
    assert.equal(elig.canonicalArtifact?.artifactId, "cdfart_exact_9");
    assert.equal(elig.canonicalArtifact?.artifactVersion, 9);
    assert.equal(elig.canonicalArtifact?.artifactKey, "packaging.front-pack");
    assert.equal(elig.status, "AVAILABLE_WITH_WARNINGS");
  });

  it("9 — warning creative is selectable (usable)", () => {
    const elig = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_sel",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      cdfCanonicalCompletionEstablished: true,
      cdfArtifactId: "cdfart_sel_1",
      cdfArtifactVersion: 1,
      structuralStatus: "NON_COMPLIANT",
    });
    assert.equal(isPresentationEligibilityAvailable(elig), true);
    const life = resolveFanoutLeafLifecycle({
      executionStatus: "succeeded",
      eligibility: elig,
      settled: true,
    });
    assert.equal(isFanoutLeafLifecycleAvailable(life), true);
    assert.equal(fanoutLeafMayPresentMedia(life), true);
  });

  it("10 — structural diagnostics remain on outcome planes (not rewritten COMPLIANT)", () => {
    const planes = classifyImageDeliverableOutcomePlanes({
      presentationStatus: "AVAILABLE_WITH_WARNINGS",
      rawMediaPresent: true,
      structuralStatus: "NON_COMPLIANT",
      hasCanonicalArtifact: true,
      cdfCanonicalCompletionEstablished: true,
    });
    assert.equal(planes.structuralVerification, "STRUCTURAL_NON_COMPLIANCE");
    assert.notEqual(planes.structuralVerification, "STRUCTURAL_COMPLIANT");
    assert.equal(planes.canonicalCompletion, "CANONICAL_ACCEPTED");
    assert.equal(
      planes.presentation,
      "PRESENTATION_AVAILABLE_WITH_WARNINGS",
    );
  });

  it("11 — restart/hydration: COMPOSITION_FAILED warning with accepted AV → AVAILABLE_WITH_WARNINGS", () => {
    const elig = presentationEligibilityFromExecutionSurfaces({
      executionId: "exec_hydrate",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      metadata: {
        cdfArtifactId: "cdfart_hyd_1",
        cdfArtifactVersion: 3,
        cdfCanonicalCompletionEstablished: true,
        cdfGeneratedArtifactsBound: true,
        cdfStructuralComplianceStatus: "NON_COMPLIANT",
        cdfCompositionOutcome: "COMPOSITION_FAILED",
        cdfCompositionFailureReason: "missing_authoritative_brand_mark_bytes",
        // Non-blocking: no productCompletionBlocked / cdfCanonicalRejected
      },
      artifactIds: ["art_syncimg_hyd"],
    });
    assert.equal(elig.status, "AVAILABLE_WITH_WARNINGS");
    assert.equal(elig.canonicalArtifact?.artifactVersion, 3);
  });

  it("11b — hydrate with productCompletionBlocked → DIAGNOSTIC only", () => {
    const elig = presentationEligibilityFromExecutionSurfaces({
      executionId: "exec_hydrate_block",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      metadata: {
        cdfStructuralComplianceStatus: "NON_COMPLIANT",
        cdfCompositionOutcome: "COMPOSITION_FAILED",
        productCompletionBlocked: true,
        cdfCanonicalRejected: true,
        cdfFallbackReason: "structural_compliance_failed",
      },
      artifactIds: ["art_syncimg_hyd"],
    });
    assert.equal(elig.status, "DIAGNOSTIC_PREVIEW_AVAILABLE");
    assert.equal(elig.canonicalArtifact, null);
  });

  it("12/13 — fanout leaf A warning does not affect leaf B; failed leaf independent", () => {
    const warn = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_a",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      cdfCanonicalCompletionEstablished: true,
      cdfArtifactId: "cdfart_a",
      cdfArtifactVersion: 1,
      structuralStatus: "NON_COMPLIANT",
    });
    const ok = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_b",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      cdfCanonicalCompletionEstablished: true,
      cdfArtifactId: "cdfart_b",
      cdfArtifactVersion: 1,
      structuralStatus: "COMPLIANT",
    });
    const fail = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_c",
      executionStatus: "failed",
      requiresCanonicalCompletion: true,
    });
    const states = [
      resolveFanoutLeafLifecycle({
        executionStatus: "succeeded",
        eligibility: warn,
        settled: true,
      }),
      resolveFanoutLeafLifecycle({
        executionStatus: "succeeded",
        eligibility: ok,
        settled: true,
      }),
      resolveFanoutLeafLifecycle({
        executionStatus: "failed",
        eligibility: fail,
        settled: true,
      }),
    ];
    const group = projectFanoutGroupLifecycle(states);
    assert.equal(group.availableCount, 2);
    assert.equal(group.hasUsableResult, true);
    assert.equal(isFanoutLeafLifecycleAvailable(states[0]!), true);
    assert.equal(isFanoutLeafLifecycleAvailable(states[1]!), true);
    assert.equal(isFanoutLeafLifecycleAvailable(states[2]!), false);
  });

  it("14/15 — raw art_* never AVAILABLE / never canonical", () => {
    const elig = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_raw",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      rawMediaArtifactIds: ["art_syncimg_only"],
      structuralStatus: "NON_COMPLIANT",
      productCompletionBlocked: true,
      productCompletionBlockReason: "structural_compliance_failed",
    });
    assert.notEqual(elig.status, "AVAILABLE");
    assert.notEqual(elig.status, "AVAILABLE_WITH_WARNINGS");
    assert.equal(elig.canonicalArtifact, null);
    assert.equal(elig.status, "DIAGNOSTIC_PREVIEW_AVAILABLE");
  });

  it("16/17 — NON_COMPLIANT / UNVERIFIABLE never rewritten as COMPLIANT", () => {
    for (const status of ["NON_COMPLIANT", "UNVERIFIABLE"] as const) {
      const planes = classifyImageDeliverableOutcomePlanes({
        presentationStatus: "AVAILABLE_WITH_WARNINGS",
        rawMediaPresent: true,
        structuralStatus: status,
        hasCanonicalArtifact: true,
      });
      assert.notEqual(planes.structuralVerification, "STRUCTURAL_COMPLIANT");
    }
  });

  it("18 — missing brand-mark bytes → warning when canonical exists", () => {
    const ux = projectExecutionOutcomeUx({
      eligibility: resolveGeneratedDeliverablePresentationEligibility({
        executionId: "exec_brand",
        executionStatus: "succeeded",
        requiresCanonicalCompletion: true,
        cdfCanonicalCompletionEstablished: true,
        cdfArtifactId: "cdfart_brand_1",
        cdfArtifactVersion: 1,
        structuralStatus: "UNVERIFIABLE",
        compositionOutcome: "COMPOSITION_FAILED",
      }),
      metadata: {
        cdfCanonicalCompletionEstablished: true,
        cdfCompositionOutcome: "COMPOSITION_FAILED",
        cdfCompositionFailureReason: "missing_authoritative_brand_mark_bytes",
      },
    });
    assert.equal(ux.category, "AVAILABLE_WITH_WARNINGS");
    assert.match(ux.userMessage, /Structural check:\s*needs review/i);
  });

  it("19 — provider failure remains hard failure", () => {
    const ux = projectExecutionOutcomeUx({
      eligibility: resolveGeneratedDeliverablePresentationEligibility({
        executionId: "exec_openai_fail",
        executionStatus: "failed",
        requiresCanonicalCompletion: true,
      }),
      errorMessage: "provider timeout",
      metadata: {},
    });
    assert.notEqual(ux.category, "AVAILABLE_WITH_WARNINGS");
    assert.notEqual(ux.category, "AVAILABLE");
  });

  it("20 — no service/provider/model/phase branches in eligibility resolver signature", () => {
    const src = resolveGeneratedDeliverablePresentationEligibility.toString();
    assert.equal(src.includes("instagram"), false);
    assert.equal(src.includes("social-media"), false);
  });
});
