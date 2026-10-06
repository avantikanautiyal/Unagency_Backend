jest.mock("../../src/notifications/client-notification-service", () => ({
  dispatchClientNotification: jest.fn().mockResolvedValue({}),
}));
jest.mock(
  "../../src/platform/infrastructure/durability/mongo/models/enterprise-execution.model",
  () => ({ EnterpriseExecution: { countDocuments: jest.fn().mockResolvedValue(2) } })
);

import { notifyClientExecutionSucceeded } from "../../src/notifications/client-execution-notifications";
import { dispatchClientNotification as dispatch } from "../../src/notifications/client-notification-service";
import type { ExecutionResource } from "../../src/platform/api/contracts";

const dispatchClientNotification = dispatch as jest.Mock;

const userId = "64b7f0c2a1b2c3d4e5f60718";
const execution = (overrides: Partial<ExecutionResource>): ExecutionResource =>
  ({
    executionId: "exec_1",
    status: "succeeded",
    organizationId: "org",
    correlationId: "corr",
    createdAt: "",
    updatedAt: "",
    promptPreview: "",
    artifactIds: ["art_1"],
    userId,
    conversationId: "conv_1",
    ...overrides,
  }) as ExecutionResource;

describe("AI mode execution notifications", () => {
  beforeEach(() => dispatchClientNotification.mockClear());

  it("sends one routes-ready notification per route batch", async () => {
    await notifyClientExecutionSucceeded(
      null,
      execution({ productAction: "route_visual", parentExecutionId: "plan_1" })
    );
    expect(dispatchClientNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "AI_ROUTES_READY",
        dedupeKey: "routes:plan_1",
        primaryAction: { action: "/executions/exec_1" },
      })
    );
  });

  it("numbers creative drafts within the conversation", async () => {
    await notifyClientExecutionSucceeded(null, execution({ productAction: "generate" }));
    expect(dispatchClientNotification).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: "AI_CREATIVE_READY", variables: { "#": 2 } })
    );
  });

  it("treats refinements as revisions and uses stored fields from earlier saves", async () => {
    await notifyClientExecutionSucceeded(
      { userId, productAction: "route_visual_refine" },
      execution({ userId: undefined })
    );
    expect(dispatchClientNotification).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: "AI_REVISION_READY" })
    );
  });

  it("ignores planning, chat and output-less executions", async () => {
    await notifyClientExecutionSucceeded(null, execution({ productAction: "visual_direction" }));
    await notifyClientExecutionSucceeded(null, execution({}));
    await notifyClientExecutionSucceeded(
      null,
      execution({ productAction: "generate", artifactIds: [] })
    );
    expect(dispatchClientNotification).not.toHaveBeenCalled();
  });
});
