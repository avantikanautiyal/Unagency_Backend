/**
 * Step 10 — Configurable promotion-readiness thresholds (no magic numbers in logic).
 */

export type PromotionReadinessThresholds = {
  readonly minValidSamples: number;
  readonly minConfidenceLevel: "high" | "medium" | "low" | "insufficient";
  readonly minObservedAdvantage: number;
  readonly maxOperationalFailureRate: number;
  readonly maxCostRegressionRatio: number;
  readonly maxLatencyRegressionRatio: number;
  readonly requireEvaluatorVersionMatch: boolean;
  readonly requireEvaluationPlaneVersionMatch: boolean;
};

const CONFIDENCE_RANK: Readonly<Record<string, number>> = Object.freeze({
  insufficient: 0,
  low: 1,
  medium: 2,
  high: 3,
});

export const DEFAULT_PROMOTION_READINESS_THRESHOLDS: PromotionReadinessThresholds =
  Object.freeze({
    minValidSamples: 3,
    minConfidenceLevel: "medium",
    minObservedAdvantage: 3,
    maxOperationalFailureRate: 0.15,
    maxCostRegressionRatio: 1.25,
    maxLatencyRegressionRatio: 1.35,
    requireEvaluatorVersionMatch: true,
    requireEvaluationPlaneVersionMatch: true,
  });

function envNum(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function loadPromotionReadinessThresholds(
  env: NodeJS.ProcessEnv = process.env,
): PromotionReadinessThresholds {
  const minConf = env.SHADOW_PROMOTION_MIN_CONFIDENCE?.trim().toLowerCase();
  const confLevel =
    minConf === "high" || minConf === "medium" || minConf === "low"
      ? minConf
      : DEFAULT_PROMOTION_READINESS_THRESHOLDS.minConfidenceLevel;

  return Object.freeze({
    minValidSamples: Math.max(
      1,
      Math.floor(
        envNum(env, "SHADOW_PROMOTION_MIN_VALID_SAMPLES", DEFAULT_PROMOTION_READINESS_THRESHOLDS.minValidSamples),
      ),
    ),
    minConfidenceLevel: confLevel,
    minObservedAdvantage: Math.max(
      0,
      envNum(env, "SHADOW_PROMOTION_MIN_ADVANTAGE", DEFAULT_PROMOTION_READINESS_THRESHOLDS.minObservedAdvantage),
    ),
    maxOperationalFailureRate: Math.max(
      0,
      envNum(
        env,
        "SHADOW_PROMOTION_MAX_OPERATIONAL_FAILURE_RATE",
        DEFAULT_PROMOTION_READINESS_THRESHOLDS.maxOperationalFailureRate,
      ),
    ),
    maxCostRegressionRatio: Math.max(
      1,
      envNum(
        env,
        "SHADOW_PROMOTION_MAX_COST_REGRESSION",
        DEFAULT_PROMOTION_READINESS_THRESHOLDS.maxCostRegressionRatio,
      ),
    ),
    maxLatencyRegressionRatio: Math.max(
      1,
      envNum(
        env,
        "SHADOW_PROMOTION_MAX_LATENCY_REGRESSION",
        DEFAULT_PROMOTION_READINESS_THRESHOLDS.maxLatencyRegressionRatio,
      ),
    ),
    requireEvaluatorVersionMatch:
      env.SHADOW_PROMOTION_REQUIRE_EVALUATOR_MATCH?.trim().toLowerCase() !== "false",
    requireEvaluationPlaneVersionMatch:
      env.SHADOW_PROMOTION_REQUIRE_PLANE_MATCH?.trim().toLowerCase() !== "false",
  });
}

export function meetsConfidenceThreshold(
  actual: "high" | "medium" | "low" | "insufficient",
  required: PromotionReadinessThresholds["minConfidenceLevel"],
): boolean {
  return (CONFIDENCE_RANK[actual] ?? 0) >= (CONFIDENCE_RANK[required] ?? 0);
}
