/**
 * Part 5 — Exact ArtifactVersion continuity negative tests.
 * Deterministic only; no live providers.
 */

import assert from "node:assert/strict";
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
import { resolveExactGeneratedArtifactPin } from "../../../src/platform/cdf/conformance/execution-certification-matrix";
import type { CdfSessionState } from "../../../src/platform/cdf/types";
import { applyCdfTransition } from "../../../src/platform/cdf/transition-service";

const ORG = "6a8d8d7dc263a4d6afe69691";
const PROJ = "proj_exact_neg";

function stub(sessionId: string, phaseId = "routes"): CdfSessionState {
  const ts = new Date().toISOString();
  return {
    sessionId,
    serviceId: "social-media",
    organizationId: ORG,
    projectId: PROJ,
    contractVersion: "2.0.0-m1",
    sessionVersion: 1,
    status: "active",
    brief: "Exact continuity negatives",
    phaseIndex: 2,
    phaseId,
    approved: [
      {
        phaseId: "platform",
        approvedAt: ts,
        selectedRouteIndex: 0,
        selectedRouteLabel: "Instagram",
      },
      {
        phaseId: "size-reference",
        approvedAt: ts,
        selectedRouteIndex: 0,
        selectedRouteLabel: "Feed",
      },
    ],
    selected: [],
    masters: {},
    modeOwnership: "ai",
    productMode: "ai",
    createdAt: ts,
    updatedAt: ts,
  };
}

describe("exact ArtifactVersion continuity negatives", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfArtifactEngineForTests();
  });

  it("1 — exact selected X@V exists → downstream pin resolves", () => {
    const sessionId = `cdf_ex1_${Date.now().toString(36)}`;
    saveCdfSession(stub(sessionId));
    const { artifact, version } = createArtifact({
      artifactKey: "social-media.routes",
      artifactType: "structured_doc",
      organizationId: ORG,
      projectId: PROJ,
      sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      data: { routes: [{ label: "A", title: "A" }] },
      schemaVersion: "1",
    });
    saveCdfSession({
      ...getCdfSession(sessionId)!,
      generatedArtifacts: [
        {
          artifactId: artifact.artifactId,
          version: version.version,
          phaseId: "routes",
          artifactKey: "social-media.routes",
          role: "generated",
        },
      ],
      selectedArtifacts: [
        {
          artifactId: artifact.artifactId,
          version: version.version,
          phaseId: "routes",
          artifactKey: "social-media.routes",
          role: "selected",
        },
      ],
    });
    const pin = resolveExactGeneratedArtifactPin({
      sessionId,
      artifactId: artifact.artifactId,
      version: version.version,
      artifactKey: "social-media.routes",
      organizationId: ORG,
      projectId: PROJ,
    });
    assert.equal(pin.ok, true);
    if (pin.ok) assert.equal(pin.pin.version, version.version);
  });

  it("2 — exact X@V missing → fail closed", () => {
    const sessionId = `cdf_ex2_${Date.now().toString(36)}`;
    saveCdfSession(stub(sessionId));
    const pin = resolveExactGeneratedArtifactPin({
      sessionId,
      artifactId: "cdfart_missing_routes",
      version: 1,
      artifactKey: "social-media.routes",
      organizationId: ORG,
      projectId: PROJ,
    });
    assert.equal(pin.ok, false);
    if (!pin.ok) assert.equal(pin.reason, "pin_missing");
  });

  it("3 — X@V and X@(V+1) exist → selected X@V remains selected", () => {
    const sessionId = `cdf_ex3_${Date.now().toString(36)}`;
    saveCdfSession(stub(sessionId));
    const { artifact, version: v1 } = createArtifact({
      artifactKey: "social-media.routes",
      artifactType: "structured_doc",
      organizationId: ORG,
      projectId: PROJ,
      sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      data: { routes: [{ label: "v1" }] },
      schemaVersion: "1",
    });
    const { version: v2 } = createVersion({
      artifactId: artifact.artifactId,
      expectedLatestVersion: 1,
      data: { routes: [{ label: "v2" }] },
      organizationId: ORG,
      projectId: PROJ,
    });
    assert.notEqual(v1.version, v2.version);
    saveCdfSession({
      ...getCdfSession(sessionId)!,
      generatedArtifacts: [
        {
          artifactId: artifact.artifactId,
          version: v1.version,
          phaseId: "routes",
          artifactKey: "social-media.routes",
          role: "generated",
        },
      ],
      selectedArtifacts: [
        {
          artifactId: artifact.artifactId,
          version: v1.version,
          phaseId: "routes",
          artifactKey: "social-media.routes",
          role: "selected",
        },
      ],
    });
    const selected = getCdfSession(sessionId)!.selectedArtifacts![0]!;
    assert.equal(selected.version, v1.version);
    assert.notEqual(selected.version, v2.version);
    const exact = getArtifactVersion(artifact.artifactId, v1.version, {
      organizationId: ORG,
      projectId: PROJ,
    });
    assert.equal(exact.version, v1.version);
  });

  it("4 — multiple artifacts same key → ambiguity fails closed without exact identity", () => {
    const sessionId = `cdf_ex4_${Date.now().toString(36)}`;
    let session = saveCdfSession(stub(sessionId));
    const a = createArtifact({
      artifactKey: "social-media.routes",
      artifactType: "structured_doc",
      organizationId: ORG,
      projectId: PROJ,
      sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      data: { routes: [{ label: "A" }] },
      schemaVersion: "1",
    });
    const b = createArtifact({
      artifactKey: "social-media.routes",
      artifactType: "structured_doc",
      organizationId: ORG,
      projectId: PROJ,
      sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      data: { routes: [{ label: "B" }] },
      schemaVersion: "1",
    });
    session = saveCdfSession({
      ...session,
      generatedArtifacts: [
        {
          artifactId: a.artifact.artifactId,
          version: a.version.version,
          phaseId: "routes",
          artifactKey: "social-media.routes",
          role: "generated",
        },
        {
          artifactId: b.artifact.artifactId,
          version: b.version.version,
          phaseId: "routes",
          artifactKey: "social-media.routes",
          role: "generated",
        },
      ],
    });
    const result = applyCdfTransition({
      sessionId,
      action: "select_route",
      routeIndex: 0,
      expectedVersion: session.sessionVersion,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(
        String(result.error.message ?? result.error),
        /exact|INVALID_SELECTION|artifact|identity|ambiguous/i,
      );
    }
  });

  it("5 — multiple fanout leaves → exact target identity required", () => {
    const sessionId = `cdf_ex5_${Date.now().toString(36)}`;
    const session = saveCdfSession({
      ...stub(sessionId, "output"),
      phaseId: "output",
      generatedArtifacts: [
        {
          artifactId: "cdfart_leaf_a_output",
          version: 1,
          phaseId: "output",
          artifactKey: "social-media.output",
          role: "generated",
          generationFanoutTargetId: "fanout_0_a",
          generationFanoutGroupId: "g1",
        },
        {
          artifactId: "cdfart_leaf_b_output",
          version: 1,
          phaseId: "output",
          artifactKey: "social-media.output",
          role: "generated",
          generationFanoutTargetId: "fanout_1_b",
          generationFanoutGroupId: "g1",
        },
      ],
    });
    const ambiguous = applyCdfTransition({
      sessionId,
      action: "select_route",
      routeIndex: 0,
      expectedVersion: session.sessionVersion,
    });
    assert.equal(ambiguous.ok, false);
  });

  it("6 — restart recovers same X@V", () => {
    const sessionId = `cdf_ex6_${Date.now().toString(36)}`;
    saveCdfSession(stub(sessionId));
    const { artifact, version } = createArtifact({
      artifactKey: "social-media.routes",
      artifactType: "structured_doc",
      organizationId: ORG,
      projectId: PROJ,
      sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      data: { routes: [{ label: "restart" }] },
      schemaVersion: "1",
    });
    saveCdfSession({
      ...getCdfSession(sessionId)!,
      generatedArtifacts: [
        {
          artifactId: artifact.artifactId,
          version: version.version,
          phaseId: "routes",
          artifactKey: "social-media.routes",
          role: "generated",
        },
      ],
    });
    const after = getCdfSession(sessionId)!;
    const pin = resolveExactGeneratedArtifactPin({
      sessionId: after.sessionId,
      artifactId: artifact.artifactId,
      version: version.version,
      artifactKey: "social-media.routes",
      organizationId: ORG,
      projectId: PROJ,
    });
    assert.equal(pin.ok, true);
    if (pin.ok) {
      assert.equal(pin.pin.artifactId, artifact.artifactId);
      assert.equal(pin.pin.version, version.version);
      assert.equal(pin.restartSafe, true);
    }
  });

  it("7 — latest differs from selected X@V → latest MUST NOT be substituted", () => {
    const sessionId = `cdf_ex7_${Date.now().toString(36)}`;
    saveCdfSession(stub(sessionId));
    const { artifact, version: v1 } = createArtifact({
      artifactKey: "social-media.routes",
      artifactType: "structured_doc",
      organizationId: ORG,
      projectId: PROJ,
      sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      data: { routes: [{ label: "selected" }] },
      schemaVersion: "1",
    });
    const { version: v2 } = createVersion({
      artifactId: artifact.artifactId,
      expectedLatestVersion: 1,
      data: { routes: [{ label: "latest" }] },
      organizationId: ORG,
      projectId: PROJ,
    });
    saveCdfSession({
      ...getCdfSession(sessionId)!,
      generatedArtifacts: [
        {
          artifactId: artifact.artifactId,
          version: v1.version,
          phaseId: "routes",
          artifactKey: "social-media.routes",
          role: "generated",
        },
      ],
      selectedArtifacts: [
        {
          artifactId: artifact.artifactId,
          version: v1.version,
          phaseId: "routes",
          artifactKey: "social-media.routes",
          role: "selected",
        },
      ],
    });
    const pin = resolveExactGeneratedArtifactPin({
      sessionId,
      artifactId: artifact.artifactId,
      version: v1.version,
      artifactKey: "social-media.routes",
      organizationId: ORG,
      projectId: PROJ,
    });
    assert.equal(pin.ok, true);
    if (pin.ok) {
      assert.equal(pin.pin.version, v1.version);
      assert.notEqual(pin.pin.version, v2.version);
    }
    const selected = getCdfSession(sessionId)!.selectedArtifacts![0]!;
    assert.equal(selected.version, v1.version);
    assert.notEqual(selected.version, v2.version);
  });
});
