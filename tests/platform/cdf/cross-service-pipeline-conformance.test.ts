/**
 * Cross-service CDF pipeline conformance lock.
 * Fixtures only — no paid providers.
 * Target: 89 / 89 CONFORMANT, 0 PARTIAL, 0 BLOCKED.
 */

import assert from "node:assert/strict";
import {
  buildFullConformanceMatrix,
  summarizeConformanceMatrix,
} from "../../../src/platform/cdf/conformance/service-phase-matrix";
import {
  tryIngestCanonicalCdfCompletion,
  isGenericCanonicalCompletionAvailable,
} from "../../../src/platform/cdf/canonical-ingest/try-ingest-canonical";
import {
  countCdfCanonicalPhases,
  listCdfCanonicalServiceIds,
} from "../../../src/platform/cdf/canonical";
import {
  getCdfSession,
  resetCdfSessionsForTests,
  saveCdfSession,
} from "../../../src/platform/cdf/session-store";
import { resetCdfArtifactEngineForTests } from "../../../src/platform/cdf/artifacts";
import type { CdfSessionState } from "../../../src/platform/cdf/types";

function sessionStub(
  sessionId: string,
  serviceId: string,
  phaseId: string,
): CdfSessionState {
  const ts = new Date().toISOString();
  return {
    sessionId,
    serviceId,
    organizationId: "6a8d8d7dc263a4d6afe69691",
    projectId: "proj_conf",
    contractVersion: "2.0.0-m1",
    sessionVersion: 1,
    status: "active",
    brief: "Conformance brief",
    phaseIndex: 0,
    phaseId,
    approved: [],
    selected: [],
    masters: {},
    modeOwnership: "ai",
    productMode: "ai",
    createdAt: ts,
    updatedAt: ts,
  };
}

describe("CDF cross-service pipeline conformance", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfArtifactEngineForTests();
  });

  it("locks registry baseline: 15 services × 89 phases", () => {
    const ids = listCdfCanonicalServiceIds();
    assert.equal(ids.length, 15);
    assert.equal(countCdfCanonicalPhases(), 89);
    const rows = buildFullConformanceMatrix();
    assert.equal(rows.length, 89);
    const summary = summarizeConformanceMatrix(rows);
    assert.equal(summary.registryPhaseCount, 89);
    assert.equal(summary.totalPhases, 89);
  });

  it("achieves 89/89 CONFORMANT with 0 PARTIAL and 0 BLOCKED", () => {
    assert.equal(isGenericCanonicalCompletionAvailable(), true);
    const rows = buildFullConformanceMatrix();
    const summary = summarizeConformanceMatrix(rows);
    assert.equal(
      summary.byStatus.CONFORMANT,
      89,
      JSON.stringify(summary.byStatus),
    );
    assert.equal(summary.byStatus.PARTIAL, 0);
    assert.equal(summary.byStatus.BLOCKED, 0);
    assert.equal(summary.byStrategy.route_visual ?? 0, 0);
    assert.equal(summary.blockedCanonicalServices.length, 0);
  });

  it("every deliverable phase uses canonical completion adapter (deep or generic)", () => {
    const rows = buildFullConformanceMatrix();
    for (const row of rows) {
      if (!row.canonicalRequired) continue;
      assert.ok(
        row.canonicalCompletionAdapter === "deep" ||
          row.canonicalCompletionAdapter === "generic",
        `${row.service}.${row.phase} adapter=${row.canonicalCompletionAdapter}`,
      );
      assert.equal(row.status, "CONFORMANT");
      assert.equal(row.routeVisualPathPresent, false);
    }
  });

  it("generic structured completion produces ArtifactVersion + session bind", () => {
    const sessionId = `cdf_conf_struct_${Date.now().toString(36)}`;
    saveCdfSession(sessionStub(sessionId, "brand-strategy", "messaging"));
    const r = tryIngestCanonicalCdfCompletion({
      metadata: {
        cdfSessionId: sessionId,
        cdfPhaseId: "messaging",
        cdfServiceId: "brand-strategy",
        cdfExecutionStrategy: "canonical",
      },
      rawOutput: {
        title: "Messaging platform",
        pillars: ["clarity", "proof", "emotion"],
      },
      executionId: "exec_conf_structured_1",
      organizationId: "6a8d8d7dc263a4d6afe69691",
      projectId: "proj_conf",
      forceOptIn: true,
    });
    assert.ok(r);
    assert.equal(r!.kind, "accepted", JSON.stringify(r));
    assert.equal(r!.family, "generic");
    assert.ok(String(r!.attach?.cdfArtifactId ?? "").startsWith("cdfart_"));
    const loaded = getCdfSession(sessionId);
    assert.ok(
      (loaded?.generatedArtifacts ?? []).some(
        (a) => a.artifactKey === "brand-strategy.messaging",
      ),
    );
  });

  it("generic image completion requires vault previewAssetRef", () => {
    const sessionId = `cdf_conf_img_${Date.now().toString(36)}`;
    saveCdfSession(sessionStub(sessionId, "ad-campaigns", "master-kv"));
    const vaultId = "507f1f77bcf86cd799439011";
    const r = tryIngestCanonicalCdfCompletion({
      metadata: {
        cdfSessionId: sessionId,
        cdfPhaseId: "master-kv",
        cdfServiceId: "ad-campaigns",
        cdfExecutionStrategy: "canonical",
      },
      rawOutput: {
        previewAssetRef: { vaultAssetId: vaultId },
        title: "Master KV",
      },
      executionId: "exec_conf_image_1",
      organizationId: "6a8d8d7dc263a4d6afe69691",
      projectId: "proj_conf",
      vaultAssetIds: [vaultId],
      forceOptIn: true,
    });
    assert.ok(r);
    assert.equal(r!.kind, "accepted", JSON.stringify(r));
    assert.ok(String(r!.attach?.cdfArtifactId ?? "").startsWith("cdfart_"));
  });

  it("generic ingest skips none/materialize phases", () => {
    const r = tryIngestCanonicalCdfCompletion({
      metadata: {
        cdfSessionId: "cdf_x",
        cdfPhaseId: "final",
        cdfServiceId: "social-media",
      },
      rawOutput: {},
      executionId: "exec_conf_2",
    });
    assert.ok(r);
    assert.equal(r!.kind, "skipped_not_applicable");
  });

  it("no legacy or route_visual executionStrategy remains in the registry", () => {
    const rows = buildFullConformanceMatrix();
    assert.equal(
      rows.filter((r) => r.phaseExecutionStrategy === "legacy").length,
      0,
    );
    assert.equal(
      rows.filter((r) => r.phaseExecutionStrategy === "route_visual").length,
      0,
    );
  });
});
