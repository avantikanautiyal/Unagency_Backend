/**
 * Production execution bootstrap — wires live provider leaves for DirectExecutionEngine.
 */

export type { ProductionExecutionMode, ScenarioDomain } from "./contracts/enums";
export type { ProductionScenario } from "./contracts/scenario";
export {
  bootProductionExecution,
  executeScenario,
  type ProductionExecutionContext,
  type ProductionExecutionDeps,
} from "./execution/production-executor";
