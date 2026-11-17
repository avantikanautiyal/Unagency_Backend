/**
 * Subscription credit allocation & consumption.
 * Annual credits are NOT divided by 12. Human plans have credits = N/A (null).
 */

import {
  CreditBalanceModel,
  CreditLedgerModel,
} from "../models/credit-balance.model";
import type { PlanCode } from "./plan-codes";
import { getCanonicalPlan } from "./plan-catalog";

function periodFromUnix(
  currentStart?: number | null,
  currentEnd?: number | null
): { periodStart: Date; periodEnd: Date } {
  const now = Date.now();
  const periodStart = currentStart
    ? new Date(currentStart * 1000)
    : new Date(now);
  const periodEnd = currentEnd
    ? new Date(currentEnd * 1000)
    : new Date(now + 30 * 24 * 60 * 60 * 1000);
  return { periodStart, periodEnd };
}

export async function allocateCreditsForSubscriptionPeriod(input: {
  userId: string;
  organizationId?: string;
  subscriptionId: string;
  planCode: PlanCode;
  razorpayPlanId: string;
  currentStart?: number | null;
  currentEnd?: number | null;
  /** Unique per allocation event — prevents double credit on webhook retry */
  allocationKey: string;
}): Promise<{ allocated: boolean; reason?: string }> {
  const entitlements = getCanonicalPlan(input.planCode).entitlements;
  if (entitlements.credits == null) {
    return { allocated: false, reason: "credits_not_applicable" };
  }

  const existing = await CreditBalanceModel.findOne({
    allocationKey: input.allocationKey,
  }).lean();
  if (existing) {
    return { allocated: false, reason: "already_allocated" };
  }

  const { periodStart, periodEnd } = periodFromUnix(
    input.currentStart,
    input.currentEnd
  );
  const allocated = entitlements.credits;

  try {
    const balance = await CreditBalanceModel.create({
      userId: input.userId,
      organizationId: input.organizationId,
      subscriptionId: input.subscriptionId,
      planCode: input.planCode,
      planId: input.razorpayPlanId,
      allocated,
      used: 0,
      remaining: allocated,
      periodStart,
      periodEnd,
      allocationKey: input.allocationKey,
    });

    await CreditLedgerModel.create({
      userId: input.userId,
      subscriptionId: input.subscriptionId,
      creditBalanceId: balance._id,
      delta: allocated,
      reason: "period_allocation",
      idempotencyKey: `alloc:${input.allocationKey}`,
      metadata: { planCode: input.planCode },
    });

    await notifyCredits(
      input.userId,
      "CREDITS_ADDED",
      { "Credits Added": allocated },
      input.allocationKey
    );
    return { allocated: true };
  } catch (err: unknown) {
    // Unique index race → treat as idempotent success
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: number }).code === 11000
    ) {
      return { allocated: false, reason: "already_allocated" };
    }
    throw err;
  }
}

export async function getCurrentCreditBalance(userId: string) {
  const now = new Date();
  return CreditBalanceModel.findOne({
    userId,
    periodStart: { $lte: now },
    periodEnd: { $gte: now },
  })
    .sort({ periodStart: -1 })
    .lean();
}

async function notifyCredits(
  userId: string,
  eventKey: "CREDITS_ADDED" | "CREDITS_LOW" | "CREDITS_EXHAUSTED",
  variables: Record<string, string | number>,
  dedupeKey: string
): Promise<void> {
  try {
    const { dispatchClientNotification } = await import(
      "../notifications/client-notification-service"
    );
    await dispatchClientNotification({
      eventKey,
      userId,
      variables,
      primaryAction: { action: eventKey === "CREDITS_ADDED" ? "/choose-mode" : "/subscription" },
      ...(eventKey === "CREDITS_ADDED"
        ? {}
        : { secondaryAction: { action: "/subscription" } }),
      entityType: "credits",
      dedupeKey,
    });
  } catch (error) {
    console.error("[notifyCredits] failed", error);
  }
}
