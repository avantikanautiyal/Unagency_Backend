/**
 * Regression (ad-campaigns channel-select): a static config gate must accept a
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

function sessionAtChannelSelect() {
  const started = applyCdfTransition({
    action: "start",
    serviceId: "ad-campaigns",
    productMode: "ai",
    organizationId: ORG,
    projectId: PROJ,
  });
  if (!started.ok) throw new Error(started.error.message);
  const briefed = applyCdfTransition({
    sessionId: started.value.session.sessionId,
    action: "submit_brief",
    brief: "Instagram ad for marketing agencies needing a tech partner",
    expectedVersion: started.value.session.sessionVersion,
  });
  if (!briefed.ok) throw new Error(briefed.error.message);

  const sessionId = briefed.value.session.sessionId;
  const masterKv = createArtifact({
    sessionId,
    serviceId: "ad-campaigns",
    phaseId: "master-kv",
    organizationId: ORG,
    projectId: PROJ,
    artifactKey: "ad-campaigns.master-kv",
    artifactType: "image",
    data: { imageUri: "https://example.test/kv.png" },
  });
  const masterKvId = masterKv.artifact.artifactId;

  let session = getCdfSession(sessionId)!;
  const phaseIndex = briefed.value.config.phases.findIndex(
    (p) => p.id === "channel-select",
  );
  assert.ok(phaseIndex >= 0);
  session = applyArtifactEngineOnApprove({
    session,
    phaseId: "master-kv",
    artifactId: masterKvId,
    artifactVersion: 1,
    artifactKey: "ad-campaigns.master-kv",
    organizationId: ORG,
    projectId: PROJ,
  });
  session = {
    ...session,
    phaseIndex,
    phaseId: "channel-select",
    status: "active",
    approved: [
      ...session.approved,
      {
        phaseId: "master-kv",
        approvedAt: new Date().toISOString(),
        artifactId: masterKvId,
        artifactVersion: 1,
      },
    ],
    sessionVersion: session.sessionVersion + 1,
  };
  persistCdfSession(session);
  return { session: getCdfSession(sessionId)!, masterKvId };
}

describe("CDF config gate select after upstream canonical refs", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
  });

  it("selects a channel without an exact pin", () => {
    const { session } = sessionAtChannelSelect();
    assert.ok((session.approvedArtifacts?.length ?? 0) > 0);

    const res = applyCdfTransition({
      sessionId: session.sessionId,
      action: "select_route",
      routeIndex: 0,
      routeLabel: "Social",
      routeTitle: "Social",
      expectedVersion: session.sessionVersion,
    });
    if (!res.ok) throw new Error(res.error.message);
    const pick = res.value.session.selected.find(
      (s) => s.phaseId === "channel-select",
    );
    assert.equal(pick?.selectedRouteLabel, "Social");
    assert.notEqual(res.value.session.phaseId, "channel-select");
  });

  it("rejects a stale pin from an earlier phase and leaves that artifact approved", () => {
    const { session, masterKvId } = sessionAtChannelSelect();

    const res = applyCdfTransition({
      sessionId: session.sessionId,
      action: "select_route",
      routeIndex: 0,
      expectedVersion: session.sessionVersion,
      artifactId: masterKvId,
      artifactVersion: 1,
      artifactKey: "ad-campaigns.master-kv",
    });
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.match(res.error.message, /earlier step/i);
    assert.equal(
      getArtifact(masterKvId, { organizationId: ORG, projectId: PROJ }).status,
      "approved",
    );
    assert.equal(getCdfSession(session.sessionId)!.phaseId, "channel-select");
  });
});
