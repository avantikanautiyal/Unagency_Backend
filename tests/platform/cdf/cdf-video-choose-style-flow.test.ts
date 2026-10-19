import { applyCdfTransition, resetCdfSessionsForTests } from "../../../src/platform/cdf";
import {
  approveWithCanonicalCompletion,
  bindMinimalGeneratedForApprove,
} from "./helpers/bind-minimal-generated-for-approve";

function selectPinned(sessionId: string, routeIndex: number) {
  const bound = bindMinimalGeneratedForApprove(sessionId);
  return applyCdfTransition({
    sessionId,
    action: "select_route",
    routeIndex,
    ...(bound ? { artifactId: bound.artifactId, artifactVersion: bound.artifactVersion } : {}),
  });
}

function startVideos(): string {
  const started = applyCdfTransition({ action: "start", serviceId: "videos", productMode: "ai" });
  if (!started.ok) throw new Error(started.error.message);
  const sessionId = started.value.session.sessionId;
  applyCdfTransition({ sessionId, action: "submit_brief", brief: "15s product launch film" });
  return sessionId;
}

describe("Videos: Choose Style step", () => {
  beforeEach(() => resetCdfSessionsForTests());

  it("scripted path: storyboard → Choose Style → animation", () => {
    const sessionId = startVideos();
    expect(applyCdfTransition({ sessionId, action: "select_route", routeIndex: 1 }).ok).toBe(true);
    expect(selectPinned(sessionId, 0).ok).toBe(true); // script routes
    const script = approveWithCanonicalCompletion(sessionId);
    expect(script.ok && script.value.session.phaseId).toBe("storyboard");
    const storyboard = approveWithCanonicalCompletion(sessionId);
    expect(storyboard.ok && storyboard.value.session.phaseId).toBe("style-preview");
    expect(storyboard.ok && storyboard.value.nextWork).toMatchObject({
      kind: "generate",
      phaseId: "style-preview",
    });
    const style = approveWithCanonicalCompletion(sessionId);
    expect(style.ok && style.value.session.phaseId).toBe("animation");
  });

  it("direct path skips script, storyboard and Choose Style", () => {
    const sessionId = startVideos();
    const direct = applyCdfTransition({ sessionId, action: "select_route", routeIndex: 2 });
    expect(direct.ok && direct.value.session.phaseId).toBe("animation");
  });
});
