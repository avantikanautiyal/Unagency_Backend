import { checkPlanLimit } from "../src/services/planLimit.service";
import Users from "../src/models/users.model";
import Subscriptions from "../src/models/subscription.model";
import { PlansModel } from "../src/models/plan.model";
import Projects from "../src/models/projects.model";
import Requirement from "../src/models/requestProject.model";
import Teams from "../src/models/team.model";
import LimitWarning from "../src/models/limitWarning.model";
import { ApiError } from "../src/utils/apiError";

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

    it("should allow admin to bypass limits", async () => {
        (Users.findById as jest.Mock).mockResolvedValue({ role: "admin" });
        await expect(checkPlanLimit(mockUserId, mockOrgId, "START_SERVICE")).resolves.not.toThrow();
    });

    it("should throw error if user has no subscription", async () => {
        (Users.findById as jest.Mock).mockResolvedValue({ role: "customer" });
        (Subscriptions.findOne as jest.Mock).mockResolvedValue(null);

        await expect(checkPlanLimit(mockUserId, mockOrgId, "START_SERVICE")).rejects.toThrow("No active subscription found");
    });

    it("should throw error if limit exceeded for START_SERVICE", async () => {
        (Users.findById as jest.Mock).mockResolvedValue({ role: "customer" });
        (Subscriptions.findOne as jest.Mock).mockResolvedValue({ planId: "plan1" });
        (PlansModel.findOne as jest.Mock).mockResolvedValue({
            plan_id: "plan1",
            max_concurrent_services: 1,
            tag: "bronze",
            user_popup_on_limit: false
        });
        (Projects.countDocuments as jest.Mock).mockResolvedValue(1); // Usage matches max (1 limit means 1 allowed? "Capacity 1" means you can run 1. If usage is 1, can you start another? No. Usage=1 means 1 active. Starting another makes 2.)

        // Code check usage >= max. If max is 1, and usage is 1, then limit exceeded. Correct.

        await expect(checkPlanLimit(mockUserId, mockOrgId, "START_SERVICE")).rejects.toThrow(/PLAN_LIMIT_EXCEEDED/);
        expect(LimitWarning.create).toHaveBeenCalled();
    });

    it("should allow START_SERVICE if below limit", async () => {
        (Users.findById as jest.Mock).mockResolvedValue({ role: "customer" });
        (Subscriptions.findOne as jest.Mock).mockResolvedValue({ planId: "plan1" });
        (PlansModel.findOne as jest.Mock).mockResolvedValue({
            plan_id: "plan1",
            max_concurrent_services: 2,
            tag: "silver"
        });
        (Projects.countDocuments as jest.Mock).mockResolvedValue(1); // 1 active, limit 2. Allowed.

        await expect(checkPlanLimit(mockUserId, mockOrgId, "START_SERVICE")).resolves.not.toThrow();
        expect(LimitWarning.create).not.toHaveBeenCalled();
    });

    it("should enforce brief limits if NOT unlimited", async () => {
        (Users.findById as jest.Mock).mockResolvedValue({ role: "customer" });
        (Subscriptions.findOne as jest.Mock).mockResolvedValue({ planId: "plan1" });
        (PlansModel.findOne as jest.Mock).mockResolvedValue({
            plan_id: "plan1",
            max_briefs: 5,
            unlimited_briefs: false,
            tag: "silver"
        });
        (Requirement.countDocuments as jest.Mock).mockResolvedValue(5);

        await expect(checkPlanLimit(mockUserId, mockOrgId, "CREATE_BRIEF")).rejects.toThrow(/PLAN_LIMIT_EXCEEDED/);
    });

    it("should allow unlimited briefs", async () => {
        (Users.findById as jest.Mock).mockResolvedValue({ role: "customer" });
        (Subscriptions.findOne as jest.Mock).mockResolvedValue({ planId: "plan1" });
        (PlansModel.findOne as jest.Mock).mockResolvedValue({
            plan_id: "plan1",
            max_briefs: 0,
            unlimited_briefs: true,
            tag: "bronze"
        });
        (Requirement.countDocuments as jest.Mock).mockResolvedValue(100);

        await expect(checkPlanLimit(mockUserId, mockOrgId, "CREATE_BRIEF")).resolves.not.toThrow();
    });

    it("should enforce team member limits", async () => {
        (Users.findById as jest.Mock).mockResolvedValue({ role: "customer" });
        (Subscriptions.findOne as jest.Mock).mockResolvedValue({ planId: "plan1" });
        (PlansModel.findOne as jest.Mock).mockResolvedValue({
            plan_id: "plan1",
            max_additional_members: 1,
            tag: "silver"
        });
        (Teams.countDocuments as jest.Mock).mockResolvedValue(1);

        await expect(checkPlanLimit(mockUserId, mockOrgId, "INVITE_MEMBER")).rejects.toThrow(/PLAN_LIMIT_EXCEEDED/);
    });
});
