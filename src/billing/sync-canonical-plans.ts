/**
 * Sync local Plans collection from canonical catalog + existing Razorpay Plan IDs.
 * Does NOT create or modify Razorpay Plans — only upserts application records.
 */

import { PlansModel } from "../models/plan.model";
import { PLAN_CODES, type PlanCode } from "./plan-codes";
import { getCanonicalPlan, FEATURE_MATRIX_ROWS } from "./plan-catalog";
import { resolveRazorpayPlanId } from "./plan-resolver";
import { buildRazorpayPlanItem } from "../utils/demoSeed";

function modeToTag(mode: "AI" | "HYBRID" | "HUMAN"): "ai" | "hybrid" | "human" {
  if (mode === "AI") return "ai";
  if (mode === "HYBRID") return "hybrid";
  return "human";
}

function pointsFromEntitlements(planCode: PlanCode) {
  const plan = getCanonicalPlan(planCode);
  return FEATURE_MATRIX_ROWS.map((row) => ({
    value: `${row.label}: ${row.format(plan.entitlements[row.key])}`,
    include: true,
  }));
}

export async function syncCanonicalPlansToDatabase(): Promise<{
  upserted: PlanCode[];
  razorpayPlanIds: Record<PlanCode, string>;
}> {
  const upserted: PlanCode[] = [];
  const razorpayPlanIds = {} as Record<PlanCode, string>;

  for (const planCode of PLAN_CODES) {
    const definition = getCanonicalPlan(planCode);
    const razorpayPlanId = resolveRazorpayPlanId(planCode);
    razorpayPlanIds[planCode] = razorpayPlanId;

    const period =
      definition.billingPeriod === "annual" ? "yearly" : "monthly";

    const razorpayPlanItem = buildRazorpayPlanItem(
      razorpayPlanId,
      definition.name,
      definition.amountPaise,
      period,
      1
    );

    await PlansModel.findOneAndUpdate(
      { plan_id: razorpayPlanId },
      {
        $set: {
          plan_id: razorpayPlanId,
          planCode,
          mode: definition.mode,
          billingPeriod: definition.billingPeriod,
          entitlements: definition.entitlements,
          active: definition.active,
          razorpayPlanItem,
          points: pointsFromEntitlements(planCode),
          occurance:
            definition.billingPeriod === "annual" ? "yearly" : "monthly",
          tag: modeToTag(definition.mode),
          unlimited_briefs: true,
          max_briefs: -1,
          max_concurrent_services: 9999,
          max_additional_members: 9999,
          user_popup_on_limit: true,
          group_line: `${definition.mode} · ${definition.billingPeriod}`,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    upserted.push(planCode);
  }

  return { upserted, razorpayPlanIds };
}
