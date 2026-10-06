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

const DEFAULT_BRAND_LIMIT = 10;
const PRE_CHECKOUT_STORAGE_GB = 1;

export async function assertBrandLimit(
  userId: string,
  organizationId: string,
  currentActiveBrandCount: number
): Promise<void> {
  await ensureSubscriptionEntitlementsSynced(userId);
  // Onboarding offers "Add More Brands" before checkout, so users without a
  // resolvable plan get the same allowance as paid plans.
  const limit = (await getBrandLimit(userId)) ?? DEFAULT_BRAND_LIMIT;
  if (limit === "unlimited") return;
  if (currentActiveBrandCount >= limit) {
    await notifyLimit(userId, "BRAND_LIMIT_REACHED", "/manage-brands", dayKey());
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
  await ensureSubscriptionEntitlementsSynced(userId);
  // Onboarding collects logos and brand files before checkout, so users
  // without a resolvable plan get a small pre-checkout allowance.
  const limitGb = (await getStorageLimitGb(userId)) ?? PRE_CHECKOUT_STORAGE_GB;
  const limitBytes = limitGb * 1024 * 1024 * 1024;
  if (usedBytes + incomingBytes > limitBytes) {
    await notifyLimit(userId, "STORAGE_FULL", "/vault", dayKey());
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
  if (usedBytes + incomingBytes >= limitBytes * STORAGE_WARNING_RATIO) {
    await notifyLimit(
      userId,
      "STORAGE_NEARING_LIMIT",
      "/vault",
      new Date().toISOString().slice(0, 7)
    );
  }
}

const STORAGE_WARNING_RATIO = 0.8;

const dayKey = () => new Date().toISOString().slice(0, 10);

async function notifyLimit(
  userId: string,
  eventKey: "BRAND_LIMIT_REACHED" | "STORAGE_FULL" | "STORAGE_NEARING_LIMIT",
  manageAction: string,
  period: string
): Promise<void> {
  try {
    const { dispatchClientNotification } = await import(
      "../notifications/client-notification-service"
    );
    await dispatchClientNotification({
      eventKey,
      userId,
      primaryAction: { action: eventKey === "BRAND_LIMIT_REACHED" ? "/subscription" : manageAction },
      secondaryAction: { action: eventKey === "BRAND_LIMIT_REACHED" ? manageAction : "/subscription" },
      entityType: "limit",
      dedupeKey: period,
    });
  } catch (error) {
    console.error("[notifyLimit] failed", error);
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
