/**
 * Central entitlement engine — application SoT for feature access.
 * Do not scatter plan === "hybrid" checks across the codebase.
 */

import Users from "../models/users.model";
import Subscriptions from "../models/subscription.model";
import { PlansModel } from "../models/plan.model";
import { ApiError } from "../utils/apiError";
import {
  getCanonicalPlan,
  type CanonicalPlanDefinition,
  type PlanEntitlements,
} from "./plan-catalog";
import { isPlanCode, type PlanCode } from "./plan-codes";
import { findPlanCodeByRazorpayPlanId } from "./plan-resolver";

const ACTIVE_STATUSES = new Set([
  "active",
  "authenticated",
  /** Legacy tag used by older plan-limit checks */
  "completed",
]);

export type EntitlementFeature =
  | "humanSupport"
  | "accountManager"
  | "creativeTeamSupport"
  | "unlimitedRevisions"
  | "commercialUsageRights"
  | "quarterlyBusinessReview";

function normalizePlanCode(raw: unknown, razorpayPlanId?: string): PlanCode | null {
  if (isPlanCode(raw)) return raw;
  return findPlanCodeByRazorpayPlanId(razorpayPlanId ?? undefined);
}

function resolvePlanFromSubscription(sub: {
  planCode?: string;
  planId?: string;
}): CanonicalPlanDefinition | null {
  const planCode = normalizePlanCode(sub.planCode, sub.planId) || null;
  return planCode ? getCanonicalPlan(planCode) : null;
}

/**
 * Resolve the paid plan for entitlements.
 * Prefer Subscriptions rows (planCode + status) over the Users.subscription embed,
 * which can lag behind Razorpay / checkout verify.
 */
export async function getActivePlan(
  userId: string
): Promise<CanonicalPlanDefinition | null> {
  const uid = String(userId);
  const activeList = [...ACTIVE_STATUSES];

  // 1) Any locally active subscription for this user (SoT after verify/webhook)
  let sub = await Subscriptions.findOne({
    userId: uid,
    status: { $in: activeList },
  })
    .sort({ updatedAt: -1 })
    .lean();

  // 2) Fall back to Users.subscription pointer — accept if either user embed
  //    or Subscriptions row is in an active status (embed often stays "created")
  if (!sub) {
    const user = await Users.findById(uid).lean();
    const subscriptionId = user?.subscription?.id
      ? String(user.subscription.id)
      : null;
    if (subscriptionId) {
      const byId = await Subscriptions.findOne({ subscriptionId }).lean();
      const userStatus = String(user?.subscription?.status ?? "").toLowerCase();
      const subStatus = String(byId?.status ?? "").toLowerCase();
      if (
        byId &&
        (ACTIVE_STATUSES.has(userStatus) || ACTIVE_STATUSES.has(subStatus))
      ) {
        sub = byId;
      }
    }
  }

  if (!sub) return null;

  const fromSub = resolvePlanFromSubscription(sub);
  if (fromSub) return fromSub;

  const planDoc = await PlansModel.findOne({ plan_id: sub.planId }).lean();
  const fromDoc = normalizePlanCode(
    (planDoc as { planCode?: string } | null)?.planCode,
    sub.planId
  );
  return fromDoc ? getCanonicalPlan(fromDoc) : null;
}

export async function getPlanEntitlements(
  userId: string
): Promise<PlanEntitlements | null> {
  const plan = await getActivePlan(userId);
  return plan?.entitlements ?? null;
}

export async function hasFeature(
  userId: string,
  feature: EntitlementFeature
): Promise<boolean> {
  const entitlements = await getPlanEntitlements(userId);
  if (!entitlements) return false;
  const value = entitlements[feature];
  if (typeof value === "boolean") return value;
  return Boolean(value);
}

export async function getCreditLimit(userId: string): Promise<number | null> {
  const entitlements = await getPlanEntitlements(userId);
  if (!entitlements) return null;
  return entitlements.credits;
}

export async function getBrandLimit(
  userId: string
): Promise<number | "unlimited" | null> {
  const entitlements = await getPlanEntitlements(userId);
  if (!entitlements) return null;
  return entitlements.brands;
}

export async function getStorageLimitGb(userId: string): Promise<number | null> {
  const entitlements = await getPlanEntitlements(userId);
  if (!entitlements) return null;
  return entitlements.projectStorageGb;
}

export async function getQCLevel(userId: string): Promise<string | null> {
  const entitlements = await getPlanEntitlements(userId);
  return entitlements?.qualityControl ?? null;
}

export async function getSupportLevel(userId: string): Promise<string | null> {
  const entitlements = await getPlanEntitlements(userId);
  return entitlements?.support ?? null;
}

export async function assertBrandLimit(
  userId: string,
  organizationId: string,
  currentActiveBrandCount: number
): Promise<void> {
  await ensureSubscriptionEntitlementsSynced(userId);
  const limit = await getBrandLimit(userId);
  if (limit == null) {
    // Onboarding creates a brand before checkout — allow one seed brand.
    if (currentActiveBrandCount < 1) return;
    throw new ApiError(
      "An active subscription is required to create more brands",
      403
    );
  }
  if (limit === "unlimited") return;
  if (currentActiveBrandCount >= limit) {
    throw new ApiError(
      `Brand limit reached (${currentActiveBrandCount}/${limit}). Upgrade your plan to add more brands.`,
      403
    );
  }
}

export async function assertStorageWithinLimit(
  userId: string,
  usedBytes: number,
  incomingBytes: number
): Promise<void> {
  const limitGb = await getStorageLimitGb(userId);
  if (limitGb == null) {
    throw new ApiError(
      "An active subscription is required to upload assets",
      403
    );
  }
  const limitBytes = limitGb * 1024 * 1024 * 1024;
  if (usedBytes + incomingBytes > limitBytes) {
    throw new ApiError(
      JSON.stringify({
        code: "STORAGE_LIMIT_EXCEEDED",
        maxAllowedGb: limitGb,
        usedBytes,
        incomingBytes,
      }),
      403
    );
  }
}

export function entitlementsFromPlanCode(planCode: PlanCode): PlanEntitlements {
  return getCanonicalPlan(planCode).entitlements;
}

/** Keep Users + Subscriptions status aligned with Razorpay when checkout/webhook lag. */
export async function syncEntitlementStatusFromRazorpay(input: {
  userId: string;
  subscriptionId: string;
  razorpayStatus: string;
}): Promise<void> {
  const status = String(input.razorpayStatus ?? "").toLowerCase();
  if (!ACTIVE_STATUSES.has(status)) return;

  await Subscriptions.findOneAndUpdate(
    { subscriptionId: input.subscriptionId },
    { $set: { status: input.razorpayStatus } }
  );
  await Users.findByIdAndUpdate(input.userId, {
    $set: {
      "subscription.id": input.subscriptionId,
      "subscription.status": input.razorpayStatus,
    },
  });
}

/**
 * If local status is still "created" after checkout, pull Razorpay once and
 * promote to active/authenticated so brand/storage entitlements unlock.
 */
export async function ensureSubscriptionEntitlementsSynced(
  userId: string
): Promise<void> {
  const uid = String(userId);
  const user = await Users.findById(uid).lean();
  let subscriptionId = user?.subscription?.id
    ? String(user.subscription.id)
    : null;

  if (!subscriptionId) {
    const latest = await Subscriptions.findOne({ userId: uid })
      .sort({ updatedAt: -1 })
      .lean();
    subscriptionId = latest?.subscriptionId
      ? String(latest.subscriptionId)
      : null;
  }
  if (!subscriptionId) return;

  const local = await Subscriptions.findOne({ subscriptionId }).lean();
  const localStatus = String(
    local?.status ?? user?.subscription?.status ?? ""
  ).toLowerCase();
  if (ACTIVE_STATUSES.has(localStatus)) return;

  try {
    const razorpayInstance = (await import("../utils/razorpayInstance"))
      .default;
    const rz = await razorpayInstance.subscriptions.fetch(subscriptionId);
    await syncEntitlementStatusFromRazorpay({
      userId: uid,
      subscriptionId,
      razorpayStatus: String(rz?.status ?? ""),
    });
  } catch {
    /* offline / invalid — leave local status unchanged */
  }
}
