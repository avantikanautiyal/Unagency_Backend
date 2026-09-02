/**
 * Step 9 — Strict pre-execution experiment budgeting.
 */

import type { ExperimentMatrixPlan } from "../matrix/experiment-matrix";

export type ExperimentBudget = {
  readonly maxInvocations: number;
  readonly maxRepeats: number;
  readonly maxConcurrentExecutions: number;
  readonly maxEstimatedCost?: number;
  readonly allowLargeRunOverride?: boolean;
  readonly largeRunThreshold?: number;
};

export const DEFAULT_EXPERIMENT_BUDGET: ExperimentBudget = Object.freeze({
  maxInvocations: 24,
  maxRepeats: 3,
  maxConcurrentExecutions: 2,
  maxEstimatedCost: 5,
  largeRunThreshold: 12,
  allowLargeRunOverride: false,
});

export type ExperimentBudgetPlan = {
  readonly plannedInvocations: number;
  readonly maxAllowed: number;
  readonly repeatCount: number;
  readonly estimatedCost?: number;
  readonly worstCaseCost?: number;
  readonly withinBudget: boolean;
  readonly rejectionReasons: readonly string[];
};

export function planExperimentBudget(input: {
  readonly matrix: ExperimentMatrixPlan;
  readonly budget: ExperimentBudget;
  readonly estimatedCostPerInvocation?: number;
}): ExperimentBudgetPlan {
  const { matrix, budget } = input;
  const reasons: string[] = [];
  const planned = matrix.totalInvocations;

  if (planned > budget.maxInvocations) {
    reasons.push(
      `Planned invocations ${planned} exceed maxInvocations ${budget.maxInvocations}`,
    );
  }
  if (matrix.repeatCount > budget.maxRepeats) {
    reasons.push(`Repeat count ${matrix.repeatCount} exceeds maxRepeats ${budget.maxRepeats}`);
  }
  const threshold = budget.largeRunThreshold ?? budget.maxInvocations;
  if (planned > threshold && !budget.allowLargeRunOverride) {
    reasons.push(
      `Large experiment blocked: ${planned} invocations (threshold ${threshold})`,
    );
  }

  let estimatedCost: number | undefined;
  let worstCaseCost: number | undefined;
  if (input.estimatedCostPerInvocation != null) {
    estimatedCost = planned * input.estimatedCostPerInvocation;
    worstCaseCost = estimatedCost;
    if (budget.maxEstimatedCost != null && estimatedCost > budget.maxEstimatedCost) {
      reasons.push(
        `Estimated cost ${estimatedCost.toFixed(4)} exceeds maxEstimatedCost ${budget.maxEstimatedCost}`,
      );
    }
  }

  return Object.freeze({
    plannedInvocations: planned,
    maxAllowed: budget.maxInvocations,
    repeatCount: matrix.repeatCount,
    estimatedCost,
    worstCaseCost,
    withinBudget: reasons.length === 0,
    rejectionReasons: Object.freeze(reasons),
  });
}

export function assertExperimentBudget(input: {
  readonly matrix: ExperimentMatrixPlan;
  readonly budget: ExperimentBudget;
  readonly estimatedCostPerInvocation?: number;
}): ExperimentBudgetPlan {
  const plan = planExperimentBudget(input);
  if (!plan.withinBudget) {
    throw new Error(
      `Experiment budget exceeded: ${plan.rejectionReasons.join("; ")}`,
    );
  }
  return plan;
}

export function formatExperimentBudgetPlan(plan: ExperimentBudgetPlan): string {
  return [
    "=== Experiment Budget Plan ===",
    `Planned invocations: ${plan.plannedInvocations}`,
    `Maximum allowed: ${plan.maxAllowed}`,
    `Repeats: ${plan.repeatCount}`,
    ...(plan.estimatedCost != null
      ? [`Estimated cost: ${plan.estimatedCost.toFixed(4)}`]
      : []),
    ...(plan.worstCaseCost != null
      ? [`Worst-case cost: ${plan.worstCaseCost.toFixed(4)}`]
      : []),
    `Within budget: ${plan.withinBudget ? "YES" : "NO"}`,
    ...(plan.rejectionReasons.length
      ? [`Rejection: ${plan.rejectionReasons.join("; ")}`]
      : []),
  ].join("\n");
}
