/**
 * Durable outcome-evidence preservation.
 *
 * Bug (live exec_73 vs exec_56, both logo-system):
 *   exec_73: poll_hydrate ran structural verification, wrote full evidence.
 *            No later reingest pass overwrote it → AVAILABLE_WITH_WARNINGS.
 *   exec_56: poll_hydrate ran structural verification, wrote full evidence.
 *            dispatch_finalize reingest then ran, took the idempotent-replay
 *            shortcut (identity only, no fresh evidence), and its freshly
 *            rebuilt result payload — which never inherited the prior
 *            result.data — silently replaced the durable record. Evidence
 *            lost → AVAILABLE (wrong).
 *
 * Fixtures below mirror the exact `result.data` shape persisted for those
 * two live executions (cdfart_mudz…_3_logo-logo-system@1).
 *
 * These tests exercise the shared merge primitive directly (not the full
 * ExecutionApiService/execution-create-dispatch scaffolding), because the
 * primitive is a pure function of (existing, incoming) — writer *order*
 * cannot matter to a pure function, and encoding that fact as executable
 * proof (rather than assuming it) is exactly what "both orderings" below do.
 */

import assert from "node:assert/strict";
import {
  STRUCTURAL_EVIDENCE_FIELD_KEYS,
  extractCanonicalArtifactIdentity,
  sameCanonicalArtifactIdentity,
  mergePreservingEstablishedOutcomeEvidence,
  preserveEstablishedOutcomeEvidenceOnResultData,
} from "../../../src/platform/cdf/generation-validation/outcome-evidence-preservation";
import { InMemoryExecutionRepository } from "../../../src/platform/infrastructure/durability/repositories/in-memory-execution-persistence";
import { presentationEligibilityFromExecutionSurfaces } from "../../../../Unagency-frontend/packages/api/src/domain/cdf/generated-deliverable-presentation-eligibility";
import type { ExecutionResource, ExecutionResultPayload } from "../../../src/platform/api/contracts";

const ARTIFACT_ID = "cdfart_mudzu8z6_3_logo-logo-system";
const ARTIFACT_VERSION = 1;

const CANONICAL_IDENTITY = {
  cdfArtifactId: ARTIFACT_ID,
  cdfArtifactVersion: ARTIFACT_VERSION,
  cdfArtifactKey: "logo.logo-system",
  cdfRuntimePath: "canonical",
  canonicalPath: true,
  cdfDownloadEligible: true,
  cdfCanonicalCompletionEstablished: true,
  cdfIdempotentCompletionReplay: true,
};

function structuralEvidence(status: "NON_COMPLIANT" | "UNVERIFIABLE" | "COMPLIANT") {
  return {
    cdfStructuralComplianceStatus: status,
    cdfStructuralCompliance: {
      status,
      overallStructuralVerdict: status,
      failedRequirements: status === "COMPLIANT" ? [] : ["rendered_text_match"],
      blocksCanonicalCompletion: status === "NON_COMPLIANT",
      blockingDecision: status === "NON_COMPLIANT",
      canonicalIngestDecision: status === "NON_COMPLIANT" ? "blocked" : "eligible",
      diagnosticAuthority: "observational",
    },
  };
}

/** Pass 1: structural verification actually ran (poll_hydrate, exec_73/56 shape). */
function fullEvidencePass(status: "NON_COMPLIANT" | "UNVERIFIABLE" | "COMPLIANT") {
  return { ...CANONICAL_IDENTITY, ...structuralEvidence(status) };
}

/** Pass 2: idempotent-replay canonical ingest — identity only, no fresh evidence. */
function replayOnlyPass() {
  return { ...CANONICAL_IDENTITY };
}

describe("field ownership / identity helpers", () => {
  it("extracts canonical identity only from a well-formed cdfart_* + integer version", () => {
    assert.deepEqual(extractCanonicalArtifactIdentity(fullEvidencePass("COMPLIANT")), {
      artifactId: ARTIFACT_ID,
      artifactVersion: ARTIFACT_VERSION,
    });
    assert.equal(extractCanonicalArtifactIdentity(null), null);
    assert.equal(extractCanonicalArtifactIdentity({}), null);
    assert.equal(
      extractCanonicalArtifactIdentity({ cdfArtifactId: "art_syncimg_1", cdfArtifactVersion: 1 }),
      null,
    );
    assert.equal(
      extractCanonicalArtifactIdentity({ cdfArtifactId: ARTIFACT_ID, cdfArtifactVersion: "1" }),
      null,
    );
  });

  it("sameCanonicalArtifactIdentity requires exact id and version match", () => {
    const a = { artifactId: ARTIFACT_ID, artifactVersion: 1 };
    assert.equal(sameCanonicalArtifactIdentity(a, { ...a }), true);
    assert.equal(sameCanonicalArtifactIdentity(a, { ...a, artifactVersion: 2 }), false);
    assert.equal(sameCanonicalArtifactIdentity(a, { ...a, artifactId: "cdfart_other" }), false);
    assert.equal(sameCanonicalArtifactIdentity(null, a), false);
  });
});

describe("mergePreservingEstablishedOutcomeEvidence — 1–3: each structural status survives replay", () => {
  for (const status of ["NON_COMPLIANT", "UNVERIFIABLE", "COMPLIANT"] as const) {
    it(`${status} survives an identity-only canonical replay`, () => {
      const merged = mergePreservingEstablishedOutcomeEvidence({
        existing: fullEvidencePass(status),
        incoming: replayOnlyPass(),
      });
      assert.equal(merged.cdfStructuralComplianceStatus, status);
      assert.deepEqual(merged.cdfStructuralCompliance, structuralEvidence(status).cdfStructuralCompliance);
      // Canonical identity is unaffected either way.
      assert.equal(merged.cdfArtifactId, ARTIFACT_ID);
      assert.equal(merged.cdfArtifactVersion, ARTIFACT_VERSION);
    });
  }

  it("a fresher explicit value on the incoming write always wins (never regressed)", () => {
    const merged = mergePreservingEstablishedOutcomeEvidence({
      existing: fullEvidencePass("NON_COMPLIANT"),
      incoming: { ...replayOnlyPass(), ...structuralEvidence("COMPLIANT") },
    });
    assert.equal(merged.cdfStructuralComplianceStatus, "COMPLIANT");
  });

  it("no existing state → incoming returned unchanged (first pass, nothing to preserve)", () => {
    const incoming = fullEvidencePass("UNVERIFIABLE");
    assert.equal(mergePreservingEstablishedOutcomeEvidence({ existing: null, incoming }), incoming);
  });

  it("is a no-op object identity when nothing needed backfilling", () => {
    const incoming = fullEvidencePass("COMPLIANT");
    const merged = mergePreservingEstablishedOutcomeEvidence({
      existing: fullEvidencePass("NON_COMPLIANT"),
      incoming,
    });
    assert.equal(merged, incoming);
  });
});

describe("9/10 — hard failures remain hard (no evidence leaks onto a non-matching or absent identity)", () => {
  it("incoming with no canonical identity (rejected/hard failure) never inherits prior evidence", () => {
    const merged = mergePreservingEstablishedOutcomeEvidence({
      existing: fullEvidencePass("NON_COMPLIANT"),
      incoming: { cdfCanonicalRejected: true, cdfFallbackReason: "canonical_artifact_missing" },
    });
    assert.equal(merged.cdfStructuralComplianceStatus, undefined);
    assert.equal(merged.cdfCanonicalRejected, true);
  });

  it("incoming identifying a DIFFERENT artifact/version never inherits prior evidence", () => {
    const merged = mergePreservingEstablishedOutcomeEvidence({
      existing: fullEvidencePass("NON_COMPLIANT"),
      incoming: { ...replayOnlyPass(), cdfArtifactVersion: 2 },
    });
    assert.equal(merged.cdfStructuralComplianceStatus, undefined);
    assert.equal(merged.cdfArtifactVersion, 2);
  });

  it("provider failure (no result.data at all) is untouched by the preserve helper", () => {
    const existingResult: ExecutionResultPayload = { kind: "structured", data: fullEvidencePass("NON_COMPLIANT") };
    const incomingResult: ExecutionResultPayload = { kind: "text", text: "failed at provider_runtime: fetch failed" };
    const merged = preserveEstablishedOutcomeEvidenceOnResultData(existingResult, incomingResult);
    assert.equal(merged, incomingResult);
    assert.equal(merged.data, undefined);
  });
});

describe("4/5 — both writer orderings converge to the same durable state", () => {
  const orderings: Array<["poll_hydrate_first" | "dispatch_finalize_first", () => [Record<string, unknown>, Record<string, unknown>]]> = [
    ["poll_hydrate_first", () => [fullEvidencePass("NON_COMPLIANT"), replayOnlyPass()]],
    ["dispatch_finalize_first", () => [replayOnlyPass(), fullEvidencePass("NON_COMPLIANT")]],
  ];

  it.each(orderings)("%s: sequential writes converge to full evidence + exact X@V", (_label, buildPasses) => {
    const [pass1, pass2] = buildPasses();
    // Pass 1 persists first (whichever writer ran the structural check).
    let durable: Record<string, unknown> = pass1;
    // Pass 2 (the other writer) computes its own fresh payload, then merges
    // against whatever is currently durable before persisting — exactly what
    // both patched call sites do.
    durable = mergePreservingEstablishedOutcomeEvidence({ existing: durable, incoming: pass2 });

    assert.equal(durable.cdfStructuralComplianceStatus, "NON_COMPLIANT");
    assert.equal(durable.cdfArtifactId, ARTIFACT_ID);
    assert.equal(durable.cdfArtifactVersion, ARTIFACT_VERSION);
  });
});

describe("6 — concurrent / last-writer simulation via the real InMemoryExecutionRepository", () => {
  it("a replay write persisted after a full-evidence write preserves evidence in the durable store", async () => {
    const repo = new InMemoryExecutionRepository();
    const base: ExecutionResource = {
      executionId: "exec_race_1",
      status: "succeeded",
      organizationId: "org",
      correlationId: "corr",
      createdAt: "t",
      updatedAt: "t",
      promptPreview: "p",
    };

    // Writer A (poll_hydrate): structural check ran, writes full evidence.
    await repo.save({ ...base, result: { kind: "structured", data: fullEvidencePass("UNVERIFIABLE") } });

    // Writer B (dispatch_finalize reingest): reads current durable state,
    // computes a fresh (replay-only) payload, merges, persists.
    const existing = await repo.get("exec_race_1");
    const freshFromB: ExecutionResultPayload = { kind: "structured", data: replayOnlyPass() };
    const merged = preserveEstablishedOutcomeEvidenceOnResultData(existing?.result, freshFromB);
    await repo.update({ ...(existing as ExecutionResource), result: merged });

    const final = await repo.get("exec_race_1");
    const data = final?.result?.data as Record<string, unknown>;
    assert.equal(data.cdfStructuralComplianceStatus, "UNVERIFIABLE");
    assert.equal(data.cdfArtifactId, ARTIFACT_ID);
  });

  it("the reverse persist order produces the identical final durable state", async () => {
    const repo = new InMemoryExecutionRepository();
    const base: ExecutionResource = {
      executionId: "exec_race_2",
      status: "succeeded",
      organizationId: "org",
      correlationId: "corr",
      createdAt: "t",
      updatedAt: "t",
      promptPreview: "p",
    };

    // Writer A (dispatch_finalize) happens to persist first this time, but it
    // is the one WITHOUT fresh evidence (nothing established yet to preserve).
    await repo.save({ ...base, result: { kind: "structured", data: replayOnlyPass() } });

    // Writer B (poll_hydrate) ran the actual structural check; merges against
    // whatever is durable (identity-only) and persists the real evidence.
    const existing = await repo.get("exec_race_2");
    const freshFromB: ExecutionResultPayload = { kind: "structured", data: fullEvidencePass("UNVERIFIABLE") };
    const merged = preserveEstablishedOutcomeEvidenceOnResultData(existing?.result, freshFromB);
    await repo.update({ ...(existing as ExecutionResource), result: merged });

    const final = await repo.get("exec_race_2");
    const data = final?.result?.data as Record<string, unknown>;
    assert.equal(data.cdfStructuralComplianceStatus, "UNVERIFIABLE");
    assert.equal(data.cdfArtifactId, ARTIFACT_ID);
  });
});

describe("7 — multiple canonical replays are idempotent", () => {
  it("replaying 3 times never duplicates, deletes, or drifts the evidence", () => {
    let durable: Record<string, unknown> = fullEvidencePass("NON_COMPLIANT");
    for (let i = 0; i < 3; i++) {
      durable = mergePreservingEstablishedOutcomeEvidence({
        existing: durable,
        incoming: replayOnlyPass(),
      });
    }
    assert.equal(durable.cdfStructuralComplianceStatus, "NON_COMPLIANT");
    assert.deepEqual(
      Object.keys(durable).filter((k) =>
        (STRUCTURAL_EVIDENCE_FIELD_KEYS as readonly string[]).includes(k),
      ).length,
      2, // cdfStructuralComplianceStatus + cdfStructuralCompliance — no duplication
    );
  });
});

describe("8 — exact X@V is preserved through the merge, never substituted", () => {
  it("a stale existing pin at a DIFFERENT version never attaches to the new one", () => {
    const merged = mergePreservingEstablishedOutcomeEvidence({
      existing: { ...fullEvidencePass("COMPLIANT"), cdfArtifactVersion: 1 },
      incoming: { ...replayOnlyPass(), cdfArtifactVersion: 2 },
    });
    assert.equal(merged.cdfStructuralComplianceStatus, undefined);
    assert.equal(merged.cdfArtifactVersion, 2);
  });

  it("a stale existing pin for a DIFFERENT artifact key/id never attaches", () => {
    const merged = mergePreservingEstablishedOutcomeEvidence({
      existing: fullEvidencePass("COMPLIANT"),
      incoming: { ...replayOnlyPass(), cdfArtifactId: "cdfart_other_9_x" },
    });
    assert.equal(merged.cdfStructuralComplianceStatus, undefined);
  });
});

describe("11a — hard canonical rejection still blocks after preservation", () => {
  it("productCompletionBlocked incoming keeps blocking regardless of prior evidence", () => {
    const merged = mergePreservingEstablishedOutcomeEvidence({
      existing: fullEvidencePass("NON_COMPLIANT"),
      incoming: {
        cdfCanonicalRejected: true,
        productCompletionBlocked: true,
        cdfFallbackReason: "structural_compliance_verification_exception",
      },
    });
    assert.equal(merged.productCompletionBlocked, true);
    assert.equal(merged.cdfCanonicalCompletionEstablished, undefined);
  });
});

describe("12 — frontend projection reflects preserved evidence (never regresses AVAILABLE_WITH_WARNINGS → AVAILABLE)", () => {
  for (const status of ["NON_COMPLIANT", "UNVERIFIABLE"] as const) {
    it(`${status}: recomputed presentation eligibility stays AVAILABLE_WITH_WARNINGS after replay`, () => {
      const merged = mergePreservingEstablishedOutcomeEvidence({
        existing: fullEvidencePass(status),
        incoming: replayOnlyPass(),
      }) as Record<string, unknown>;
      const eligibility = presentationEligibilityFromExecutionSurfaces({
        executionId: "exec_x",
        executionStatus: "succeeded",
        requiresCanonicalCompletion: true,
        resultData: merged,
        metadata: {},
        artifactIds: ["art_syncimg_x"],
      });
      assert.equal(eligibility.status, "AVAILABLE_WITH_WARNINGS");
      assert.deepEqual(eligibility.canonicalArtifact, {
        artifactId: ARTIFACT_ID,
        artifactVersion: ARTIFACT_VERSION,
        artifactKey: "logo.logo-system",
      });
    });
  }

  it("COMPLIANT stays AVAILABLE (not incorrectly demoted to warnings)", () => {
    const merged = mergePreservingEstablishedOutcomeEvidence({
      existing: fullEvidencePass("COMPLIANT"),
      incoming: replayOnlyPass(),
    }) as Record<string, unknown>;
    const eligibility = presentationEligibilityFromExecutionSurfaces({
      executionId: "exec_x",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      resultData: merged,
      metadata: {},
      artifactIds: ["art_syncimg_x"],
    });
    assert.equal(eligibility.status, "AVAILABLE");
  });

  it("reproduces the exact exec_56 regression: without preservation, replay wrongly reports AVAILABLE", () => {
    // What actually happened before the fix: nextResult.data was rebuilt
    // fresh (== replayOnlyPass()) with no merge against the prior state.
    const unmerged = replayOnlyPass();
    const eligibility = presentationEligibilityFromExecutionSurfaces({
      executionId: "exec_56_1790161286558",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      resultData: unmerged,
      metadata: {},
      artifactIds: ["art_syncimg_84_1790161333318_0"],
    });
    assert.equal(eligibility.status, "AVAILABLE"); // the bug, preserved here as a regression guard
    assert.equal(eligibility.outcomePlanes?.structuralVerification, "NOT_RUN");
  });
});

describe("13/14 — reload / recovery preserves diagnostics through the durable store", () => {
  it("save → get (reload) → merge-on-replay → get (reload again) is stable", async () => {
    const repo = new InMemoryExecutionRepository();
    const base: ExecutionResource = {
      executionId: "exec_reload_1",
      status: "succeeded",
      organizationId: "org",
      correlationId: "corr",
      createdAt: "t",
      updatedAt: "t",
      promptPreview: "p",
    };
    await repo.save({ ...base, result: { kind: "structured", data: fullEvidencePass("NON_COMPLIANT") } });

    const reloaded1 = await repo.get("exec_reload_1");
    assert.equal((reloaded1?.result?.data as Record<string, unknown>).cdfStructuralComplianceStatus, "NON_COMPLIANT");

    // Simulate a recovery pass (e.g. worker restart replay) reingesting.
    const merged = preserveEstablishedOutcomeEvidenceOnResultData(reloaded1?.result, {
      kind: "structured",
      data: replayOnlyPass(),
    });
    await repo.update({ ...(reloaded1 as ExecutionResource), result: merged });

    const reloaded2 = await repo.get("exec_reload_1");
    assert.equal((reloaded2?.result?.data as Record<string, unknown>).cdfStructuralComplianceStatus, "NON_COMPLIANT");
    assert.equal((reloaded2?.result?.data as Record<string, unknown>).cdfArtifactId, ARTIFACT_ID);
  });
});
