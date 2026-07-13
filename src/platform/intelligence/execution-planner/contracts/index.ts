/**
 * Execution planner contracts (architecture only).
 *
 * Planning consults (via interfaces, future injection):
 * - ICapabilityCatalog
 * - IProviderCapabilityMatrix
 * - IPolicyEngine (policies module)
 *
 * Output is always ExecutionPlan only.
 */

export type PlanningInputSource =
  | "capability-catalog"
  | "provider-capability-matrix"
  | "policies";
