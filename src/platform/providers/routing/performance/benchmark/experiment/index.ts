/**
 * Step 9 — Strategy + Knowledge Optimization / Controlled Experimentation
 */

export {
  type ExperimentStrategyDefinition,
  type StrategyApplicability,
  toBenchmarkStrategy,
  isStrategyApplicable,
} from "./contracts/experiment-strategy";

export {
  type KnowledgeContextRef,
  type KnowledgeScope,
  knowledgeVersionTag,
  isKnowledgeApplicable,
  applyKnowledgeToBrief,
} from "./contracts/knowledge-context";

export {
  type ExperimentStatus,
  type ExperimentCellStatus,
} from "./contracts/experiment-status";

export {
  EXPERIMENT_SYSTEM_VERSION,
  type ExperimentDefinition,
  type ExperimentMatrixInput,
  type ExperimentEvaluationConditions,
} from "./contracts/experiment-definition";

export {
  DEFAULT_EXPERIMENT_STRATEGIES,
  getExperimentStrategy,
  listExperimentStrategies,
  registerExperimentStrategy,
} from "./catalog/strategy-catalog";

export {
  DEFAULT_KNOWLEDGE_CONTEXTS,
  getKnowledgeContext,
  listKnowledgeContexts,
  registerKnowledgeContext,
  buildKnowledgeContextRef,
} from "./catalog/knowledge-catalog";

export {
  type ExperimentComparisonMode,
  type FairComparisonInput,
  type FairComparisonResult,
  checkFairComparison,
  filterFairComparableRecords,
} from "./comparison/fair-comparison";

export {
  type ExperimentMatrixCell,
  type ExperimentMatrixPlan,
  buildExperimentMatrix,
  formatExperimentMatrixPlan,
} from "./matrix/experiment-matrix";

export {
  type ExperimentBudget,
  type ExperimentBudgetPlan,
  DEFAULT_EXPERIMENT_BUDGET,
  planExperimentBudget,
  assertExperimentBudget,
  formatExperimentBudgetPlan,
} from "./budget/experiment-budget";

export {
  type ExperimentExecutionContext,
  applyStrategyConfigurationToPrompt,
  buildExperimentExecutionContext,
} from "./execution/experiment-context-applicator";

export {
  type ExperimentExecutionInput,
  type ExperimentExecutionOutput,
  runExperiment,
  planExperiment,
} from "./execution/experiment-execution-service";

export {
  type ExperimentAnalysisService,
  createExperimentAnalysisService,
  observedDifferenceLabel,
} from "./analysis/experiment-analysis-service";

export {
  type RecommendationStatus,
  type OptimizationRecommendation,
  buildOptimizationRecommendation,
  selectBestSupportedCandidate,
} from "./recommendations/optimization-recommendations";

export {
  type ExperimentRunReport,
  type ExperimentComparisonReport,
  buildExperimentRunReport,
  formatExperimentRunReport,
  formatExperimentComparisonReport,
  experimentReportToJson,
} from "./reporting/experiment-report";

export {
  logExperimentStarted,
  logExperimentConfiguration,
  logExperimentBudget,
  logExperimentCellStarted,
  logExperimentPerformanceRecord,
  logExperimentComparison,
  logOptimizationRecommendation,
  logExperimentCompleted,
} from "./logging/experiment-logger";
