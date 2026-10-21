/**
 * Regression (originally ad-campaigns channel-select; now event-branding
 * select-touchpoints after theme-routes): a static config gate must accept a
 * select_route without an exact pin even when upstream canonical refs exist,
 * and must reject a stale pin from an earlier phase without touching it.
 */

import assert from "node:assert/strict";
import {
  applyCdfTransition,
  createArtifact,
  getArtifact,
  getCdfSession,
  persistCdfSession,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
} from "../../../src/platform/cdf";
import { applyArtifactEngineOnApprove } from "../../../src/platform/cdf/artifacts/session-adapter";

const ORG = "org_cdf_config_gate";
const PROJ = "proj_cdf_config_gate";

function sessionAtTouchpointSelect() {
  const started = applyCdfTransition({
    action: "start",
    serviceId: "event-branding",
    productMode: "ai",
    organizationId: ORG,
    projectId: PROJ,
  });
  if (!started.ok) throw new Error(started.error.message);
  const briefed = applyCdfTransition({
    sessionId: started.value.session.sessionId,
    action: "submit_brief",
    brief: "Branding kit for a 2-day fintech summit",
    expectedVersion: started.value.session.sessionVersion,
  });
  if (!briefed.ok) throw new Error(briefed.error.message);

  const sessionId = briefed.value.session.sessionId;
  const themeRoutes = createArtifact({
    sessionId,
    serviceId: "event-branding",
    phaseId: "theme-routes",
    organizationId: ORG,
    projectId: PROJ,
    artifactKey: "event-branding.theme-routes",
    artifactType: "text_choice",
    data: { routes: [{ name: "Neon Night" }, { name: "Garden Party" }, { name: "Summit Blue" }] },
  });
  const themeRoutesId = themeRoutes.artifact.artifactId;

  let session = getCdfSession(sessionId)!;
  const phaseIndex = briefed.value.config.phases.findIndex(
    (p) => p.id === "select-touchpoints",
  );
  assert.ok(phaseIndex >= 0);
  session = applyArtifactEngineOnApprove({
    session,
    phaseId: "theme-routes",
    artifactId: themeRoutesId,
    artifactVersion: 1,
    artifactKey: "event-branding.theme-routes",
    organizationId: ORG,
    projectId: PROJ,
  });
  session = {
    ...session,
    phaseIndex,
    phaseId: "select-touchpoints",
    status: "active",
    approved: [
      ...session.approved,
      {
        phaseId: "theme-routes",
        approvedAt: new Date().toISOString(),
        artifactId: themeRoutesId,
        artifactVersion: 1,
      },
    ],
    sessionVersion: session.sessionVersion + 1,
  };
  persistCdfSession(session);
  return { session: getCdfSession(sessionId)!, themeRoutesId };
}

describe("CDF config gate select after upstream canonical refs", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
  });

  it("selects a touchpoint without an exact pin", () => {
    const { session } = sessionAtTouchpointSelect();
    assert.ok((session.approvedArtifacts?.length ?? 0) > 0);

    const res = applyCdfTransition({
      sessionId: session.sessionId,
      action: "select_route",
      routeIndex: 0,
      routeLabel: "Stage",
      routeTitle: "Stage",
      expectedVersion: session.sessionVersion,
    });
    if (!res.ok) throw new Error(res.error.message);
    const pick = res.value.session.selected.find(
      (s) => s.phaseId === "select-touchpoints",
    );
    assert.equal(pick?.selectedRouteLabel, "Stage");
    assert.notEqual(res.value.session.phaseId, "select-touchpoints");
  });

  it("rejects a stale pin from an earlier phase and leaves that artifact approved", () => {
    const { session, themeRoutesId } = sessionAtTouchpointSelect();

    const res = applyCdfTransition({
      sessionId: session.sessionId,
      action: "select_route",
      routeIndex: 0,
      expectedVersion: session.sessionVersion,
      artifactId: themeRoutesId,
      artifactVersion: 1,
      artifactKey: "event-branding.theme-routes",
    });
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.match(res.error.message, /earlier step/i);
    assert.equal(
      getArtifact(themeRoutesId, { organizationId: ORG, projectId: PROJ }).status,
      "approved",
    );
    assert.equal(getCdfSession(session.sessionId)!.phaseId, "select-touchpoints");
  });
});
