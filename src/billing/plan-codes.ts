/**
 * Stable internal plan codes — never send Razorpay plan IDs from the client.
 */

export const PLAN_CODES = [
  "UNAGENCY_AI_MONTHLY",
  "UNAGENCY_HYBRID_MONTHLY",
  "UNAGENCY_HUMAN_MONTHLY",
  "UNAGENCY_AI_ANNUAL",
  "UNAGENCY_HYBRID_ANNUAL",
  "UNAGENCY_HUMAN_ANNUAL",
] as const;

export type PlanCode = (typeof PLAN_CODES)[number];

export type PlanMode = "AI" | "HYBRID" | "HUMAN";
export type BillingPeriod = "monthly" | "annual";

export function isPlanCode(value: unknown): value is PlanCode {
  return (
    typeof value === "string" &&
    (PLAN_CODES as readonly string[]).includes(value)
  );
}

export const PLAN_CODE_ENV_KEYS: Record<PlanCode, string> = {
  UNAGENCY_AI_MONTHLY: "RAZORPAY_PLAN_UNAGENCY_AI_MONTHLY",
  UNAGENCY_HYBRID_MONTHLY: "RAZORPAY_PLAN_UNAGENCY_HYBRID_MONTHLY",
  UNAGENCY_HUMAN_MONTHLY: "RAZORPAY_PLAN_UNAGENCY_HUMAN_MONTHLY",
  UNAGENCY_AI_ANNUAL: "RAZORPAY_PLAN_UNAGENCY_AI_ANNUAL",
  UNAGENCY_HYBRID_ANNUAL: "RAZORPAY_PLAN_UNAGENCY_HYBRID_ANNUAL",
  UNAGENCY_HUMAN_ANNUAL: "RAZORPAY_PLAN_UNAGENCY_HUMAN_ANNUAL",
};
