/**
 * Explainability helpers for capability plans.
 */

import type { CapabilityRecommendation } from "../contracts/scoring";
import type { CapabilityExecutionPlan } from "../contracts/result";

export function formatRecommendationExplanation(rec: CapabilityRecommendation): string {
  const e = rec.evidence;
  return [
    e.whySelected,
    `Dependencies: ${e.dependencies.join(", ") || "none"}`,
    `Alternatives: ${e.alternatives.join(", ") || "none"}`,
    `Trade-offs: ${e.tradeOffs.join("; ")}`,
    e.historicalSuccess,
    `Confidence: ${e.confidence.toFixed(2)}`,
  ].join(" | ");
}

export function formatPlanExplanation(plan: CapabilityExecutionPlan): string {
  return `${plan.explanation} Steps: ${plan.steps.map((s) => s.capabilityId).join(" → ")}`;
}
