jest.mock("../../src/notifications/client-notification-service", () => ({
  dispatchClientNotification: jest.fn().mockResolvedValue({}),
}));

const lean = <T,>(value: T) => ({ select: () => ({ lean: () => Promise.resolve(value) }) });
const mockSnapshot = jest.fn();
const mockGovernance = jest.fn();
const mockGroupMembers = jest.fn();
const mockSiblings = jest.fn();
const mockProject = jest.fn();

jest.mock(
  "../../src/platform/infrastructure/durability/mongo/models/enterprise-execution.model",
  () => ({ EnterpriseExecution: { find: () => lean(mockSiblings()) } })
);
jest.mock(
  "../../src/platform/infrastructure/durability/mongo/models/enterprise-execution-extras.model",
  () => ({
    EnterpriseExecutionExtras: {
      findOne: () => lean({ createMetadataSnapshot: mockSnapshot(), governance: mockGovernance() }),
      find: () => lean(mockGroupMembers()),
      distinct: () => Promise.resolve(["g1", "g2"]),
    },
  })
);
jest.mock("../../src/models/projects.model", () => ({
  __esModule: true,
  default: { findOne: () => lean(mockProject()) },
}));

import { notifyClientExecutionFinished } from "../../src/notifications/client-execution-notifications";
import { dispatchClientNotification as dispatch } from "../../src/notifications/client-notification-service";
import type { ExecutionResource } from "../../src/platform/api/contracts";

const dispatchClientNotification = dispatch as jest.Mock;

const userId = "64b7f0c2a1b2c3d4e5f60718";
const projectId = "64b7f0c2a1b2c3d4e5f60799";
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
    productAction: "generate",
    ...overrides,
  }) as ExecutionResource;

describe("AI / Hybrid execution notifications", () => {
  beforeEach(() => {
    dispatchClientNotification.mockClear();
    mockSnapshot.mockReturnValue({});
    mockGovernance.mockReturnValue({ checks: [{ checkId: "brand_guard", status: "PASS", message: "PASS: ok" }] });
    mockGroupMembers.mockReturnValue([]);
    mockSiblings.mockReturnValue([]);
    mockProject.mockReturnValue(null);
  });

  it("sends one routes-ready per fan-out group for a CDF routes phase", async () => {
    mockSnapshot.mockReturnValue({ cdfPhaseId: "routes", generationFanoutGroupId: "fan_1", cdfSessionId: "cdf_1" });
    mockProject.mockReturnValue({ _id: projectId, title: "Launch", creationMode: "ai" });
    await notifyClientExecutionFinished(null, execution({}));
    expect(dispatchClientNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "AI_ROUTES_READY",
        dedupeKey: "routes:fan_1",
        primaryAction: { action: `/progress?projectId=${projectId}` },
      })
    );
  });

  it("uses Hybrid copy for routes in a hybrid project", async () => {
    mockSnapshot.mockReturnValue({ cdfPhaseId: "copy-routes", cdfSessionId: "cdf_1" });
    mockProject.mockReturnValue({ _id: projectId, creationMode: "hybrid" });
    await notifyClientExecutionFinished(null, execution({}));
    expect(dispatchClientNotification).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: "HYBRID_AI_ROUTES_READY" })
    );
  });

  it("numbers creative drafts by delivered steps", async () => {
    mockSnapshot.mockReturnValue({ cdfPhaseId: "creative", generationFanoutGroupId: "g2" });
    await notifyClientExecutionFinished(null, execution({}));
    expect(dispatchClientNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "AI_CREATIVE_READY",
        dedupeKey: "creative:g2",
        variables: expect.objectContaining({ "#": 2 }),
      })
    );
  });

  it("treats CDF refines and legacy refine actions as revisions", async () => {
    mockSnapshot.mockReturnValue({ cdfPhaseId: "creative", cdfRefineSource: true });
    await notifyClientExecutionFinished(null, execution({}));
    await notifyClientExecutionFinished(
      { userId, productAction: "route_visual_refine" },
      execution({ userId: undefined, productAction: undefined, executionId: "exec_2" })
    );
    const keys = dispatchClientNotification.mock.calls.map((c) => c[0].eventKey);
    expect(keys).toEqual(["AI_REVISION_READY", "AI_REVISION_READY"]);
  });

  it("reports a failure only when no engine in the group delivered", async () => {
    mockSnapshot.mockReturnValue({ generationFanoutGroupId: "fan_9" });
    mockSiblings.mockReturnValue([{ executionId: "exec_b", status: "succeeded", artifactIds: ["a"] }]);
    mockGroupMembers.mockReturnValue([{ executionId: "exec_b" }]);
    await notifyClientExecutionFinished(null, execution({ status: "failed", artifactIds: [] }));
    expect(dispatchClientNotification).not.toHaveBeenCalled();

    mockSiblings.mockReturnValue([{ executionId: "exec_b", status: "failed" }]);
    await notifyClientExecutionFinished(null, execution({ status: "failed", artifactIds: [] }));
    expect(dispatchClientNotification).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: "AI_GENERATION_FAILED", dedupeKey: "failed:fan_9" })
    );
  });

  it("warns when brand_guard passed with warnings", async () => {
    mockSnapshot.mockReturnValue({ cdfPhaseId: "creative", generationFanoutGroupId: "g7" });
    mockGovernance.mockReturnValue({
      checks: [{ checkId: "brand_guard", status: "PASS", message: "PASS_WITH_WARNINGS: LOGO_MISSING" }],
    });
    await notifyClientExecutionFinished(null, execution({}));
    const keys = dispatchClientNotification.mock.calls.map((c) => c[0].eventKey);
    expect(keys).toEqual(["BRANDGUARD_WARNING", "AI_CREATIVE_READY"]);
  });

  it("ignores planning, chat and output-less executions", async () => {
    await notifyClientExecutionFinished(null, execution({ productAction: "visual_direction" }));
    await notifyClientExecutionFinished(null, execution({ productAction: undefined }));
    await notifyClientExecutionFinished(null, execution({ artifactIds: [] }));
    expect(dispatchClientNotification).not.toHaveBeenCalled();
  });
});
