/**
 * Correction pass regressions:
 * 1) composition bridge exception/failure → soft warning, not hard block
 * 2) executionStatus=succeeded alone never proves canonical identity
 *
 * Generic — no service/provider/phase branches.
 */

import assert from "node:assert/strict";
import {
  resolveGeneratedDeliverablePresentationEligibility,
  presentationEligibilityFromExecutionSurfaces,
  isPresentationEligibilityAvailable,
} from "../../../../Unagency-frontend/packages/api/src/domain/cdf/generated-deliverable-presentation-eligibility";
import {
  projectFanoutGroupLifecycle,
  resolveFanoutLeafLifecycle,
} from "../../../../Unagency-frontend/packages/api/src/domain/cdf/fanout-group-lifecycle";
import { projectFanoutGroupOutcomeUx } from "../../../../Unagency-frontend/packages/api/src/domain/cdf/execution-outcome-ux";

describe("correction — composition soft vs media hard; canonical proof", () => {
  it("5/10 — provider succeeds + cdfart in metadata WITHOUT completion/bind → NOT AVAILABLE", () => {
    const elig = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_no_proof",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      cdfArtifactId: "cdfart_orphan_1",
      cdfArtifactVersion: 1,
      cdfArtifactKey: "social-media.output",
      // intentionally omit cdfCanonicalCompletionEstablished / Bound
      rawMediaArtifactIds: ["art_syncimg_1"],
      structuralStatus: "COMPLIANT",
    });
    assert.notEqual(elig.status, "AVAILABLE");
    assert.notEqual(elig.status, "AVAILABLE_WITH_WARNINGS");
    assert.equal(isPresentationEligibilityAvailable(elig), false);
    assert.equal(elig.status, "DIAGNOSTIC_PREVIEW_AVAILABLE");
  });

  it("10 — executionStatus=succeeded alone never establishes canonical identity", () => {
    const elig = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_status_only",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      cdfArtifactId: "cdfart_status_only",
      cdfArtifactVersion: 4,
      rawMediaArtifactIds: ["art_x"],
    });
    assert.equal(elig.canonicalArtifact, null);
    assert.equal(isPresentationEligibilityAvailable(elig), false);
  });

  it("6 — established + NON_COMPLIANT → AVAILABLE_WITH_WARNINGS", () => {
    const elig = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_nc",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      cdfCanonicalCompletionEstablished: true,
      cdfArtifactId: "cdfart_nc_1",
      cdfArtifactVersion: 2,
      structuralStatus: "NON_COMPLIANT",
    });
    assert.equal(elig.status, "AVAILABLE_WITH_WARNINGS");
    assert.equal(elig.canonicalArtifact?.artifactVersion, 2);
  });

  it("7 — bound + UNVERIFIABLE → AVAILABLE_WITH_WARNINGS", () => {
    const elig = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_uv",
      executionStatus: "failed", // terminal status irrelevant once bind proven
      requiresCanonicalCompletion: true,
      cdfGeneratedArtifactsBound: true,
      cdfArtifactId: "cdfart_uv_2",
      cdfArtifactVersion: 1,
      structuralStatus: "UNVERIFIABLE",
      compositionOutcome: "COMPOSITION_FAILED",
    });
    assert.equal(elig.status, "AVAILABLE_WITH_WARNINGS");
  });

  it("8 — established + COMPLIANT → AVAILABLE", () => {
    const elig = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_ok",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      cdfCanonicalCompletionEstablished: true,
      cdfGeneratedArtifactsBound: true,
      cdfArtifactId: "cdfart_ok_1",
      cdfArtifactVersion: 1,
      structuralStatus: "COMPLIANT",
    });
    assert.equal(elig.status, "AVAILABLE");
  });

  it("9 — raw art_* only → never AVAILABLE", () => {
    const elig = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_raw",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      rawMediaArtifactIds: ["art_only"],
      productCompletionBlocked: true,
      productCompletionBlockReason: "canonical_artifact_missing",
    });
    assert.equal(elig.status, "DIAGNOSTIC_PREVIEW_AVAILABLE");
    assert.equal(isPresentationEligibilityAvailable(elig), false);
  });

  it("1/2 conceptual — COMPOSITION_FAILED stamp + established X@V → warning usable", () => {
    const elig = presentationEligibilityFromExecutionSurfaces({
      executionId: "exec_comp",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      metadata: {
        cdfArtifactId: "cdfart_comp_1",
        cdfArtifactVersion: 1,
        cdfCanonicalCompletionEstablished: true,
        cdfGeneratedArtifactsBound: true,
        cdfCompositionOutcome: "COMPOSITION_FAILED",
        cdfCompositionFailureReason: "composition_bridge_exception",
        cdfStructuralComplianceStatus: "UNVERIFIABLE",
      },
      artifactIds: ["art_syncimg_1"],
    });
    assert.equal(elig.status, "AVAILABLE_WITH_WARNINGS");
    assert.equal(isPresentationEligibilityAvailable(elig), true);
  });

  it("3 conceptual — missing artifact / vault failure remains non-usable", () => {
    const elig = presentationEligibilityFromExecutionSurfaces({
      executionId: "exec_vault",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      metadata: {
        cdfFallbackReason: "vault_promote_failed",
        cdfCanonicalRejected: true,
      },
      artifactIds: ["art_only"],
    });
    assert.equal(isPresentationEligibilityAvailable(elig), false);
  });

  it("4 conceptual — bind failure without established → not AVAILABLE", () => {
    const elig = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_bind",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      productCompletionBlocked: true,
      productCompletionBlockReason: "m9c_bind_durability_failed",
      cdfArtifactId: "cdfart_unbound",
      cdfArtifactVersion: 1,
      // no established / bound
      rawMediaArtifactIds: ["art_x"],
    });
    assert.equal(isPresentationEligibilityAvailable(elig), false);
  });

  it("11 — exact X@V survives warning presentation", () => {
    const elig = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_xv",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      cdfCanonicalCompletionEstablished: true,
      cdfArtifactId: "cdfart_exact_7",
      cdfArtifactVersion: 7,
      cdfArtifactKey: "social-media.output",
      structuralStatus: "NON_COMPLIANT",
    });
    assert.equal(elig.canonicalArtifact?.artifactId, "cdfart_exact_7");
    assert.equal(elig.canonicalArtifact?.artifactVersion, 7);
    assert.equal(elig.canonicalArtifact?.artifactKey, "social-media.output");
  });

  it("12 — fanout leaf identities stay isolated (no shared X@V)", () => {
    const gemini = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_gemini",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      cdfCanonicalCompletionEstablished: true,
      cdfArtifactId: "cdfart_gemini_1",
      cdfArtifactVersion: 1,
      structuralStatus: "NON_COMPLIANT",
    });
    const ideogram = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_ideo",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      cdfCanonicalCompletionEstablished: true,
      cdfArtifactId: "cdfart_ideo_1",
      cdfArtifactVersion: 1,
      structuralStatus: "UNVERIFIABLE",
    });
    const openai = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_openai",
      executionStatus: "failed",
      requiresCanonicalCompletion: true,
    });
    assert.notEqual(
      gemini.canonicalArtifact?.artifactId,
      ideogram.canonicalArtifact?.artifactId,
    );
    const states = [
      resolveFanoutLeafLifecycle({
        executionStatus: "succeeded",
        eligibility: gemini,
        settled: true,
      }),
      resolveFanoutLeafLifecycle({
        executionStatus: "succeeded",
        eligibility: ideogram,
        settled: true,
      }),
      resolveFanoutLeafLifecycle({
        executionStatus: "failed",
        eligibility: openai,
        settled: true,
      }),
    ];
    const group = projectFanoutGroupLifecycle(states);
    assert.equal(group.availableCount, 2);
    assert.equal(group.hasUsableResult, true);
  });

  it("13 — hydration preserves AVAILABLE_WITH_WARNINGS via established stamps", () => {
    const elig = presentationEligibilityFromExecutionSurfaces({
      executionId: "exec_hyd",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      resultData: {
        cdfArtifactId: "cdfart_hyd_3",
        cdfArtifactVersion: 3,
        cdfCanonicalCompletionEstablished: true,
        cdfStructuralComplianceStatus: "NON_COMPLIANT",
      },
    });
    assert.equal(elig.status, "AVAILABLE_WITH_WARNINGS");
    assert.equal(elig.canonicalArtifact?.artifactVersion, 3);
  });

  it("14 — zero usable canonical leaves → no usable creative message", () => {
    const fail = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "e1",
      executionStatus: "failed",
      requiresCanonicalCompletion: true,
    });
    const states = [
      resolveFanoutLeafLifecycle({
        executionStatus: "failed",
        eligibility: fail,
        settled: true,
      }),
      resolveFanoutLeafLifecycle({
        executionStatus: "failed",
        eligibility: fail,
        settled: true,
      }),
    ];
    const group = projectFanoutGroupLifecycle(states);
    assert.equal(group.hasUsableResult, false);
    const ux = projectFanoutGroupOutcomeUx([
      { ok: false, eligibility: fail, errorMessage: "provider timeout" },
      { ok: false, eligibility: fail, errorMessage: "provider timeout" },
    ]);
    assert.match(ux.userMessage, /No usable creative/i);
  });

  it("15 — one warning leaf → not 'No usable creative'", () => {
    const warn = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "e_warn",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      cdfCanonicalCompletionEstablished: true,
      cdfArtifactId: "cdfart_one",
      cdfArtifactVersion: 1,
      structuralStatus: "NON_COMPLIANT",
    });
    const fail = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "e_fail",
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
        executionStatus: "failed",
        eligibility: fail,
        settled: true,
      }),
    ];
    const group = projectFanoutGroupLifecycle(states);
    assert.equal(group.hasUsableResult, true);
    const ux = projectFanoutGroupOutcomeUx([
      { ok: true, available: true, eligibility: warn },
      { ok: false, eligibility: fail, errorMessage: "provider timeout" },
    ]);
    assert.doesNotMatch(ux.userMessage, /No usable creative/i);
  });
});
