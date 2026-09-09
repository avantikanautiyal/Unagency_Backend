/**
 * Apply Razorpay subscription entity → local Subscriptions + Users.
 * Optionally allocate credits (idempotent via allocationKey).
 */

import Subscriptions from "../models/subscription.model";
import Users from "../models/users.model";
import { allocateCreditsForSubscriptionPeriod } from "./credit-service";
import { isPlanCode, type PlanCode } from "./plan-codes";
import { findPlanCodeByRazorpayPlanId } from "./plan-resolver";

export type RazorpaySubscriptionEntity = {
  id?: string;
  plan_id?: string;
  status?: string;
  current_start?: number | null;
  current_end?: number | null;
  charge_at?: number | null;
  quantity?: number;
  total_count?: number;
  paid_count?: number;
  remaining_count?: number;
  customer_id?: string;
};

export async function syncLocalSubscriptionFromRazorpay(input: {
  entity: RazorpaySubscriptionEntity;
  allocateCredits?: boolean;
  allocationKey?: string;
}): Promise<{ userId?: string; planCode?: PlanCode | null }> {
  const entity = input.entity;
  const subscriptionId = entity.id;
  if (!subscriptionId) return {};

  const existing = await Subscriptions.findOne({ subscriptionId });
  const planCode: PlanCode | null =
    (existing?.planCode && isPlanCode(existing.planCode)
      ? existing.planCode
      : null) || findPlanCodeByRazorpayPlanId(entity.plan_id);

  const updated = await Subscriptions.findOneAndUpdate(
    { subscriptionId },
    {
      $set: {
        status: entity.status ?? existing?.status,
        planId: entity.plan_id ?? existing?.planId,
        ...(planCode ? { planCode } : {}),
        current_start: entity.current_start ?? existing?.current_start,
        current_end: entity.current_end ?? existing?.current_end,
        next_charge_at: entity.charge_at ?? existing?.next_charge_at,
        quantity: entity.quantity ?? existing?.quantity ?? 1,
        total_count: entity.total_count ?? existing?.total_count,
        paid_count: entity.paid_count ?? existing?.paid_count,
        remaining_count: entity.remaining_count ?? existing?.remaining_count,
        ...(entity.customer_id
          ? { customerId: entity.customer_id }
          : {}),
      },
    },
    { new: true }
  );

  if (!updated) return { planCode };

  await Users.findOneAndUpdate(
    { _id: updated.userId },
    {
      $set: {
        "subscription.id": subscriptionId,
        "subscription.status": entity.status ?? updated.status,
      },
    }
  );

  if (
    input.allocateCredits &&
    input.allocationKey &&
    planCode &&
    updated.userId
  ) {
    await allocateCreditsForSubscriptionPeriod({
      userId: updated.userId,
      organizationId: updated.organizationId,
      subscriptionId,
      planCode,
      razorpayPlanId: updated.planId,
      currentStart:
        typeof entity.current_start === "number" ? entity.current_start : null,
      currentEnd:
        typeof entity.current_end === "number" ? entity.current_end : null,
      allocationKey: input.allocationKey,
    });
  }

  return { userId: updated.userId, planCode };
}
