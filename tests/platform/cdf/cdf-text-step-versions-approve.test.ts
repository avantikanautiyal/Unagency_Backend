/**
 * Text steps after the directions generate 3 versions of the same brief (one
 * per run, each its own fanout leaf). Approving must lock exactly the version
 * the user picked — not the first or the latest.
 */

import {
  applyCdfTransition,
  bindGeneratedArtifactToSession,
  createArtifact,
  getCdfSession,
  markValidated,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
} from "../../../src/platform/cdf";
import { bindMinimalGeneratedForApprove } from "./helpers/bind-minimal-generated-for-approve";

describe("CDF text step versions — approve the picked one", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
  });

  it("keeps all 3 version pins and approves exactly version 2", () => {
    const started = applyCdfTransition({ action: "start", serviceId: "brand-strategy", productMode: "ai" });
    if (!started.ok) throw new Error(started.error.message);
    const sessionId = started.value.session.sessionId;
    applyCdfTransition({ sessionId, action: "submit_brief", brief: "Strategy for CrunchO snacks" });
    applyCdfTransition({ sessionId, action: "select_route", routeIndex: 0 });
    expect(getCdfSession(sessionId)!.phaseId).toBe("messaging");

    // Upstream pins for the step (territories) via the shared helper.
    bindMinimalGeneratedForApprove(sessionId);

    const groupId = "versions_test";
    const versions = [1, 2, 3].map((n) => {
      const created = createArtifact({
        sessionId,
        serviceId: "brand-strategy",
        phaseId: "messaging",
        organizationId: "org_test",
        projectId: "proj_test",
        artifactKey: "brand-strategy.messaging",
        artifactType: "structured_doc",
        data: { body: `messaging version ${n}` } as never,
      });
      markValidated(created.artifact.artifactId, 1);
      const bound = bindGeneratedArtifactToSession({
        sessionId,
        phaseId: "messaging",
        artifactId: created.artifact.artifactId,
        version: 1,
        artifactKey: "brand-strategy.messaging",
        organizationId: "org_test",
        projectId: "proj_test",
        generationFanoutGroupId: groupId,
        generationFanoutTargetId: `${groupId}_v${n}`,
        generationFanoutLeaf: true,
        generationExecutionId: `exec_version_${n}`,
      });
      expect(bound.ok).toBe(true);
      return created.artifact.artifactId;
    });

    const pinned = (getCdfSession(sessionId)!.generatedArtifacts ?? []).map((r) => r.artifactId);
    for (const id of versions) expect(pinned).toContain(id);

    const approved = applyCdfTransition({
      sessionId,
      action: "approve",
      artifactId: versions[1],
      artifactVersion: 1,
      artifactKey: "brand-strategy.messaging",
      executionId: "exec_version_2",
      generationFanoutGroupId: groupId,
      generationFanoutTargetId: `${groupId}_v2`,
    });
    if (!approved.ok) throw new Error(approved.error.message);
    const approvedPins = (approved.value.session.approvedArtifacts ?? []).filter(
      (r) => r.artifactKey === "brand-strategy.messaging",
    );
    expect(approvedPins.map((r) => r.artifactId)).toEqual([versions[1]]);
    expect(approved.value.session.phaseId).toBe("final");
  });
});
