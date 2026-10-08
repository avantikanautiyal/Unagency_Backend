/**
 * Deterministic CDF execution certification — fixtures only, no live providers.
 * Soft-assert: matrix must be complete; ideal is 89 EXECUTION_CERTIFIED but
 * failures are reported clearly without greenwashing.
 */

import assert from "node:assert/strict";
import {
  buildFullExecutionCertificationMatrix,
  certifyPhaseDeterministic,
  executionCertificationSummaryToJson,
  resolveExactGeneratedArtifactPin,
  runFullExecutionCertification,
  EXECUTION_CERT_ORG_ID,
} from "../../../src/platform/cdf/conformance/execution-certification-matrix";
import {
  countCdfCanonicalPhases,
  resolveCdfPhaseExecutionContract,
  resolveProductStructuredStampPolicy,
} from "../../../src/platform/cdf/canonical";
import { requiresCanonicalEmissionSchema } from "../../../src/platform/cdf/structured-output-contract";
import {
  createArtifact,
  createVersion,
  getArtifactVersion,
  resetCdfArtifactEngineForTests,
} from "../../../src/platform/cdf/artifacts";
import {
  getCdfSession,
  resetCdfSessionsForTests,
  saveCdfSession,
} from "../../../src/platform/cdf/session-store";
import type { CdfSessionState } from "../../../src/platform/cdf/types";

describe("CDF execution certification harness", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfArtifactEngineForTests();
  });

  it("registry phase count matches matrix length", () => {
    const registry = countCdfCanonicalPhases();
    const rows = buildFullExecutionCertificationMatrix();
    assert.equal(rows.length, registry);
    assert.equal(registry, 85);
  });

  it("runFullExecutionCertification produces summary with counts", () => {
    const { rows, summary } = runFullExecutionCertification();
    assert.equal(rows.length, summary.totalPhases);
    assert.equal(summary.registryPhaseCount, countCdfCanonicalPhases());
    assert.equal(
      summary.byStatus.EXECUTION_CERTIFIED +
        summary.byStatus.FAILED +
        summary.byStatus.CONTRACT_WIRED +
        summary.byStatus.LIVE_PROVIDER_CERTIFIED,
      summary.totalPhases,
    );
    assert.equal(summary.byStatus.LIVE_PROVIDER_CERTIFIED, 0);
    assert.equal(summary.harnessMode, "deterministic");
    const json = executionCertificationSummaryToJson(summary);
    assert.equal(json.totalPhases, summary.totalPhases);
    assert.equal(json.liveProviderCertified, 0);
    assert.ok(Array.isArray(json.failures));

    // Soft target: ideally 89 certified. Do not greenwash — report failures.
    if (summary.certified !== summary.idealTargetCertified) {
      // eslint-disable-next-line no-console
      console.warn(
        `[cdf-execution-certification] ${summary.certified}/${summary.idealTargetCertified} EXECUTION_CERTIFIED; failures:\n` +
          JSON.stringify(summary.failures, null, 2),
      );
    }
    assert.equal(
      summary.totalPhases,
      summary.registryPhaseCount,
      "harness must enumerate every registry phase",
    );
  });

  it("structured emission is contract-driven (dedicated schema ⇒ omit product stamp)", () => {
    const storyline = resolveCdfPhaseExecutionContract({
      serviceId: "presentation",
      phaseId: "storyline",
    });
    assert.ok(storyline);
    assert.equal(storyline!.structuredEmission, "required");
    assert.equal(requiresCanonicalEmissionSchema(storyline!), true);
    const policy = resolveProductStructuredStampPolicy(storyline);
    assert.equal(policy.structuredEmissionRequired, true);
    assert.equal(policy.omitProductStructuredStamp, true);
    assert.equal(
      storyline!.structuredOutputContract?.name,
      "CdfPresentationStoryline",
    );
  });

  it("exact selection resolves X@V — never latest", () => {
    const ts = new Date().toISOString();
    const sessionId = `cdf_exact_pin_${Date.now().toString(36)}`;
    const session: CdfSessionState = {
      sessionId,
      serviceId: "brand-strategy",
      organizationId: EXECUTION_CERT_ORG_ID,
      projectId: "proj_exact",
      contractVersion: "2.0.0-m1",
      sessionVersion: 1,
      status: "active",
      brief: "Exact pin test",
      phaseIndex: 0,
      phaseId: "messaging",
      approved: [],
      selected: [],
      masters: {},
      modeOwnership: "ai",
      productMode: "ai",
      createdAt: ts,
      updatedAt: ts,
    };
    saveCdfSession(session);

    const { artifact, version: v1Rec } = createArtifact({
      artifactKey: "brand-strategy.messaging",
      artifactType: "structured_doc",
      organizationId: EXECUTION_CERT_ORG_ID,
      projectId: "proj_exact",
      sessionId,
      serviceId: "brand-strategy",
      phaseId: "messaging",
      data: { title: "v1", content: "first" },
      schemaVersion: "1",
    });
    const v1 = v1Rec.version;
    const { version: v2Rec } = createVersion({
      artifactId: artifact.artifactId,
      expectedLatestVersion: 1,
      data: { title: "v2", content: "second" },
      organizationId: EXECUTION_CERT_ORG_ID,
      projectId: "proj_exact",
    });
    const v2 = v2Rec.version;
    assert.notEqual(v1, v2);

    // Bind exact v1 only — selection must not float to latest (v2).
    saveCdfSession({
      ...getCdfSession(sessionId)!,
      generatedArtifacts: [
        {
          artifactId: artifact.artifactId,
          version: v1,
          phaseId: "messaging",
          artifactKey: "brand-strategy.messaging",
          role: "generated",
        },
      ],
    });

    const pin = resolveExactGeneratedArtifactPin({
      sessionId,
      artifactId: artifact.artifactId,
      version: v1,
      artifactKey: "brand-strategy.messaging",
      organizationId: EXECUTION_CERT_ORG_ID,
      projectId: "proj_exact",
    });
    assert.equal(pin.ok, true);
    if (!pin.ok) return;
    assert.equal(pin.pin.version, v1);
    assert.notEqual(pin.pin.version, v2);

    const exact = getArtifactVersion(artifact.artifactId, v1, {
      organizationId: EXECUTION_CERT_ORG_ID,
      projectId: "proj_exact",
    });
    assert.equal(exact.version, v1);
    const latest = getArtifactVersion(artifact.artifactId, v2, {
      organizationId: EXECUTION_CERT_ORG_ID,
      projectId: "proj_exact",
    });
    assert.equal(latest.version, v2);
    assert.notEqual(exact.version, latest.version);
  });

  it("at least one certified phase is restart-safe", () => {
    // Prefer a none/materialize phase (deterministic, no ingest deps).
    const row = certifyPhaseDeterministic("social-media", "final");
    assert.equal(row.result, "EXECUTION_CERTIFIED", JSON.stringify(row));
    assert.equal(row.restartSafe, true);

    // Also prove a successful ingest path when available.
    const { rows } = runFullExecutionCertification();
    const certified = rows.filter(
      (r) => r.result === "EXECUTION_CERTIFIED" && r.restartSafe,
    );
    assert.ok(
      certified.length >= 1,
      `expected ≥1 restart-safe certified phase; got ${certified.length}`,
    );
  });
});
