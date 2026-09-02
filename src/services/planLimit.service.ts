import Users from "../models/users.model";
import Subscriptions from "../models/subscription.model";
import { PlansModel } from "../models/plan.model";
import Projects from "../models/projects.model";
import Requirement from "../models/requestProject.model";
import Teams from "../models/team.model";
import LimitWarning from "../models/limitWarning.model";
import { ApiError } from "../utils/apiError";
import Organizations from "../models/organization.model";

/**
 * Plan enforcement is intentionally disabled for now.
 * Re-enable by restoring the body of this function from git history / PLAN_LIMITS_ENABLED.
 * Call sites may keep invoking this so future roll-out is a one-place change.
 */
const PLAN_LIMITS_ENABLED = false;

export const checkPlanLimit = async (
  _userId: string,
  _orgId: string | undefined,
  _actionType: "START_SERVICE" | "CREATE_BRIEF" | "INVITE_MEMBER"
) => {
  if (!PLAN_LIMITS_ENABLED) return;

  // --- Future enforcement (kept below for easy restore) ---
  const userId = _userId;
  const orgId = _orgId;
  const actionType = _actionType;

  const user = await Users.findById(userId);
  if (!user) throw new ApiError("User not found", 404);

  if (["admin", "superadmin", "servicing", "resource"].includes(user.role)) return;

  if (
    !user.subscription ||
    !user.subscription.id ||
    (user.subscription.status !== "completed" &&
      user.subscription.status !== "active")
  ) {
    throw new ApiError("No active subscription found for user.", 403);
  }

  const subscription = await Subscriptions.findOne({
    subscriptionId: user.subscription.id,
  });

  if (!subscription) {
    throw new ApiError("Subscription record not found", 404);
  }
  const plan = await PlansModel.findOne({ plan_id: subscription.planId });
  if (!plan) {
    throw new ApiError("Plan not found", 404);
  }

  const planLimits = plan as any;

  let usage = 0;
  let max = 0;
  let limitType = "";

  if (actionType === "START_SERVICE") {
    const activeStatuses = [
      "planning",
      "initiated",
      "on-hold",
      "revision",
      "delivered",
      "approved",
    ];
    usage = await Projects.countDocuments({
      userId: userId,
      status: { $in: activeStatuses },
    });
    max = planLimits.max_concurrent_services || 1;
    limitType = "max_concurrent_services";

    if (usage >= max) {
      await logWarning(
        userId,
        orgId,
        actionType,
        limitType,
        usage,
        max,
        planLimits.tag
      );
      throwLimitError(
        limitType,
        max,
        usage,
        planLimits.tag,
        planLimits.user_popup_on_limit
      );
    }
  }

  if (actionType === "CREATE_BRIEF") {
    if (planLimits.unlimited_briefs) return;

    usage = await Requirement.countDocuments({
      userId: userId,
      status: { $ne: "closed" },
    });

    max = planLimits.max_briefs || 0;
    limitType = "max_briefs";

    if (usage >= max) {
      await logWarning(
        userId,
        orgId,
        actionType,
        limitType,
        usage,
        max,
        planLimits.tag
      );
      throwLimitError(
        limitType,
        max,
        usage,
        planLimits.tag,
        planLimits.user_popup_on_limit
      );
    }
  }

  if (actionType === "INVITE_MEMBER") {
    let resolvedOrgId = orgId;
    if (!resolvedOrgId) {
      const org = await Organizations.findOne({ owner: userId });
      if (org) resolvedOrgId = org._id.toString();
    }

    if (resolvedOrgId) {
      usage = await Teams.countDocuments({
        Organization: resolvedOrgId,
      });

      max = planLimits.max_additional_members || 0;
      limitType = "max_additional_members";

      if (usage >= max) {
        await logWarning(
          userId,
          resolvedOrgId,
          actionType,
          limitType,
          usage,
          max,
          planLimits.tag
        );
        throwLimitError(
          limitType,
          max,
          usage,
          planLimits.tag,
          planLimits.user_popup_on_limit
        );
      }
    }
  }
};

export const getUserPlanLimit = async (userId: string, orgId?: string) => {
  const user = await Users.findById(userId);
  if (!user) throw new ApiError("User not found", 404);

  if (["admin", "superadmin", "servicing", "resource"].includes(user.role)) {
    return {
      isAdmin: true,
      message: "User has administrative privileges, no limits apply.",
    };
  }

  // While plan enforcement is off, still return a permissive snapshot when possible.
  if (
    !user.subscription ||
    !user.subscription.id ||
    user.subscription.status !== "active"
  ) {
    return {
      planName: "deferred",
      limits: {
        max_concurrent_services: null,
        max_briefs: null,
        unlimited_briefs: true,
        max_additional_members: null,
        user_popup_on_limit: false,
        enforcementEnabled: false,
      },
      usage: {
        concurrent_services: 0,
        briefs: 0,
        additional_members: 0,
      },
    };
  }

  const subscription = await Subscriptions.findOne({
    subscriptionId: user.subscription.id,
  });

  if (!subscription) {
    throw new ApiError("Subscription record not found", 404);
  }

  const plan = await PlansModel.findOne({ plan_id: subscription.planId });
  if (!plan) {
    throw new ApiError("Plan not found", 404);
  }

  const planLimits = plan as any;

  const activeStatuses = [
    "planning",
    "initiated",
    "on-hold",
    "revision",
    "delivered",
    "approved",
  ];
  const serviceUsage = await Projects.countDocuments({
    userId: userId,
    status: { $in: activeStatuses },
  });

  const briefsUsage = await Requirement.countDocuments({
    userId: userId,
    status: { $ne: "closed" },
  });

  let resolvedOrgId = orgId;
  if (!resolvedOrgId) {
    const org = await Organizations.findOne({ owner: userId });
    if (org) resolvedOrgId = org._id.toString();
  }

  let membersUsage = 0;
  if (resolvedOrgId) {
    membersUsage = await Teams.countDocuments({
      Organization: resolvedOrgId,
    });
  }

  return {
    planName: planLimits.tag,
    limits: {
      max_concurrent_services: planLimits.max_concurrent_services,
      max_briefs: planLimits.max_briefs,
      unlimited_briefs: planLimits.unlimited_briefs,
      max_additional_members: planLimits.max_additional_members,
      user_popup_on_limit: planLimits.user_popup_on_limit,
      enforcementEnabled: PLAN_LIMITS_ENABLED,
    },
    usage: {
      concurrent_services: serviceUsage,
      briefs: briefsUsage,
      additional_members: membersUsage,
    },
  };
};

const logWarning = async (
  userId: string,
  orgId: string | undefined,
  action: string,
  limitType: string,
  usage: number,
  max: number,
  plan: string
) => {
  await LimitWarning.create({
    user_id: userId,
    org_id: orgId,
    action,
    limitType,
    usage,
    max,
    plan,
  });
};

const throwLimitError = (
  limitType: string,
  maxAllowed: number,
  currentUsage: number,
  planName: string,
  popup: boolean
) => {
  throw new ApiError(
    JSON.stringify({
      code: "PLAN_LIMIT_EXCEEDED",
      limitType,
      maxAllowed,
      currentUsage,
      planName,
      popup,
    }),
    403
  );
};
