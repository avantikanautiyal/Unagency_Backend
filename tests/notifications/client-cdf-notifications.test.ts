jest.mock("../../src/notifications/client-notification-service", () => ({
  dispatchClientNotification: jest.fn().mockResolvedValue({}),
}));
jest.mock("../../src/models/projects.model", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => ({
      select: () => ({ lean: () => Promise.resolve({ title: "Launch" }) }),
    })),
  },
}));

import { dispatchClientNotification as dispatch } from "../../src/notifications/client-notification-service";
import { notifyCdfTransition } from "../../src/notifications/client-cdf-notifications";

const dispatchClientNotification = dispatch as jest.Mock;
const userId = "64b7f0c2a1b2c3d4e5f60719";
const projectId = "64b7f0c2a1b2c3d4e5f60718";
const events = () => dispatchClientNotification.mock.calls.map(([input]) => input.eventKey);

describe("notifyCdfTransition", () => {
  beforeEach(() => dispatchClientNotification.mockClear());

  it("sends approval and the one-time first-creative milestone", async () => {
    await notifyCdfTransition({ userId, ok: true, action: "approve", projectId, artifactId: "cdfart_1", artifactVersion: 2 });
    expect(events()).toEqual(["AI_CREATIVE_APPROVED", "FIRST_CREATIVE_COMPLETED"]);
    expect(dispatchClientNotification.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        variables: { "Project Name": "Launch" },
        dedupeKey: "approve:cdfart_1@2",
      })
    );
    expect(dispatchClientNotification.mock.calls[1][0].dedupeKey).toBe("first-creative");
  });

  it("distinguishes brief refinement from creative feedback", async () => {
    await notifyCdfTransition({ userId, ok: true, action: "refine", refineScope: "brief", requestId: "r1" });
    await notifyCdfTransition({ userId, ok: true, action: "refine", requestId: "r2" });
    expect(events()).toEqual(["REFINED_BRIEF_SUBMITTED", "AI_FEEDBACK_SUBMITTED"]);
  });

  it("asks for membership when a Studio handoff is blocked by plan", async () => {
    await notifyCdfTransition({ userId, ok: false, action: "handoff_studio", errorMessage: "Membership required", sessionId: "s1" });
    await notifyCdfTransition({ userId, ok: false, action: "approve", errorMessage: "Stale version" });
    expect(events()).toEqual(["STUDIO_ACCESS_REQUIRED"]);
  });

  it("only treats free download actions as free downloads", async () => {
    await notifyCdfTransition({ userId, ok: true, action: "final_action", finalAction: "Download" });
    await notifyCdfTransition({ userId, ok: true, action: "final_action", finalAction: "Download HD" });
    await notifyCdfTransition({ userId, ok: true, action: "final_action", finalAction: "Another size" });
    expect(events()).toEqual(["FREE_DOWNLOAD_READY"]);
  });
});
