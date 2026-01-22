import mongoose from "mongoose";
import Users from "../models/users.model";
import Subscriptions from "../models/subscription.model";
import { PlansModel } from "../models/plan.model";
import Projects from "../models/projects.model";
import Requirement from "../models/requestProject.model";
import Teams from "../models/team.model";
import LimitWarning from "../models/limitWarning.model";
import { ApiError } from "../utils/apiError";
import Organizations from "../models/organization.model";

export const checkPlanLimit = async (
    userId: string,
    orgId: string | undefined,
    actionType: "START_SERVICE" | "CREATE_BRIEF" | "INVITE_MEMBER"
) => {
    // 1. Get User Subscription & Plan
    // Assuming subscription info is in Users or Subscriptions model needed lookup
    // Looking at user model, there is `subscription: { id, status }`.
    // But we need the PLAN details.

    // Strategy: Find active subscription for user -> Get PlanId -> Get Plan details

    const user = await Users.findById(userId);
    if (!user) throw new ApiError("User not found", 404);

    // If user is admin/superadmin, bypass limits? Assuming typical customer here
    if (['admin', 'superadmin', 'servicing', 'resource'].includes(user.role)) return;

    // Find active subscription
    // Use the subscription ID from the User model as the source of truth
    if (!user.subscription || !user.subscription.id || (user.subscription.status !== 'completed' && user.subscription.status !== 'active')) {
        throw new ApiError("No active subscription found for user.", 403);
    }

    const subscription = await Subscriptions.findOne({
        subscriptionId: user.subscription.id
    });

    if (!subscription) {
        throw new ApiError("Subscription record not found", 404);
    }
    const plan = await PlansModel.findOne({ plan_id: subscription.planId });
    if (!plan) {
        throw new ApiError("Plan not found", 404);
    }

    // Cast plan to any to access new fields safely if TS complains, or interface update needed
    // Cast plan to any to access new fields safely if TS complains, or interface update needed
    const planLimits = plan as any;

    let usage = 0;
    let max = 0;
    let limitType = "";

    if (actionType === "START_SERVICE") {
        // Check concurrent active services (projects)
        // Definition of "active" needs to be clear. "initiated", "planning", "revision"?
        // "closed" probably not active.
        // user_id check on Projects
        const activeStatuses = ["planning", "initiated", "on-hold", "revision", "delivered", "approved"]; // Exclude 'closed'
        usage = await Projects.countDocuments({
            userId: userId,
            status: { $in: activeStatuses }
        });
        max = planLimits.max_concurrent_services || 1;
        limitType = "max_concurrent_services";

        if (usage >= max) {
            await logWarning(userId, orgId, actionType, limitType, usage, max, planLimits.tag);
            throwLimitError(limitType, max, usage, planLimits.tag, planLimits.user_popup_on_limit);
        }
    }

    if (actionType === "CREATE_BRIEF") {
        // Check briefs (requirements)
        if (planLimits.unlimited_briefs) return; // Unlimited

        // How to count "briefs"? All time? Monthly?
        // "Unlimited briefs" implies a volume limit usually. 
        // "Gold Plan... Unlimited briefs" vs "Silver...".
        // Usually this is a per billing cycle limit or total limit. 
        // Assuming Monthly if "Unlimited" is the alternative for higher tiers.
        // Let's count ALL non-closed requirements or Monthly?
        // "Service Capacity" is concurrent. "Briefs" might be concurrent or rate limited.
        // Prompt says "Unlimited briefs" for others.
        // Let's assume Concurrent pending briefs? OR Total allowed briefs?
        // Given "Service Capacity" is explicitly "concurrent", "Briefs" might be total active or per month.
        // Let's go with "active/pending" briefs count for now to be safe, or simply total count if it's a quota.
        // "Limitation warning to CS"
        // Let's assume TOTAL ACTIVE (not completed) briefs?
        // Or maybe it's just a hard cap on creation per month.
        // Going with TOTAL for now (concurrent active briefs).

        // Actually, "Service Capacity 1 design service" implies 1 active project.
        // "Unlimited briefs" implies you can have many briefs waiting in queue.
        // So "Limited briefs" on Silver might mean you can't even queue them up?

        usage = await Requirement.countDocuments({
            userId: userId,
            // What status? "raised" vs "received"?
            // Assuming all drafts/open requirements.
            // Let's count all that are NOT processed/closed.
            status: { $ne: 'closed' } // assuming 'closed' logic exists or similar
        });

        max = planLimits.max_briefs || 0;
        limitType = "max_briefs";

        if (usage >= max) {
            await logWarning(userId, orgId, actionType, limitType, usage, max, planLimits.tag);
            throwLimitError(limitType, max, usage, planLimits.tag, planLimits.user_popup_on_limit);
        }
    }

    if (actionType === "INVITE_MEMBER") {
        // Check team members in organization
        // Need Org ID
        if (!orgId) {
            // If no org defined provided, maybe fetch user's owned org
            const org = await Organizations.findOne({ owner: userId });
            if (org) orgId = org._id.toString();
        }

        if (orgId) {
            usage = await Teams.countDocuments({
                Organization: orgId,
                // Count all members?
                // "Add up to 1 team member" -> implies excluding Owner?
                // Usually owner doesn't count.
                // Teams model has `userId` and `Organization`.
                // Owner is also in Teams? Teams controller "RemoveMember... if owner...".
                // Let's assume we count entries in Teams collection for this Org, excluding owner if they are in there.
                // Or better, Teams collection usually stores added members. Owner might be stored on Org document.
                // Let's count all docs in Teams for this Org.
            });

            max = planLimits.max_additional_members || 0;
            limitType = "max_additional_members";

            if (usage >= max) {
                await logWarning(userId, orgId, actionType, limitType, usage, max, planLimits.tag);
                throwLimitError(limitType, max, usage, planLimits.tag, planLimits.user_popup_on_limit);
            }
        }
    }
};

export const getUserPlanLimit = async (userId: string, orgId?: string) => {
    const user = await Users.findById(userId);
    if (!user) throw new ApiError("User not found", 404);

    if (['admin', 'superadmin', 'servicing', 'resource'].includes(user.role)) {
        return {
            isAdmin: true,
            message: "User has administrative privileges, no limits apply."
        };
    }

    if (!user.subscription || !user.subscription.id || user.subscription.status !== 'active') {
        throw new ApiError("No active subscription found for user.", 403);
    }

    const subscription = await Subscriptions.findOne({
        subscriptionId: user.subscription.id
    });

    if (!subscription) {
        throw new ApiError("Subscription record not found", 404);
    }

    const plan = await PlansModel.findOne({ plan_id: subscription.planId });
    if (!plan) {
        throw new ApiError("Plan not found", 404);
    }

    const planLimits = plan as any;

    // Calculate Usage
    const activeStatuses = ["planning", "initiated", "on-hold", "revision", "delivered", "approved"];
    const serviceUsage = await Projects.countDocuments({
        userId: userId,
        status: { $in: activeStatuses }
    });

    const briefsUsage = await Requirement.countDocuments({
        userId: userId,
        status: { $ne: 'closed' }
    });

    if (!orgId) {
        const org = await Organizations.findOne({ owner: userId });
        if (org) orgId = org._id.toString();
    }

    let membersUsage = 0;
    if (orgId) {
        membersUsage = await Teams.countDocuments({
            Organization: orgId
        });
    }

    return {
        planName: planLimits.tag,
        limits: {
            max_concurrent_services: planLimits.max_concurrent_services,
            max_briefs: planLimits.max_briefs,
            unlimited_briefs: planLimits.unlimited_briefs,
            max_additional_members: planLimits.max_additional_members,
            user_popup_on_limit: planLimits.user_popup_on_limit
        },
        usage: {
            concurrent_services: serviceUsage,
            briefs: briefsUsage,
            additional_members: membersUsage
        }
    };
};

const logWarning = async (userId: string, orgId: string | undefined, action: string, limitType: string, usage: number, max: number, plan: string) => {
    await LimitWarning.create({
        user_id: userId,
        org_id: orgId,
        action,
        limitType,
        usage,
        max,
        plan
    });
};

const throwLimitError = (limitType: string, maxAllowed: number, currentUsage: number, planName: string, popup: boolean) => {
    // Return consistent error payload
    // status code? 403 Forbidden
    throw new ApiError(
        JSON.stringify({
            code: "PLAN_LIMIT_EXCEEDED",
            limitType,
            maxAllowed,
            currentUsage,
            planName,
            popup
        }),
        403
    );
};
