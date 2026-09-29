/**
 * Backend select_route validates routeIndex/choiceId against exact ArtifactVersion.
 * Fail closed — never clamp, never latest substitution.
 * Generic: no packaging/service branches in assertions beyond fixture data.
 */

import assert from "node:assert/strict";
import {
  applyCdfTransition,
  createArtifact,
  fixturePackagingDieline,
  fixturePackagingRoutes,
  PACKAGING_ARTIFACT_KEYS,
  resetCdfArtifactEngineForTests,
  resetCdfSessionsForTests,
  saveCdfSession,
} from "../../../src/platform/cdf";
import type { CdfSessionState } from "../../../src/platform/cdf/types";
import {
  extractChoiceArrayFromArtifactData,
  resolveSelectedSemanticChoices,
} from "../../../src/platform/cdf/generation-context/resolve-selected-choice";

const ORG = "6a8d8d7dc263a4d6afe69691";
const PROJ = "proj_choice_sel";

function sessionStub(sessionId: string): CdfSessionState {
  const ts = new Date().toISOString();
  return {
    sessionId,
    serviceId: "packaging",
    organizationId: ORG,
    projectId: PROJ,
    contractVersion: "2.0.0-m1",
    sessionVersion: 1,
    status: "active",
    brief: "Selection identity brief",
    phaseIndex: 1,
    phaseId: "routes",
    approved: [],
    selected: [],
    masters: {},
    modeOwnership: "ai",
    productMode: "ai",
    createdAt: ts,
    updatedAt: ts,
  };
}

function seedPackagingRoutes(sessionId: string) {
  const dieline = createArtifact({
    sessionId,
    serviceId: "packaging",
    phaseId: "dieline",
    organizationId: ORG,
    projectId: PROJ,
    artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
    artifactType: "config_choice",
    data: fixturePackagingDieline() as never,
  });
  const routes = createArtifact({
    sessionId,
    serviceId: "packaging",
    phaseId: "routes",
    organizationId: ORG,
    projectId: PROJ,
    artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
    artifactType: "text_choice",
    data: fixturePackagingRoutes(
      dieline.artifact.artifactId,
      1,
    ) as never,
  });
  return { dieline, routes };
}

function sessionWithPins(
  sessionId: string,
  dieline: ReturnType<typeof createArtifact>,
  routes: ReturnType<typeof createArtifact>,
): CdfSessionState {
  const base = sessionStub(sessionId);
  return {
    ...base,
    selected: [
      {
        phaseId: "dieline",
        selectedAt: base.createdAt,
        selectedRouteIndex: 0,
        selectedRouteLabel: "Dieline",
        artifactId: dieline.artifact.artifactId,
        artifactVersion: 1,
      },
    ],
    approved: [
      {
        phaseId: "dieline",
        approvedAt: base.createdAt,
        selectedRouteIndex: 0,
        artifactId: dieline.artifact.artifactId,
        artifactVersion: 1,
      },
    ],
    selectedArtifacts: [
      {
        artifactId: dieline.artifact.artifactId,
        version: 1,
        phaseId: "dieline",
        artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
        role: "selected",
      },
    ],
    approvedArtifacts: [
      {
        artifactId: dieline.artifact.artifactId,
        version: 1,
        phaseId: "dieline",
        artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
        role: "approved",
      },
    ],
    generatedArtifacts: [
      {
        artifactId: dieline.artifact.artifactId,
        version: 1,
        phaseId: "dieline",
        artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
        role: "generated",
      },
      {
        artifactId: routes.artifact.artifactId,
        version: 1,
        phaseId: "routes",
        artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
        role: "generated",
      },
    ],
  };
}

describe("CDF select_route exact X@V choice validation", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfArtifactEngineForTests();
  });

  it("rejects stale routeIndex 5 against exact parent with 3 choices", () => {
    const sessionId = `cdf_sel_${Date.now().toString(36)}`;
    const { dieline, routes } = seedPackagingRoutes(sessionId);
    const X = routes.artifact.artifactId;
    const V = 1;
    const extracted = extractChoiceArrayFromArtifactData(routes.version.data);
    assert.ok(extracted);
    assert.equal(extracted!.items.length, 3);

    const session = saveCdfSession(sessionWithPins(sessionId, dieline, routes));

    const result = applyCdfTransition({
      sessionId,
      action: "select_route",
      routeIndex: 5,
      artifactId: X,
      artifactVersion: V,
      artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
      expectedVersion: session.sessionVersion,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(String(result.error.message), /out of range|3 choices/i);
  });

  it("accepts local third choice (index 2) + choiceId against exact X@V", () => {
    const sessionId = `cdf_sel_ok_${Date.now().toString(36)}`;
    const { dieline, routes } = seedPackagingRoutes(sessionId);
    const X = routes.artifact.artifactId;
    const V = 1;
    const items = extractChoiceArrayFromArtifactData(routes.version.data)!.items;
    const third = items[2] as { routeId?: string };
    assert.ok(third.routeId);

    const session = saveCdfSession(sessionWithPins(sessionId, dieline, routes));

    const result = applyCdfTransition({
      sessionId,
      action: "select_route",
      routeIndex: 2,
      choiceId: third.routeId,
      artifactId: X,
      artifactVersion: V,
      artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
      expectedVersion: session.sessionVersion,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    if (!result.ok) return;
    const sel = result.value.session.selected.find((s) => s.phaseId === "routes");
    assert.ok(sel);
    assert.equal(sel!.selectedRouteIndex, 2);
    assert.equal(sel!.selectedChoiceId, third.routeId);
    assert.equal(sel!.artifactId, X);
    assert.equal(sel!.artifactVersion, V);
  });

  it("choiceId wins over stale routeIndex 5 (observed UI bug)", () => {
    const sessionId = `cdf_sel_id_${Date.now().toString(36)}`;
    const { dieline, routes } = seedPackagingRoutes(sessionId);
    const X = routes.artifact.artifactId;
    const V = 1;
    const items = extractChoiceArrayFromArtifactData(routes.version.data)!.items;
    const third = items[2] as { routeId?: string };

    const session = saveCdfSession(sessionWithPins(sessionId, dieline, routes));

    const result = applyCdfTransition({
      sessionId,
      action: "select_route",
      routeIndex: 5,
      choiceId: third.routeId,
      artifactId: X,
      artifactVersion: V,
      artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
      expectedVersion: session.sessionVersion,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    if (!result.ok) return;
    const sel = result.value.session.selected.find((s) => s.phaseId === "routes");
    assert.equal(sel!.selectedRouteIndex, 2);
    assert.equal(sel!.selectedChoiceId, third.routeId);
  });

  it("semantic resolver maps choiceId on exact X@V", () => {
    const data = {
      routes: [
        { routeId: "route_01", name: "Old A" },
        { routeId: "route_02", name: "Old B" },
        { routeId: "route_03", name: "Old C" },
      ],
    };
    const resolved = resolveSelectedSemanticChoices({
      selections: [
        {
          phaseId: "routes",
          label: "C",
          routeIndex: 5,
          choiceId: "route_03",
          semantic: "selection",
        },
      ],
      upstream: [
        {
          phaseId: "routes",
          artifactId: "cdfart_v1",
          version: 1,
          artifactKey: "packaging.routes",
          data,
          sessionRole: "selected",
          role: "selected_reference",
        },
      ],
      requirePhaseIds: ["routes"],
    });
    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;
    assert.equal(resolved.choices[0]!.selectedRouteIndex, 2);
    assert.equal(
      (resolved.choices[0]!.choice as { name?: string }).name,
      "Old C",
    );
  });
});
