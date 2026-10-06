jest.mock("../../src/notifications/client-notification-service", () => ({
  dispatchClientNotification: jest.fn().mockResolvedValue({}),
}));
jest.mock("../../src/models/projects.model", () => ({
  __esModule: true,
  default: { findById: jest.fn() },
}));

import Projects from "../../src/models/projects.model";
import { dispatchClientNotification as dispatch } from "../../src/notifications/client-notification-service";
import { notifyProjectOwner } from "../../src/notifications/client-project-notifications";

const dispatchClientNotification = dispatch as jest.Mock;
const findById = Projects.findById as jest.Mock;
const projectId = "64b7f0c2a1b2c3d4e5f60718";
const ownerId = "64b7f0c2a1b2c3d4e5f60719";

function mockProject(project: Record<string, unknown> | null) {
  findById.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(project) }),
  });
}

describe("notifyProjectOwner", () => {
  beforeEach(() => dispatchClientNotification.mockClear());

  it("uses Human copy for human projects", async () => {
    mockProject({ userId: ownerId, title: "Launch", creationMode: "human" });
    await notifyProjectOwner({
      projectId,
      events: { human: "DRAFT_SENT_TO_CLIENT", hybrid: "EXPERT_DRAFT_READY" },
      dedupeKey: "k",
    });
    expect(dispatchClientNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "DRAFT_SENT_TO_CLIENT",
        userId: ownerId,
        variables: { "Project Name": "Launch" },
        primaryAction: { action: `/progress?projectId=${projectId}` },
      })
    );
  });

  it("uses Hybrid copy for hybrid projects and skips events without a Hybrid row", async () => {
    mockProject({ userId: ownerId, title: "Launch", creationMode: "hybrid" });
    await notifyProjectOwner({
      projectId: { _id: projectId },
      events: { human: "CLIENT_APPROVED", hybrid: "HYBRID_APPROVED" },
      dedupeKey: "k",
    });
    await notifyProjectOwner({
      projectId,
      events: { human: "RESOURCE_ASSIGNED", hybrid: null },
      dedupeKey: "k",
    });
    expect(dispatchClientNotification).toHaveBeenCalledTimes(1);
    expect(dispatchClientNotification).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: "HYBRID_APPROVED" })
    );
  });

  it("never throws when the project lookup fails", async () => {
    findById.mockImplementation(() => {
      throw new Error("db down");
    });
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      notifyProjectOwner({
        projectId,
        events: { human: "CLIENT_APPROVED", hybrid: null },
        dedupeKey: "k",
      })
    ).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
