/**
 * Compatibility shim — planning engine lives in execution-planning/ (M1.4).
 */

export {
  type CapabilityRequest,
  type ExecutionPlan,
  type IExecutionPlanningEngine,
  ExecutionPlanningEngine,
  createExecutionPlanningEngine,
} from "../execution-planning";

/** @deprecated Prefer IExecutionPlanningEngine */
export type { IExecutionPlanningEngine as IExecutionPlanner } from "../execution-planning";
