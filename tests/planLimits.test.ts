import { checkPlanLimit } from "../src/services/planLimit.service";
import Users from "../src/models/users.model";

jest.mock("../src/models/users.model");
jest.mock("../src/models/subscription.model");
jest.mock("../src/models/plan.model");
jest.mock("../src/models/projects.model");
jest.mock("../src/models/requestProject.model");
jest.mock("../src/models/team.model");
jest.mock("../src/models/limitWarning.model");

describe("Plan Limits Service", () => {
  const mockUserId = "user123";
  const mockOrgId = "org123";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not enforce plan limits while PLAN_LIMITS_ENABLED is false", async () => {
    (Users.findById as jest.Mock).mockResolvedValue({ role: "customer" });
    await expect(
      checkPlanLimit(mockUserId, mockOrgId, "START_SERVICE")
    ).resolves.not.toThrow();
    await expect(
      checkPlanLimit(mockUserId, mockOrgId, "CREATE_BRIEF")
    ).resolves.not.toThrow();
    await expect(
      checkPlanLimit(mockUserId, mockOrgId, "INVITE_MEMBER")
    ).resolves.not.toThrow();
    // No DB lookups while enforcement is off
    expect(Users.findById).not.toHaveBeenCalled();
  });
});
