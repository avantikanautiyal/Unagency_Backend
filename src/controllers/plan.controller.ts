import { RequestUser } from "../types/user";
import { ApiResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/apiError";
import { PlansModel } from "../models/plan.model";
import { getUserPlanLimit } from "../services/planLimit.service";

// Customer checking their own plan limit
export const checkUserPlanLimit = asyncHandler(async (req: RequestUser, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        throw new ApiError("User not found in request", 401);
    }

    const limits = await getUserPlanLimit(userId.toString());
    return res.status(200).json(new ApiResponse(200, limits, "User plan limits fetched successfully"));
});

// Admin/Staff checking a customer's plan limit
export const checkUserPlanLimitByUserId = asyncHandler(async (req: RequestUser, res) => {
    // Check if admin or staff
    const allowedRoles = ['admin', 'superadmin', 'servicing', 'resource'];
    if (!req.user || !allowedRoles.includes(req.user.role)) {
        throw new ApiError("Unauthorized access", 403);
    }

    const { userId } = req.params;
    if (!userId) {
        throw new ApiError("User ID is required", 400);
    }

    const limits = await getUserPlanLimit(userId);
    return res.status(200).json(new ApiResponse(200, limits, "Customer plan limits fetched successfully"));
});

// Admin Only - Middleware should ensure this, or check role here
export const getAllPlans = asyncHandler(async (req: RequestUser, res) => {
    // Optional: Check if admin
    if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
        throw new ApiError("Unauthorized", 403);
    }

    const plans = await PlansModel.find({});
    return new ApiResponse(200, plans, "Plans fetched successfully");
});

export const updatePlanLimits = asyncHandler(async (req: RequestUser, res) => {
    // Optional: Check if admin
    if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
        throw new ApiError("Unauthorized", 403);
    }

    const { id } = req.params;
    const {
        max_concurrent_services,
        max_briefs,
        unlimited_briefs,
        max_additional_members,
        user_popup_on_limit
    } = req.body;

    // Validate inputs if needed

    const updatedPlan = await PlansModel.findByIdAndUpdate(id, {
        $set: {
            max_concurrent_services,
            max_briefs,
            unlimited_briefs,
            max_additional_members,
            user_popup_on_limit
        }
    }, { new: true });

    if (!updatedPlan) {
        throw new ApiError("Plan not found", 404);
    }

    return new ApiResponse(200, updatedPlan, "Plan limits updated successfully");
});
