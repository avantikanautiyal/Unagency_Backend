/**
 * reopen_for_refine — from the final step, step back to the last approved
 * refinable phase so it can be refined and re-approved.
 */

import {
  applyCdfTransition,
  resetCdfSessionsForTests,
  resetCdfRequirementEngineForTests,
  resetCdfArtifactEngineForTests,
} from "../../../src/platform/cdf";
import { bindMinimalGeneratedForApprove } from "./helpers/bind-minimal-generated-for-approve";

function startAtFinal(): string {
  const started = applyCdfTransition({
    action: "start",
    serviceId: "social-media",
    productMode: "ai",
  });
  if (!started.ok) throw new Error("start failed");
  const sessionId = started.value.session.sessionId;
  applyCdfTransition({
    sessionId,
    action: "submit_brief",
    brief: "Create a mango drink post about everyday energy",
  });
  applyCdfTransition({ sessionId, action: "select_route", routeIndex: 0 });
  applyCdfTransition({ sessionId, action: "select_route", routeIndex: 1 });
  applyCdfTransition({
    sessionId,
    action: "select_route",
    routeIndex: 1,
    routeTitle: "Lifestyle Moment",
  });
  const bound = bindMinimalGeneratedForApprove(sessionId)!;
  const approved = applyCdfTransition({
    sessionId,
    action: "approve",
    artifactId: bound.artifactId,
    artifactVersion: bound.artifactVersion,
    artifactKey: bound.artifactKey,
    executionId: "exec_social_1",
  });
  if (!approved.ok) throw new Error("approve failed");
  expect(approved.value.session.phaseId).toBe("final");
  return sessionId;
}

describe("CDF reopen_for_refine", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
  });

  it("steps back from final to the approved visual phase and accepts refine", () => {
    const sessionId = startAtFinal();

    const reopened = applyCdfTransition({ sessionId, action: "reopen_for_refine" });
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    expect(reopened.value.session.phaseId).toBe("output");
    expect(reopened.value.session.status).toBe("active");
    expect(
      reopened.value.session.approved.some((a) => a.phaseId === "output"),
    ).toBe(false);
    expect(reopened.value.nextWork).toEqual({ kind: "none" });

    const refined = applyCdfTransition({
      sessionId,
      action: "refine",
      refinePrompt: "Make the logo smaller",
    });
    expect(refined.ok).toBe(true);
    if (!refined.ok) return;
    expect(refined.value.nextWork).toMatchObject({ kind: "refine", phaseId: "output" });
  });

  it("works after a final download completed the session", () => {
    const sessionId = startAtFinal();
    const downloaded = applyCdfTransition({
      sessionId,
      action: "final_action",
      finalAction: "Download",
    });
    expect(downloaded.ok).toBe(true);
    const reopened = applyCdfTransition({ sessionId, action: "reopen_for_refine" });
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    expect(reopened.value.session.phaseId).toBe("output");
  });

  it("is rejected before the final step", () => {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "social-media",
      productMode: "ai",
    });
    if (!started.ok) throw new Error("start failed");
    const sessionId = started.value.session.sessionId;
    applyCdfTransition({
      sessionId,
      action: "submit_brief",
      brief: "Create a mango drink post about everyday energy",
    });
    const res = applyCdfTransition({ sessionId, action: "reopen_for_refine" });
    expect(res.ok).toBe(false);
  });
});
