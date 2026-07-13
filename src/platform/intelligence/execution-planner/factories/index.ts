/**
 * Factory contracts for the execution planner.
 * No implementations in architecture phase.
 */

import type { IExecutionPlanner } from "../interfaces/execution-planner";

export interface IExecutionPlannerFactory {
  create(): IExecutionPlanner;
}
