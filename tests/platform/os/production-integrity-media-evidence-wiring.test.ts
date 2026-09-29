/**
 * Integrity continuity evidence: hydrated/persisted ID lists must come from
 * successful hydrate (repo+blob), and CDF bind stamps must reach integrity metadata.
 */

import assert from "node:assert/strict";
import {
  buildProductionExecutionIntegrity,
  hasCanonicalCdfContinuityEvidence,
} from "../../../src/platform/os/observability/production-execution-integrity";

const identity = Object.freeze({
  requestedProviderId: "provider.openai",
  requestedModelId: "gpt-image-2",
  selectedProviderId: "provider.openai",
  selectedModelId: "gpt-image-2",
  actualProviderId: "provider.ideogram",
  actualModelId: "ideogram-3",
  fallbackUsed: true,
  fallbackReason: "rate_limit",
});

describe("Production integrity — media persist/hydrate evidence wiring", () => {
  it("media IDs without independent lists → INCOMPLETE (gate remains truthful)", () => {
    const integrity = buildProductionExecutionIntegrity({
      executionId: "exec_media_orphan",
      correlationId: "corr_media_orphan",
      service: "social",
      subtype: "content-design",
      outputKind: "image",
      providerIdentity: identity,
      providerSuccess: true,
      mediaArtifactIds: ["art_syncimg_53_test"],
      allowMissingArtifacts: false,
      artifactHydrated: true,
      metadata: {
        cdfSessionId: "cdf_x",
        cdfPhaseId: "output",
        cdfExecutionStrategy: "canonical",
      },
    });
    assert.equal(integrity.integrityStatus, "INCOMPLETE");
    assert.match(
      String(integrity.failureReason ?? ""),
      /without independent persistence\/hydration evidence/i,
    );
  });

  it("hydrate-proven persisted+hydrated ID lists → PASS (media actually durable)", () => {
    const artId = "art_syncimg_53_test";
    const integrity = buildProductionExecutionIntegrity({
      executionId: "exec_media_proven",
      correlationId: "corr_media_proven",
      service: "social",
      subtype: "content-design",
      outputKind: "image",
      providerIdentity: identity,
      providerSuccess: true,
      mediaArtifactIds: [artId],
      persistedArtifactIds: [artId],
      hydratedArtifactIds: [artId],
      allowMissingArtifacts: false,
      artifactHydrated: true,
      metadata: {
        cdfSessionId: "cdf_x",
        cdfPhaseId: "output",
        cdfExecutionStrategy: "canonical",
      },
    });
    assert.equal(integrity.integrityStatus, "PASS");
  });

  it("CDF bind stamps on metadata → PASS even when art_* lists omitted", () => {
    const meta = {
      cdfSessionId: "cdf_bound",
      cdfPhaseId: "output",
      cdfExecutionStrategy: "canonical",
      cdfArtifactId: "cdfart_mu09wsbm_2_social-media-output",
      cdfArtifactVersion: 1,
      cdfArtifactKey: "social-media.output",
      cdfGeneratedArtifactsBound: true,
      cdfCanonicalCompletionEstablished: true,
    };
    assert.equal(hasCanonicalCdfContinuityEvidence(meta), true);
    const integrity = buildProductionExecutionIntegrity({
      executionId: "exec_cdf_stamped",
      correlationId: "corr_cdf_stamped",
      service: "social",
      subtype: "content-design",
      outputKind: "image",
      providerIdentity: identity,
      providerSuccess: true,
      mediaArtifactIds: ["art_syncimg_53_test"],
      allowMissingArtifacts: false,
      metadata: meta,
    });
    assert.equal(integrity.integrityStatus, "PASS");
  });

  it("finalize path stamps CDF bind into metadata (source regression)", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const src = fs.readFileSync(
      path.join(
        __dirname,
        "../../../src/platform/api/services/execution-create-dispatch.ts",
      ),
      "utf8",
    );
    assert.match(
      src,
      /Stamp execution metadata for integrity\/evidence/,
    );
    assert.match(
      src,
      /meta = \{\s*\.\.\.meta,\s*\.\.\.cdfAttachMeta,/s,
    );
  });

  it("validation resolver exports hydrate-proven ID lists on stageTrace", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const src = fs.readFileSync(
      path.join(
        __dirname,
        "../../../src/platform/providers/routing/performance/benchmark/production/production-validation-resolver.ts",
      ),
      "utf8",
    );
    assert.match(src, /hydratedArtifactIds:\s*provenIds/);
    assert.match(src, /persistedArtifactIds:\s*provenIds/);
  });
});
