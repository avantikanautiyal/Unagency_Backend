/**
 * Step 3 — Benchmark + Model Performance Evaluation
 */

export {
  BENCHMARK_SYSTEM_VERSION,
  DEFAULT_BENCHMARK_STRATEGY,
  type BenchmarkCase,
  type BenchmarkSuite,
  type BenchmarkModelTarget,
  type BenchmarkStrategy,
  type BenchmarkExecutionConditions,
  type BenchmarkComplexity,
} from "./contracts/benchmark-case";

export {
  type ModelPerformanceRecord,
  type PerformanceFingerprint,
  type PerformanceConfidence,
  type ComparisonCompatibility,
  type ReliabilityStatus,
} from "./contracts/model-performance-record";

export {
  buildBenchmarkCatalog,
  buildBenchmarkSuites,
  getBenchmarkCase,
  listBenchmarkCases,
  resetBenchmarkCatalogCache,
} from "./catalog/benchmark-catalog";

export {
  buildModelPerformanceRecord,
  buildOperationalFailureBenchmarkRecord,
  type BenchmarkExecutionOutput,
} from "./engine/record-builder";

export {
  resolveBenchmarkValidation,
  resolveBenchmarkValidationAsync,
  buildBenchmarkValidationInput,
  requireBenchmarkValidationForRecord,
  type BenchmarkValidationOutcome,
  type BenchmarkValidationUnavailableReason,
  type BenchmarkArtifactEvaluationDeps,
} from "./engine/benchmark-validation-resolver";

export {
  runBenchmark,
  runBenchmarkSuite,
  resetBenchmarkRunnerState,
  type BenchmarkModelExecutor,
  type BenchmarkRunInput,
  type BenchmarkRunResult,
  type BenchmarkSuiteRunInput,
} from "./engine/benchmark-runner";

export {
  type IBenchmarkPerformanceRecordStore,
  type PerformanceRecordQuery,
  InMemoryBenchmarkPerformanceRecordStore,
  defaultBenchmarkPerformanceRecordStore,
} from "./persistence/benchmark-record-store";

export {
  toPerformanceEvidence,
  persistBenchmarkToPerformanceStore,
} from "./persistence/performance-evidence-bridge";

export {
  computePerformanceConfidence,
  scoreVariance,
  mean,
  type ConfidenceInput,
} from "./intelligence/confidence-model";

export {
  aggregatePerformance,
  aggregateRecordsInMemory,
  groupRecordsByScope,
  type AggregationScope,
  type AggregationLevel,
} from "./intelligence/performance-aggregator";

export {
  checkComparisonCompatibility,
  filterComparableRecords,
} from "./intelligence/comparison-compatibility";

export {
  detectRegressions,
  selectBaselineRecords,
  compareModelsFairly,
  type RegressionFinding,
  type RegressionReport,
  type BaselineReference,
} from "./intelligence/regression-detector";

export {
  createPerformanceQueryService,
  defaultPerformanceQueryService,
  benchmarksApiPayload,
  type PerformanceQueryService,
} from "./performance-query-service";

// Step 8 — Evidence collection + performance intelligence
export {
  createPerformanceIntelligenceService,
  defaultPerformanceIntelligenceService,
  findMaterialDifferences,
  type PerformanceIntelligenceService,
} from "./evidence/performance-intelligence-service";

export {
  buildEvidenceMatrix,
  formatEvidenceMatrixPlan,
  assertEvidenceCollectionBudget,
  type CoverageStrategy,
  type EvidenceMatrixScope,
  type EvidenceMatrixPlan,
  type EvidenceMatrixCell,
} from "./evidence/evidence-matrix";

export {
  collectEvidence,
  planEvidenceCollection,
  type EvidenceCollectionInput,
  type EvidenceCollectionOutput,
} from "./evidence/evidence-collection-service";

export {
  DEFAULT_EVIDENCE_TIER_THRESHOLDS,
  DEFAULT_SPECIALIZATION_THRESHOLDS,
  DEFAULT_EVIDENCE_COLLECTION_BUDGET,
  STEP8_PILOT_BUDGET,
  resolveEvidenceTier,
  meetsConfidenceThreshold,
  median,
  type EvidenceTier,
  type EvidenceTierThresholds,
  type SpecializationThresholds,
  type EvidenceCollectionBudget,
} from "./evidence/evidence-collection-config";

export {
  isValidComparisonRecord,
  filterValidComparisonRecords,
  separateEvidenceQuality,
} from "./evidence/evidence-validity";

export {
  auditEvidenceCoverage,
  type EvidenceCoverageReport,
  type EvidenceCoverageCell,
  type EvidenceCoverageCellStatus,
} from "./evidence/evidence-coverage";

export {
  detectSpecializations,
  compareModelsAtScope,
  strongestAreas,
  weakestAreas,
  type SpecializationCandidate,
  type ModelComparisonResult,
} from "./evidence/specialization-detector";

export {
  buildPerformanceIntelligenceReport,
  formatCoverageReport,
  formatSpecializationReport,
  formatModelComparisonReport,
  type PerformanceIntelligenceReport,
} from "./evidence/performance-intelligence-report";

export { buildExtendedFingerprint } from "./evidence/performance-fingerprint-builder";

export {
  auditBenchmarkCoverage,
  assertFullBenchmarkCoverage,
  listAwaitingBenchmarkCases,
  benchmarkCasesForService,
  type BenchmarkCoverageReport,
  type BenchmarkCoverageEntry,
  type BenchmarkCoverageStatus,
} from "./audit/benchmark-coverage-audit";

export {
  compareShadowRouting,
  type RouterDecision,
  type PerformanceRecommendation,
  type ShadowRoutingComparison,
} from "./shadow-routing-preparation";

export {
  EvidenceOnlyPerformanceIntelligence,
  defaultEvidenceOnlyPerformanceIntelligence,
} from "./../benchmark-intelligence";

// Step 4A — Real provider benchmark execution
export {
  BENCHMARK_EXECUTION_MODE,
  DEFAULT_BENCHMARK_BUDGET,
  PILOT_BENCHMARK_BUDGET,
  DEFAULT_REPEAT_CONFIG,
  planBenchmarkInvocations,
  assertBenchmarkBudget,
  type BenchmarkBudgetConfig,
  type BenchmarkRepeatConfig,
  type BenchmarkInvocationPlan,
  type BenchmarkExecutionMode,
} from "./contracts/benchmark-execution-config";

export {
  resolveBenchmarkCapability,
  type ResolvedBenchmarkCapability,
} from "./engine/benchmark-capability-resolver";

export {
  normalizeProviderResponseForBenchmark,
  type NormalizedBenchmarkOutput,
} from "./engine/benchmark-output-normalizer";

export {
  createBenchmarkProviderExecutor,
  createProductionBenchmarkExecutor,
  type BenchmarkProviderExecutorDeps,
  type BenchmarkExecutionObservabilityEvent,
} from "./engine/benchmark-provider-executor";

export {
  PILOT_BENCHMARK_IDS,
  PILOT_SUITE_ID,
  getPilotBenchmarkCases,
  assertPilotBenchmarksAvailable,
  pilotBenchmarkIdsForModality,
  type PilotBenchmarkId,
} from "./catalog/benchmark-pilot-catalog";

export {
  buildBenchmarkRunReport,
  buildBenchmarkComparisonReport,
  type BenchmarkRunReport,
  type BenchmarkComparisonReport,
  type ModelComparisonEntry,
} from "./reporting/benchmark-run-report";

export {
  logBenchmarkEvaluationReport,
  logBenchmarkStarted,
  logModelExecutionStarted,
  logModelExecutionCompleted,
  logArtifactCreated,
  logBenchmarkEvaluationJson,
  logBenchmarkRealExecutionSummary,
  buildBenchmarkPipelineVerification,
  printStage1ComparisonTable,
  printStage1Totals,
  type BenchmarkEvaluationLogInput,
  type BenchmarkPipelineVerification,
} from "./reporting/benchmark-evaluation-logger";

export {
  STAGE1_REAL_VALIDATION_BENCHMARK_IDS,
  STAGE1_REAL_VALIDATION_MODELS,
  STAGE1_REAL_VALIDATION_MAX_API_CALLS,
  STAGE1_REAL_VALIDATION_REPEAT_COUNT,
  STAGE1_REAL_VALIDATION_KNOWLEDGE_VERSION,
  STAGE1_REAL_VALIDATION_BUDGET,
  stage1RealValidationCellCount,
} from "./config/stage1-real-validation-config";

export {
  TIER1_CONTROLLED_EVIDENCE_BENCHMARK_IDS,
  TIER1_CONTROLLED_EVIDENCE_MODELS,
  TIER1_CONTROLLED_EVIDENCE_REPEAT_COUNT,
  TIER1_CONTROLLED_EVIDENCE_MAX_API_CALLS,
  TIER1_CONTROLLED_EVIDENCE_BUDGET,
  TIER1_EVIDENCE_COLLECTION_BUDGET,
  TIER2_CONTROLLED_EVIDENCE_BENCHMARK_IDS,
  tier1ControlledEvidenceCellCount,
  tierControlledEvidenceCellCount,
} from "./config/tier1-controlled-evidence-config";

export {
  EVIDENCE_COLLECTION_PREFIX,
  logEvidenceCollectionBanner,
  logEvidenceDryRunPlan,
  logEvidenceCellResult,
  logEvidenceCollectionComplete,
} from "./evidence/controlled-evidence-logger";

export {
  buildControlledEvidencePlan,
  planControlledEvidenceCollection,
  assertControlledEvidenceBudget,
  formatControlledEvidencePlan,
  executeControlledEvidenceCollection,
  evaluateTierExpansionCriteria,
  classifyPresentationPipelineFailure,
  verifyFairComparisonCompatibility,
  type ControlledEvidenceTier,
  type ControlledEvidencePlan,
  type ControlledEvidenceExecutionResult,
  type TierExpansionRecommendation,
  type PresentationPipelineFailureClass,
} from "./evidence/controlled-evidence-expansion";

export {
  buildRoutingReadinessReport,
  formatRoutingReadinessReport,
  buildPerformanceBreakdownReports,
  type RoutingReadinessStatus,
  type RoutingReadinessReport,
  type RoutingReadinessScopeReport,
  type ModelServicePerformanceBreakdown,
} from "./evidence/routing-readiness-report";

export {
  buildEvidenceReadinessReport,
  formatEvidenceReadinessReport,
  assessEvidenceReadinessSlice,
  buildEvidenceScopeKey,
  groupRecordsByEvidenceScope,
  assessRecordEvaluationCompleteness,
  summarizeEvaluationCoverage,
  classifyEvidenceFreshness,
  DEFAULT_EVIDENCE_READINESS_THRESHOLDS,
  DEFAULT_EVIDENCE_FRESHNESS_THRESHOLDS,
  type EvidenceReadinessReport,
  type EvidenceReadinessSliceReport,
  type EvidenceReadinessState,
  type EvidenceReadinessBlocker,
  type EvidenceReadinessScope,
  type EvidenceReadinessThresholds,
} from "./evidence/readiness";

export {
  analyzeEvidenceGapsAndPlanExperiments,
  formatEvidenceGapAnalysisReport,
  gapFromReadinessSlice,
  planExperimentForGap,
  pickPrimaryBenchmarkCase,
  selectComparisonCandidate,
  type EvidenceGapAnalysisReport,
  type EvidenceGap,
  type ExperimentRecommendation,
  type EvidenceGapObservation,
  type EvidenceGapReasonCode,
} from "./evidence/gap-planning";

export {
  createRealBenchmarkExecutionService,
  defaultRealBenchmarkExecutionService,
  type RealBenchmarkRunInput,
  type RealBenchmarkRunOutput,
  type RealBenchmarkExecutionService,
} from "./engine/benchmark-real-execution-service";

export {
  SMOKE_DEFAULT_BENCHMARK_IDS,
  SMOKE_DEFAULT_MODEL_SPECS,
  buildSmokeRunConfig,
  formatSmokeExecutionPlan,
  parseSmokeModelSpecsFromEnv,
  resolveSmokeBenchmarkIds,
  resolveSmokeModels,
  type SmokeRunConfig,
  type SmokeModelSpec,
  type ConfiguredProviderRef,
} from "./config/benchmark-smoke-run-config";

export {
  CALIBRATION_DEFAULT_BENCHMARK_IDS,
  buildCalibrationRunPlan,
  formatCalibrationRunPlan,
  resolveCalibrationBenchmarkIds,
  type CalibrationRunPlan,
} from "./config/benchmark-calibration-run-config";

export {
  BENCHMARK_OUTCOME_LABELS,
  isModelQualityEvidence,
  isFairModelComparisonOutcome,
  type BenchmarkOutcome,
} from "./contracts/benchmark-outcome";

export {
  BENCHMARK_EXECUTOR_PROFILE,
  BENCHMARK_OS_EXECUTOR_PROFILE,
  executionProfileProvides,
  missingExecutionInterfaces,
  resolveExecutionProfileById,
  type BenchmarkExecutionInterface,
  type BenchmarkExecutionProfile,
} from "./engine/benchmark-execution-profile";

export {
  resolveBenchmarkValidity,
  type BenchmarkValiditySpec,
  type BenchmarkIntent,
  type BenchmarkValidationMethod,
} from "./engine/benchmark-validity-model";

export {
  checkBenchmarkCompatibility,
  formatCompatibilityVerdict,
  type BenchmarkCompatibilityVerdict,
} from "./engine/benchmark-compatibility";

export {
  resolveBenchmarkOutcome,
  interpretQualityScore,
  outcomeAffectsQualityScore,
  type BenchmarkOutcomeInput,
} from "./engine/benchmark-outcome-resolver";

export {
  explainBenchmarkCost,
  estimateBenchmarkCostFromRegistry,
  describeCostDrivers,
  type BenchmarkCostBreakdown,
} from "./engine/benchmark-cost-accounting";

export {
  CONTROL_BENCHMARK_REFS,
  classifyBenchmarkComparability,
  getCalibrationBenchmarkCases,
  type ControlBenchmarkRef,
  type ControlBenchmarkClass,
} from "./catalog/benchmark-control-catalog";

export { contractReferenceForBenchmark } from "./engine/benchmark-validation-resolver";

export {
  buildBenchmarkOsMetadata,
  benchmarkCaseUsesOsArtifactPipeline,
} from "./engine/benchmark-os-execution-metadata";

export {
  createBenchmarkAsyncMediaPlatform,
  executeBenchmarkOsPipeline,
  materializeBenchmarkOsArtifacts,
  shouldUseBenchmarkOsPipeline,
  type BenchmarkOsExecutionBridgeDeps,
} from "./engine/benchmark-os-execution-bridge";

// Step 9 — Strategy + Knowledge Optimization / Controlled Experimentation
export {
  EXPERIMENT_SYSTEM_VERSION,
  DEFAULT_EXPERIMENT_STRATEGIES,
  DEFAULT_KNOWLEDGE_CONTEXTS,
  DEFAULT_EXPERIMENT_BUDGET,
  type ExperimentStrategyDefinition,
  type KnowledgeContextRef,
  type KnowledgeScope,
  type ExperimentDefinition,
  type ExperimentMatrixInput,
  type ExperimentStatus,
  type ExperimentComparisonMode,
  type ExperimentBudget,
  type ExperimentExecutionInput,
  type ExperimentExecutionOutput,
  type ExperimentRunReport,
  type OptimizationRecommendation,
  type ExperimentAnalysisService,
  buildExperimentMatrix,
  formatExperimentMatrixPlan,
  planExperimentBudget,
  assertExperimentBudget,
  checkFairComparison,
  runExperiment,
  planExperiment,
  createExperimentAnalysisService,
  buildOptimizationRecommendation,
  formatExperimentRunReport,
  getExperimentStrategy,
  getKnowledgeContext,
  listExperimentStrategies,
  listKnowledgeContexts,
  knowledgeVersionTag,
  isStrategyApplicable,
  isKnowledgeApplicable,
} from "./experiment";

// Step 10 — Production Evidence + Shadow Optimization
export {
  PRODUCTION_BENCHMARK_ID,
  PRODUCTION_BENCHMARK_VERSION,
  type EvidenceSource,
  type EvidenceMode,
  buildProductionPerformanceRecord,
  ingestProductionEvidenceAndShadow,
  scheduleProductionEvidenceAndShadow,
  createProductionEvidenceService,
  resolveProductionValidationAsync,
  hookProductionEvidenceAfterFinalize,
  createProductionIntelligenceQueryService,
  defaultProductionIntelligenceQueryService,
  type ProductionExecutionEvidenceContext,
  type ProductionEvidenceResult,
  type ProductionEvidenceServiceDeps,
  type ProductionEvaluationStageTrace,
  type ProductionIntelligenceQueryService,
} from "./production";

export {
  type ShadowDecision,
  type ShadowDecisionStatus,
  type ShadowDecisionContext,
  type PromotionReadinessStatus,
  resolveShadowDecision,
  createShadowDecisionService,
  assessPromotionReadiness,
  loadPromotionReadinessThresholds,
  DEFAULT_PROMOTION_READINESS_THRESHOLDS,
  InMemoryShadowDecisionStore,
  defaultShadowDecisionStore,
  buildDefaultShadowCandidatePool,
} from "./shadow";

// Step 11 — Promotion governance
export {
  type PromotionCandidateLifecycle,
  type PromotionCandidate,
  createPromotionGovernanceService,
  defaultPromotionGovernanceService,
  InMemoryPromotionCandidateStore,
  defaultPromotionCandidateStore,
} from "./governance";

// Step 12/13 — Controlled adaptive routing activation + production hardening
export {
  ADAPTIVE_ROUTING_DECISION_VERSION,
  ADAPTIVE_PILOT_TEMPLATE,
  type AdaptiveRoutingDecision,
  type AdaptiveRoutingPolicy,
  type ProductionRoutingMetadata,
  resolveAdaptiveRoutingDecision,
  applyAdaptiveRoutingToPrepass,
  createAdaptiveRoutingQueryService,
  createRoutingPolicyService,
  createAdaptiveRoutingDecisionService,
  composeAdaptiveRoutingPlatform,
  bootstrapAdaptiveRoutingAtStartup,
  verifyAdaptiveCandidateCapability,
  validateAdaptivePolicy,
  resolveAdaptiveExecutionOutcome,
  deterministicRolloutBucket,
  isRolloutSelected,
  selectMatchingPolicy,
  pausePolicyOnRegression,
  sliceAdaptiveVsStatic,
  DEFAULT_ROUTING_POLICY_GUARDRAILS,
  InMemoryRoutingPolicyStore,
  InMemoryAdaptiveRoutingDecisionStore,
  InMemoryAdaptiveRollbackStore,
  MongoRoutingPolicyStore,
  MongoAdaptiveRoutingDecisionStore,
} from "./adaptive";
