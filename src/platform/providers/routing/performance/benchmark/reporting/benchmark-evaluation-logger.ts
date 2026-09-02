/**
 * Observational benchmark evaluation logger — consumes existing pipeline results only.
 * Does not modify evaluation outcomes.
 */

import type { BenchmarkCase, BenchmarkModelTarget } from "../contracts/benchmark-case";
import type { BenchmarkExecutionOutput } from "../engine/record-builder";
import type { ModelPerformanceRecord } from "../contracts/model-performance-record";
import type { OutputValidationResult } from "../../../../../os/evaluation/output-validation/validation-result";
import type { HydratedArtifact } from "../../../../../os/evaluation/artifact-evaluation/types";
import {
  EVALUATION_PLANE_ID,
  EVALUATION_PLANE_VERSION,
} from "../../../../../os/evaluation/evaluation-plane/evaluation-plane-version";
import {
  ARTIFACT_EVALUATOR_ID,
  ARTIFACT_EVALUATION_VERSION,
} from "../../../../../os/evaluation/artifact-evaluation/artifact-evaluation-version";

export type BenchmarkEvaluationLogInput = {
  readonly executionId: string;
  readonly benchmarkCase: BenchmarkCase;
  readonly model: BenchmarkModelTarget;
  readonly executionOutput: BenchmarkExecutionOutput;
  readonly record: ModelPerformanceRecord;
  readonly validation?: OutputValidationResult;
  readonly hydratedArtifacts?: readonly HydratedArtifact[];
  readonly artifactPersisted?: boolean;
};

const PREFIX = {
  benchmark: "[UNAGENCY-BENCHMARK]",
  benchmarkReal: "[UNAGENCY-BENCHMARK-REAL]",
  evaluation: "[UNAGENCY-EVALUATION]",
  validation: "[UNAGENCY-VALIDATION]",
  qualityGate: "[UNAGENCY-QUALITY-GATE]",
  performance: "[UNAGENCY-PERFORMANCE]",
};

export type BenchmarkPipelineVerification = {
  readonly artifactCreated: boolean;
  readonly artifactPersisted: boolean;
  readonly artifactHydrated: boolean;
  readonly evaluationExecuted: boolean;
  readonly step2Executed: boolean;
  readonly performanceRecordCreated: boolean;
};

export function buildBenchmarkPipelineVerification(
  input: BenchmarkEvaluationLogInput,
): BenchmarkPipelineVerification {
  const artifactIds = input.executionOutput.mediaArtifactIds ?? [];
  const hydrated = (input.hydratedArtifacts?.length ?? 0) > 0;
  return Object.freeze({
    artifactCreated: artifactIds.length > 0,
    artifactPersisted: input.artifactPersisted === true,
    artifactHydrated: hydrated,
    evaluationExecuted: Boolean(input.validation),
    step2Executed: Boolean(input.validation?.contractId),
    performanceRecordCreated: Boolean(input.record?.performanceRecordId),
  });
}

/** Readable terminal summary for real-model Stage 1 validation runs. */
export function logBenchmarkRealExecutionSummary(
  input: BenchmarkEvaluationLogInput & {
    readonly requestId: string;
    readonly pipeline: BenchmarkPipelineVerification;
  },
): void {
  const { benchmarkCase: bc, model, executionOutput, record, validation } = input;
  const evalPlaneVersion =
    provenanceValue(record.provenance, "evaluationPlaneVersion") ?? EVALUATION_PLANE_VERSION;
  const artifactEvaluatorVersion =
    provenanceValue(record.provenance, "artifactEvaluatorVersion") ?? ARTIFACT_EVALUATION_VERSION;

  console.log("\n" + "-".repeat(50));
  line(PREFIX.benchmarkReal, "");
  console.log(`Request ID: ${input.requestId}`);
  console.log(`Benchmark: ${bc.benchmarkId}`);
  console.log(`Service: ${bc.service}`);
  console.log(`Subtype: ${bc.subtype}`);
  console.log(`Industry: ${bc.industry ?? "general"}`);
  console.log(`Provider: ${model.providerId}`);
  console.log(`Model: ${model.modelId}`);

  console.log("\nExecution:");
  const execStatus = executionOutput.operationalFailure
    ? "OPERATIONAL_FAILURE"
    : executionOutput.skippedPreFlight
      ? "SKIPPED_PREFLIGHT"
      : "SUCCESS";
  console.log(`  status: ${execStatus}`);
  console.log(`  latency: ${record.latencyMs}ms`);
  if (record.modelLatencyMs != null) console.log(`  model latency: ${record.modelLatencyMs}ms`);
  if (record.totalTokens != null) console.log(`  tokens: ${record.totalTokens}`);
  console.log(
    `  estimated cost: ${record.costAvailable && record.estimatedCost != null ? `$${record.estimatedCost.toFixed(4)}` : "unavailable"}`,
  );

  const artifactIds = executionOutput.mediaArtifactIds ?? [];
  console.log("\nArtifact:");
  console.log(`  output kind: ${bc.outputKind}`);
  console.log(`  artifact IDs: ${artifactIds.length ? artifactIds.join(", ") : "none"}`);
  console.log(`  artifact type: ${input.hydratedArtifacts?.[0]?.kind ?? "n/a"}`);
  console.log(
    `  materialization status: ${artifactIds.length > 0 ? "materialized" : "none"}`,
  );

  console.log("\nCONTRACT VALIDATION:");
  if (validation) {
    const h = validation.hardRequirementSummary;
    console.log(`  status: ${validation.status}`);
    console.log(`  completion allowed: ${validation.completionAllowed ? "yes" : "no"}`);
    console.log(`  hard requirements passed: ${h.passed}`);
    console.log(`  hard requirements failed: ${h.failed}`);
    console.log(`  critical failures: ${validation.failureSummary.failures.filter((f) => f.severity === "critical").length}`);
  } else {
    console.log("  status: UNAVAILABLE");
  }

  console.log("\nEVALUATION:");
  console.log(`  evaluation plane: ${EVALUATION_PLANE_ID}@${evalPlaneVersion}`);
  console.log(`  artifact evaluator: ${ARTIFACT_EVALUATOR_ID}@${artifactEvaluatorVersion}`);
  console.log(`  measured dimensions: ${record.measuredQualityDimensions.join(", ") || "none"}`);
  console.log(`  unmeasured dimensions: ${record.unmeasuredQualityDimensions.join(", ") || "none"}`);

  console.log("\nQUALITY:");
  console.log(`  overall measured score: ${record.qualityScore}`);
  if (validation) {
    for (const dim of validation.qualityDimensions.slice(0, 8)) {
      console.log(`  ${dim.dimensionId}: ${dim.score} (${dim.status}, ${dim.evaluationMethod})`);
    }
    console.log(`  quality interpretation: ${validation.status} (threshold met: ${validation.qualitySummary.thresholdMet ? "yes" : "no"})`);
  }

  console.log("\nOUTCOME:");
  console.log(`  ${record.benchmarkOutcome}`);

  console.log("\nEVIDENCE:");
  console.log(`  performance record ID: ${record.performanceRecordId}`);
  console.log(`  benchmark version: ${record.benchmarkVersion}`);
  console.log(`  contract version: ${record.contractVersion}`);
  console.log(`  evaluation version: ${evalPlaneVersion}`);

  console.log("\nPIPELINE VERIFICATION:");
  console.log(`  artifact created: ${input.pipeline.artifactCreated ? "yes" : "no"}`);
  console.log(`  artifact persisted: ${input.pipeline.artifactPersisted ? "yes" : "no"}`);
  console.log(`  artifact hydrated: ${input.pipeline.artifactHydrated ? "yes" : "no"}`);
  console.log(`  evaluation executed: ${input.pipeline.evaluationExecuted ? "yes" : "no"}`);
  console.log(`  Step 2 executed: ${input.pipeline.step2Executed ? "yes" : "no"}`);
  console.log(`  performance record created: ${input.pipeline.performanceRecordCreated ? "yes" : "no"}`);
  console.log("-".repeat(50));
}

function line(prefix: string, message: string): void {
  console.log(`${prefix} ${message}`);
}

function section(title: string): void {
  console.log("\n" + "-".repeat(50));
  console.log(title);
  console.log("-".repeat(50));
}

function provenanceValue(
  entries: readonly { readonly field: string; readonly value: string }[],
  field: string,
): string | undefined {
  return entries.find((p) => p.field === field)?.value;
}

export function logBenchmarkStarted(input: {
  readonly benchmarkId: string;
  readonly model: BenchmarkModelTarget;
  readonly executionId: string;
}): void {
  line(PREFIX.benchmark, `Started benchmark=${input.benchmarkId} model=${input.model.modelId} execution=${input.executionId}`);
}

export function logModelExecutionStarted(input: {
  readonly benchmarkId: string;
  readonly model: BenchmarkModelTarget;
}): void {
  line(PREFIX.benchmark, `Model execution started benchmark=${input.benchmarkId} provider=${input.model.providerId}`);
}

export function logModelExecutionCompleted(input: {
  readonly latencyMs: number;
  readonly operationalFailure?: boolean;
}): void {
  line(
    PREFIX.benchmark,
    `Model execution completed latency=${input.latencyMs}ms` +
      (input.operationalFailure ? " status=OPERATIONAL_FAILURE" : " status=SUCCESS"),
  );
}

export function logArtifactCreated(input: {
  readonly artifactIds: readonly string[];
  readonly outputKind: string;
}): void {
  line(
    PREFIX.benchmark,
    `Artifact created outputKind=${input.outputKind} ids=${input.artifactIds.join(", ") || "none"}`,
  );
}

export function logEvaluationStarted(): void {
  line(PREFIX.evaluation, "Evaluation Plane started");
}

export function logBenchmarkEvaluationReport(input: BenchmarkEvaluationLogInput): void {
  const { benchmarkCase: bc, model, executionOutput, record, validation, hydratedArtifacts } = input;

  section("UNAGENCY BENCHMARK EVALUATION");
  console.log(`Execution ID: ${input.executionId}`);
  console.log(`Benchmark ID: ${bc.benchmarkId}`);
  console.log(`Service: ${bc.service}`);
  console.log(`Subtype: ${bc.subtype}`);
  console.log(`Industry: ${bc.industry ?? "general"}`);
  console.log(`Model: ${model.modelId}`);
  console.log(`Provider: ${model.providerId}`);

  section("EXECUTION");
  const execStatus = executionOutput.operationalFailure
    ? "OPERATIONAL_FAILURE"
    : executionOutput.skippedPreFlight
      ? "SKIPPED_PREFLIGHT"
      : "SUCCESS";
  console.log(`Execution status: ${execStatus}`);
  console.log(`Latency: ${record.latencyMs}ms`);
  if (record.modelLatencyMs != null) console.log(`Model latency: ${record.modelLatencyMs}ms`);
  if (record.inputTokens != null) console.log(`Input tokens: ${record.inputTokens}`);
  if (record.outputTokens != null) console.log(`Output tokens: ${record.outputTokens}`);
  if (record.totalTokens != null) console.log(`Total tokens: ${record.totalTokens}`);
  console.log(
    `Estimated cost: ${record.costAvailable && record.estimatedCost != null ? `$${record.estimatedCost.toFixed(4)}` : "unavailable"}`,
  );

  section("ARTIFACT");
  const artifactIds = executionOutput.mediaArtifactIds ?? [];
  console.log(`Output kind: ${bc.outputKind}`);
  console.log(`Artifact ID(s): ${artifactIds.length > 0 ? artifactIds.join(", ") : "none"}`);
  if (hydratedArtifacts?.length) {
    for (const h of hydratedArtifacts) {
      console.log(`Artifact type: ${h.kind} mime=${h.mimeType} bytes=${h.byteSize}`);
    }
  }
  console.log(`Artifact created: ${artifactIds.length > 0 ? "YES" : "NO"}`);
  console.log(`Artifact persisted: ${input.artifactPersisted === true ? "YES" : artifactIds.length > 0 ? "UNKNOWN" : "NO"}`);
  console.log(`Artifact hydrated: ${(hydratedArtifacts?.length ?? 0) > 0 ? "YES" : "NO"}`);

  section("EVALUATION PLANE");
  const evalPlaneId =
    provenanceValue(record.provenance, "evaluationPlaneId") ?? EVALUATION_PLANE_ID;
  const evalPlaneVersion =
    provenanceValue(record.provenance, "evaluationPlaneVersion") ?? EVALUATION_PLANE_VERSION;
  console.log(`Evaluation Plane: ${evalPlaneId}`);
  console.log(`Evaluation Plane Version: ${evalPlaneVersion}`);
  console.log(`Artifact Evaluator: ${provenanceValue(record.provenance, "artifactEvaluatorId") ?? ARTIFACT_EVALUATOR_ID}`);
  console.log(`Artifact Evaluator Version: ${provenanceValue(record.provenance, "artifactEvaluatorVersion") ?? ARTIFACT_EVALUATION_VERSION}`);

  logEvaluationStarted();

  if (validation) {
    for (const dim of validation.qualityDimensions) {
      console.log(`\n${dim.label || dim.dimensionId}`);
      console.log(`  status: ${dim.status}`);
      console.log(`  score: ${dim.score}`);
      console.log(`  measurement: ${dim.evaluationMethod}`);
      console.log(`  evidence: ${dim.evidence.slice(0, 3).join("; ") || "none"}`);
    }
    for (const dimId of record.unmeasuredQualityDimensions) {
      console.log(`\n${dimId}`);
      console.log("  status: NOT_AUTOMATED");
      console.log("  measurement: NOT_AUTOMATED");
    }
  } else {
    console.log("Evaluation unavailable — validation did not run");
  }

  section("STEP 2 CONTRACT VALIDATION");
  if (validation) {
    console.log(`Contract: ${validation.contractId}`);
    console.log(`Contract Version: ${validation.contractVersion}`);
    for (const req of validation.requirements) {
      console.log(`\n${req.requirementId}`);
      console.log(`  status: ${req.status}`);
      console.log(`  expected: ${req.expectedValue}`);
      console.log(`  actual: ${req.actualValue ?? "n/a"}`);
      console.log(`  evidence: ${req.evidence.slice(0, 2).join("; ") || "none"}`);
      if (req.repairGuidance) console.log(`  repair guidance: ${req.repairGuidance}`);
    }
  } else {
    console.log("Validation unavailable");
  }

  section("QUALITY GATE");
  if (validation) {
    const h = validation.hardRequirementSummary;
    console.log(`Hard requirements passed: ${h.passed}`);
    console.log(`Hard requirements failed: ${h.failed}`);
    console.log(`Hard requirements unverified: ${h.unverified}`);
    console.log(`Quality score: ${validation.overallScore}`);
    console.log(`Threshold met: ${validation.qualitySummary.thresholdMet ? "YES" : "NO"}`);
    console.log(`Final status: ${validation.status}`);
    console.log(`Completion allowed: ${validation.completionAllowed ? "YES" : "NO"}`);
  } else {
    console.log(`Final status: unavailable`);
    console.log(`Completion allowed: NO`);
  }

  section("FAILURE / OUTCOME");
  console.log(`Benchmark outcome: ${record.benchmarkOutcome}`);
  if (executionOutput.operationalFailure) {
    console.log(`Failure category: ${executionOutput.operationalFailure.category}`);
    console.log(`Evidence: ${executionOutput.operationalFailure.message}`);
  }
  if (validation?.failureSummary.failures.length) {
    for (const f of validation.failureSummary.failures.slice(0, 5)) {
      console.log(`\n${f.requirementId}`);
      console.log(`  category: ${f.failureCategory}`);
      console.log(`  severity: ${f.severity}`);
      console.log(`  expected: ${f.expected}`);
      console.log(`  actual: ${f.actual ?? "n/a"}`);
      console.log(`  evidence: ${f.evidence.slice(0, 2).join("; ") || "none"}`);
      if (f.repairGuidance) console.log(`  repair guidance: ${f.repairGuidance}`);
    }
  }

  section("PERFORMANCE EVIDENCE");
  console.log(`Performance Record ID: ${record.performanceRecordId}`);
  console.log(`Valid for model comparison: ${record.validForModelComparison ? "YES" : "NO"}`);
  console.log(`Sample count: 1`);
  console.log(`Confidence: INSUFFICIENT_EVIDENCE (single-sample Stage 1 run)`);
  console.log(`Measured dimensions: ${record.measuredQualityDimensions.join(", ") || "none"}`);
  console.log(`Unmeasured dimensions: ${record.unmeasuredQualityDimensions.join(", ") || "none"}`);

  section("PROVENANCE");
  console.log(`Benchmark version: ${record.benchmarkVersion}`);
  console.log(`Contract version: ${record.contractVersion}`);
  console.log(`Strategy version: ${record.strategyVersion}`);
  console.log(`Knowledge version: ${record.knowledgeVersion ?? "default"}`);
  console.log(`Execution profile: ${record.executionProfileId}@${record.executionProfileVersion}`);
  console.log(`Evaluation Plane version: ${evalPlaneVersion}`);
  console.log(`Artifact evaluator version: ${provenanceValue(record.provenance, "artifactEvaluatorVersion") ?? ARTIFACT_EVALUATION_VERSION}`);
  console.log(`Model version: ${record.modelVersion ?? "unknown"}`);

  section("FINAL SUMMARY");
  console.log(`Model: ${model.modelId}`);
  console.log(`Service: ${bc.service}`);
  console.log(`Benchmark: ${bc.benchmarkId}`);
  console.log(`Outcome: ${record.benchmarkOutcome}`);
  console.log(`Quality: ${record.qualityScore}`);
  console.log(`Hard requirement pass rate: ${(record.hardRequirementPassRate * 100).toFixed(1)}%`);
  console.log(`Latency: ${record.latencyMs}ms`);
  console.log(
    `Cost: ${record.costAvailable && record.estimatedCost != null ? `$${record.estimatedCost.toFixed(4)}` : "unavailable"}`,
  );
  console.log(`Confidence: INSUFFICIENT_EVIDENCE`);
  console.log(`Comparison validity: ${record.validForModelComparison ? "valid sample" : "not valid for comparison"}`);
  console.log(`Specialization claim: NOT ALLOWED (n=1 per model/service)`);
  console.log("-".repeat(50));
}

export function logBenchmarkEvaluationJson(input: BenchmarkEvaluationLogInput): void {
  const payload = {
    executionId: input.executionId,
    benchmarkId: input.benchmarkCase.benchmarkId,
    model: input.model,
    outcome: input.record.benchmarkOutcome,
    qualityScore: input.record.qualityScore,
    hardRequirementPassRate: input.record.hardRequirementPassRate,
    latencyMs: input.record.latencyMs,
    cost: input.record.estimatedCost,
    artifactIds: input.executionOutput.mediaArtifactIds ?? [],
    performanceRecordId: input.record.performanceRecordId,
    confidence: "INSUFFICIENT_EVIDENCE",
  };
  line(PREFIX.performance, JSON.stringify(payload));
}

export function printStage1ComparisonTable(
  rows: readonly {
    readonly model: string;
    readonly service: string;
    readonly benchmark: string;
    readonly outcome: string;
    readonly quality: number;
    readonly compliance: string;
    readonly latency: number;
    readonly cost: string;
    readonly confidence: string;
  }[],
): void {
  section("STAGE 1 COMPARISON TABLE");
  console.log("MODEL | SERVICE | BENCHMARK | OUTCOME | QUALITY | COMPLIANCE | LATENCY | COST | CONFIDENCE");
  for (const r of rows) {
    console.log(
      `${r.model} | ${r.service} | ${r.benchmark} | ${r.outcome} | ${r.quality} | ${r.compliance} | ${r.latency}ms | ${r.cost} | ${r.confidence}`,
    );
  }
}

export function printStage1Totals(input: {
  readonly evaluationRecords: number;
  readonly performanceRecords: number;
  readonly artifactsCreated: number;
  readonly evaluationFailures: number;
  readonly operationalFailures: number;
  readonly apiCallsExecuted: number;
  readonly apiCallsMaximum: number;
}): void {
  section("STAGE 1 TOTALS");
  console.log(`4 API calls maximum: ${input.apiCallsMaximum}`);
  console.log(`Actual API calls executed: ${input.apiCallsExecuted}`);
  console.log(`Evaluation records created: ${input.evaluationRecords}`);
  console.log(`Performance records created: ${input.performanceRecords}`);
  console.log(`Artifacts created: ${input.artifactsCreated}`);
  console.log(`Evaluation failures: ${input.evaluationFailures}`);
  console.log(`Operational failures: ${input.operationalFailures}`);
}
