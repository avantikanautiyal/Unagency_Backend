/**
 * Production Execution Validation Framework.
 *
 * Consumes Intelligence OS public interfaces only.
 * Proves end-to-end correctness under OpenAI provider execution.
 */

export * from "./contracts";
export * from "./interfaces";
export * from "./constants";
export {
  PRODUCTION_SCENARIO_LIBRARY,
  listScenarioIds,
  getScenario,
  getScenarioByDomain,
} from "./scenarios/scenario-library";
export { SCENARIO_EXPECTATION_DATASET } from "./datasets/scenario-expectations";
export { ProductionValidationEngine } from "./validation/production-validation-engine";
export { collectValidationChecks } from "./validation/collect-checks";
export { collectBenchmark } from "./benchmarking/collect-benchmark";
export {
  buildCertifications,
  buildReadinessScore,
} from "./certification/build-certification";
export { analyzeFailure } from "./diagnostics/failure-analysis";
export { buildExecutionTrace } from "./observability/execution-trace";
export { InMemoryProductionReportStore } from "./reporting/report-store";
export {
  bootProductionExecution,
  executeScenario,
} from "./execution/production-executor";
export { ProductionPinnedOpenAIDispatcher } from "./execution/pinned-openai-dispatcher";
export { ProductionValidationRequestBuilder } from "./builders/production-validation-request-builder";
export {
  createProductionValidationPlatform,
  type ProductionValidationPlatform,
  type CreateProductionValidationOptions,
} from "./factories/create-production-validation-platform";
export * from "./multi-provider";
