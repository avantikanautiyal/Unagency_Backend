/**
 * Adapt ExecutionPlan → execution metadata (references only; no task dispatch).
 */

import type { ExecutionPlan } from "../contracts/execution-plan";

export function executionPlanToMetadata(
  plan: ExecutionPlan
): Readonly<Record<string, unknown>> {
  return {
    structuredExecutionPlan: plan,
    executionPlanId: plan.id,
    executionPlanVersion: plan.planVersion,
    executionPlanStatus: plan.status,
    executionPlanType: plan.planType,
    executionPlanTaskCount: plan.tasks.length,
    executionPlanDependencyCount: plan.dependencies.length,
    executionPlanComplexity: plan.estimatedComplexity,
    executionPlanRiskLevel: plan.risk.level,
    plannerVersion: plan.plannerVersion,
    executionPlanAware: true,
    /** Phase 5 hook — never true in Phase 4. */
    taskGraphExecutionEnabled: false,
  };
}
