/**
 * Phase 18 — Canonical Benchmarking / Evaluation public surface.
 * Observational only — reuses Action Execution, Output QA, Repair, traces.
 */

export {
  BENCHMARKING_CONTRACT_VERSION,
  DEFAULT_BENCHMARK_POLICY,
  type BenchmarkScenario,
  type BenchmarkCaseCoverage,
  type BenchmarkFinalStatus,
  type BenchmarkMetricAvailability,
  type BenchmarkMetric,
  type BenchmarkExpectedContext,
  type BenchmarkExpectedUpstream,
  type BenchmarkPolicy,
  type BenchmarkCase,
  type BenchmarkContextObservation,
  type BenchmarkUsageObservation,
  type BenchmarkLatencyObservation,
  type BenchmarkScenarioObservation,
  type BenchmarkRun,
  type ContextFidelityScore,
  type ArtifactFidelityScore,
  type AuthorityFidelityScore,
  type StructuredFidelityScore,
  type OutputQaScore,
  type RepairScore,
  type BenchmarkResult,
  type BenchmarkComparison,
} from "./types";

export {
  listBenchmarkCatalogCases,
  getBenchmarkCase,
  classifyServiceCoverage,
  listFifteenServiceCoverage,
} from "./cases";

export {
  evaluateBenchmarkScenario,
  runBenchmarkCase,
  buildBenchmarkRun,
  getBenchmarkingContractVersion,
} from "./runner";

export {
  scoreContextFidelity,
  scoreArtifactFidelity,
  scoreAuthorityFidelity,
  scoreStructuredFidelity,
  scoreOutputQa,
  scoreRepair,
  collectMetrics,
} from "./score";

export {
  compareLegacyVsCanonical,
  aggregateBenchmarkResults,
  buildBenchmarkReport,
  type BenchmarkAggregation,
} from "./report";

export { emitBenchmarkTrace } from "./trace";

export {
  buildSafeContextObservation,
  buildUnsupportedClassDObservation,
  buildQaResultStub,
} from "./fixtures";
