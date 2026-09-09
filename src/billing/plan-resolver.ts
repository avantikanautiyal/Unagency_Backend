/**
 * Resolve internal planCode → existing Razorpay Plan ID from environment.
 * Never accept Razorpay plan IDs from the frontend.
 */

import { ApiError } from "../utils/apiError";
import {
  isPlanCode,
  PLAN_CODE_ENV_KEYS,
  type PlanCode,
} from "./plan-codes";
import { getCanonicalPlan, type CanonicalPlanDefinition } from "./plan-catalog";

export function resolveRazorpayPlanId(planCode: PlanCode): string {
  const envKey = PLAN_CODE_ENV_KEYS[planCode];
  const value = process.env[envKey]?.trim();
  if (!value) {
    throw new ApiError(
      `Plan configuration incomplete: ${envKey} is not set`,
      500
    );
  }
  if (!value.startsWith("plan_")) {
    throw new ApiError(`Invalid Razorpay plan ID configured for ${planCode}`, 500);
  }
  return value;
}

export function resolveActivePlanFromCode(
  rawPlanCode: unknown
): {
  planCode: PlanCode;
  definition: CanonicalPlanDefinition;
  razorpayPlanId: string;
} {
  if (!isPlanCode(rawPlanCode)) {
    throw new ApiError("Invalid planCode", 400);
  }
  const definition = getCanonicalPlan(rawPlanCode);
  if (!definition.active) {
    throw new ApiError("Plan is not available", 400);
  }
  return {
    planCode: rawPlanCode,
    definition,
    razorpayPlanId: resolveRazorpayPlanId(rawPlanCode),
  };
}

export function findPlanCodeByRazorpayPlanId(
  razorpayPlanId: string | undefined | null
): PlanCode | null {
  if (!razorpayPlanId) return null;
  for (const [code, envKey] of Object.entries(PLAN_CODE_ENV_KEYS) as [
    PlanCode,
    string,
  ][]) {
    if (process.env[envKey]?.trim() === razorpayPlanId) {
      return code;
    }
  }
  return null;
}

export function getPublicRazorpayKeyId(): string {
  const key =
    process.env.RAZORPAY_KEY?.trim() ||
    process.env.RAZORPAY_KEY_ID?.trim() ||
    "";
  if (!key) {
    throw new ApiError("Razorpay is not configured", 500);
  }
  return key;
}

/** Recurring cycle count — configurable; never treat annual as one-time by default. */
export function subscriptionTotalCount(
  billingPeriod: "monthly" | "annual"
): number {
  if (billingPeriod === "annual") {
    const n = Number(process.env.RAZORPAY_SUBSCRIPTION_TOTAL_COUNT_ANNUAL ?? "10");
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10;
  }
  const n = Number(process.env.RAZORPAY_SUBSCRIPTION_TOTAL_COUNT_MONTHLY ?? "120");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 120;
}
