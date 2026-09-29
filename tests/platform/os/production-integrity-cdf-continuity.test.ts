/**
 * Canonical CDF ArtifactVersion X@V is valid continuity for integrity PASS.
 * Legacy art_* media-ID arrays are not required when cdfart_* is bound.
 */

import assert from "node:assert/strict";
import {
  buildProductionExecutionIntegrity,
  hasCanonicalCdfContinuityEvidence,
  resolveCanonicalCdfContinuityEvidence,
} from "../../../src/platform/os/observability/production-execution-integrity";

const identity = Object.freeze({
  requestedProviderId: "provider.openai",
  requestedModelId: "gpt-image-2",
  selectedProviderId: "provider.openai",
  selectedModelId: "gpt-image-2",
  actualProviderId: "provider.google",
  actualModelId: "gemini-3-pro-image",
  fallbackUsed: true,
});

function cdfBoundMeta(overrides: Record<string, unknown> = {}) {
  return {
    cdfSessionId: "cdf_integrity_1",
    cdfPhaseId: "output",
    cdfServiceId: "social-media",
    cdfExecutionStrategy: "canonical",
    cdfExecutionAuthorityApplied: true,
    cdfArtifactId: "cdfart_integrity_output_1",
    cdfArtifactVersion: 1,
    cdfArtifactKey: "social-media.output",
    cdfGeneratedArtifactsBound: true,
    cdfCanonicalCompletionEstablished: true,
    ...overrides,
  };
}

describe("Production integrity — canonical CDF continuity", () => {
  it("1 — canonical text X@V → integrity PASS", () => {
    const integrity = buildProductionExecutionIntegrity({
      executionId: "exec_cdf_text",
      correlationId: "corr_cdf_text",
      service: "social-media",
      subtype: "routes",
      outputKind: "text",
      providerIdentity: {
        ...identity,
        actualProviderId: "provider.openai",
        actualModelId: "gpt-4o",
        fallbackUsed: false,
      },
      providerSuccess: true,
      allowMissingArtifacts: false,
      metadata: cdfBoundMeta({
        cdfPhaseId: "routes",
        cdfArtifactKey: "social-media.routes",
        cdfAuthorityOutputKind: "text",
        cdfAuthorityGenerationModality: "text",
      }),
    });
    assert.equal(hasCanonicalCdfContinuityEvidence(cdfBoundMeta()), true);
    assert.equal(integrity.integrityStatus, "PASS");
  });

  it("2 — canonical image X@V → integrity PASS", () => {
    const integrity = buildProductionExecutionIntegrity({
      executionId: "exec_cdf_image",
      correlationId: "corr_cdf_image",
      service: "social-media",
      subtype: "output",
      outputKind: "image",
      providerIdentity: identity,
      providerSuccess: true,
      // art_* may be present but without independent continuity — cdfart wins
      mediaArtifactIds: ["art_sync_img_1"],
      allowMissingArtifacts: false,
      metadata: cdfBoundMeta({
        cdfAuthorityOutputKind: "image",
        cdfAuthorityGenerationModality: "image",
      }),
    });
    assert.equal(integrity.integrityStatus, "PASS");
    assert.equal(integrity.actualProvider, "provider.google");
    assert.equal(integrity.actualModel, "gemini-3-pro-image");
  });

  it("3 — canonical video X@V → integrity PASS", () => {
    const integrity = buildProductionExecutionIntegrity({
      executionId: "exec_cdf_video",
      correlationId: "corr_cdf_video",
      service: "video",
      subtype: "spot",
      outputKind: "video",
      providerIdentity: identity,
      providerSuccess: true,
      allowMissingArtifacts: false,
      metadata: cdfBoundMeta({
        cdfServiceId: "video",
        cdfPhaseId: "render",
        cdfArtifactKey: "video.render",
        cdfAuthorityOutputKind: "video",
        cdfAuthorityGenerationModality: "video",
      }),
    });
    assert.equal(integrity.integrityStatus, "PASS");
  });

  it("4 — successful provider + no canonical artifact → remains incomplete", () => {
    const integrity = buildProductionExecutionIntegrity({
      executionId: "exec_cdf_pending",
      correlationId: "corr_cdf_pending",
      service: "social-media",
      subtype: "output",
      outputKind: "image",
      providerIdentity: identity,
      providerSuccess: true,
      mediaArtifactIds: ["art_sync_img_pending"],
      allowMissingArtifacts: false,
      metadata: {
        cdfSessionId: "cdf_pending",
        cdfPhaseId: "output",
        cdfExecutionStrategy: "canonical",
        cdfExecutionAuthorityApplied: true,
        cdfAuthorityOutputKind: "image",
      },
    });
    assert.equal(integrity.integrityStatus, "INCOMPLETE");
  });

  it("5 — provider 429 → execution failure", () => {
    const integrity = buildProductionExecutionIntegrity({
      executionId: "exec_cdf_429",
      correlationId: "corr_cdf_429",
      service: "social-media",
      subtype: "output",
      outputKind: "image",
      providerIdentity: identity,
      providerSuccess: false,
      providerLifecycleComplete: true,
      allowMissingArtifacts: false,
      metadata: {
        cdfSessionId: "cdf_429",
        cdfPhaseId: "output",
        cdfExecutionStrategy: "canonical",
      },
    });
    assert.equal(integrity.integrityStatus, "FAIL");
    assert.equal(integrity.failureCategory, "PROVIDER_EXECUTION_FAILURE");
  });

  it("6 — execution success + governance BLOCK remains distinct from integrity", () => {
    const releaseBlocked = true;
    const integrity = buildProductionExecutionIntegrity({
      executionId: "exec_cdf_block",
      correlationId: "corr_cdf_block",
      service: "social-media",
      subtype: "output",
      outputKind: "image",
      providerIdentity: identity,
      providerSuccess: true,
      allowMissingArtifacts: false,
      metadata: cdfBoundMeta(),
    });
    assert.equal(integrity.integrityStatus, "PASS");
    // Release block is a governance decision — not integrity FAIL.
    assert.equal(releaseBlocked, true);
    assert.notEqual(integrity.failureCategory, "PROVIDER_EXECUTION_FAILURE");
  });

  it("7 — canonical artifact persisted but not bound → must not claim completion", () => {
    const meta = cdfBoundMeta({
      cdfGeneratedArtifactsBound: false,
      cdfCanonicalCompletionEstablished: false,
    });
    const evidence = resolveCanonicalCdfContinuityEvidence(meta);
    assert.ok(evidence);
    assert.equal(evidence!.generatedArtifactsBound, false);
    assert.equal(hasCanonicalCdfContinuityEvidence(meta), false);

    const integrity = buildProductionExecutionIntegrity({
      executionId: "exec_cdf_unbound",
      correlationId: "corr_cdf_unbound",
      service: "social-media",
      subtype: "output",
      outputKind: "image",
      providerIdentity: identity,
      providerSuccess: true,
      mediaArtifactIds: ["art_sync_unbound"],
      allowMissingArtifacts: false,
      metadata: meta,
    });
    assert.equal(integrity.integrityStatus, "INCOMPLETE");
    assert.match(
      String(integrity.failureReason ?? ""),
      /without generatedArtifacts session bind/i,
    );
  });

  it("no serviceId-specific branches in continuity helpers", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const src = fs.readFileSync(
      path.join(
        __dirname,
        "../../../src/platform/os/observability/production-execution-integrity.ts",
      ),
      "utf8",
    );
    const helper = src.slice(
      src.indexOf("export function resolveCanonicalCdfContinuityEvidence"),
      src.indexOf("export function hasCanonicalCdfContinuityEvidence") +
        200,
    );
    assert.equal(/serviceId\s*===/.test(helper), false);
    assert.equal(/phaseId\s*===/.test(helper), false);
  });
});
