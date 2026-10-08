/**
 * reopen_route_selection — after a stopped generation, step back to the routes
 * phase so a different route can be selected.
 */

import {
  applyCdfTransition,
  resetCdfSessionsForTests,
  resetCdfRequirementEngineForTests,
  resetCdfArtifactEngineForTests,
} from "../../../src/platform/cdf";

function startAtOutput(): string {
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
  const selected = applyCdfTransition({
    sessionId,
    action: "select_route",
    routeIndex: 0,
    routeTitle: "Bold Product Hero",
  });
  if (!selected.ok) throw new Error("select failed");
  expect(selected.value.session.phaseId).toBe("output");
  return sessionId;
}

describe("CDF reopen_route_selection", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
  });

  it("steps back to the routes phase and accepts a different route", () => {
    const sessionId = startAtOutput();

    const reopened = applyCdfTransition({
      sessionId,
      action: "reopen_route_selection",
      phaseId: "routes",
    });
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    expect(reopened.value.session.phaseId).toBe("routes");
    expect(
      reopened.value.session.selected.some((s) => s.phaseId === "routes"),
    ).toBe(false);
    expect(reopened.value.ui.allowedActions).toContain("select_route");

    const reselected = applyCdfTransition({
      sessionId,
      action: "select_route",
      routeIndex: 1,
      routeTitle: "Lifestyle Moment",
    });
    expect(reselected.ok).toBe(true);
    if (!reselected.ok) return;
    expect(reselected.value.session.phaseId).toBe("output");
    expect(reselected.value.session.masters.routeTitle).toBe("Lifestyle Moment");
    const routeSel = reselected.value.session.selected.filter(
      (s) => s.phaseId === "routes",
    );
    expect(routeSel).toHaveLength(1);
    expect(routeSel[0]!.selectedRouteIndex).toBe(1);
  });

  it("is rejected when the current phase does not follow a selected routes phase", () => {
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
    const res = applyCdfTransition({
      sessionId,
      action: "reopen_route_selection",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect((res.error as { cdfCode?: string }).cdfCode).toBe("ACTION_NOT_ALLOWED");
  });

  it("is rejected when phaseId names a different routes phase", () => {
    const sessionId = startAtOutput();
    const res = applyCdfTransition({
      sessionId,
      action: "reopen_route_selection",
      phaseId: "platform",
    });
    expect(res.ok).toBe(false);
  });
});
