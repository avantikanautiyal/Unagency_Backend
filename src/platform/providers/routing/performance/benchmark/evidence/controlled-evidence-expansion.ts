/**
 * Step 15 — Controlled evidence expansion with tiered execution and budget protection.
 * Composes Step 8 evidence matrix + Step 4A budget guards without duplicating engines.
 */

import type { BenchmarkModelTarget } from "../contracts/benchmark-case";
import { DEFAULT_BENCHMARK_STRATEGY } from "../contracts/benchmark-case";
import type { ModelPerformanceRecord } from "../contracts/model-performance-record";
import { getBenchmarkCase } from "../catalog/benchmark-catalog";
import { benchmarkCaseUsesOsArtifactPipeline } from "../engine/benchmark-os-execution-metadata";
import {
  assertBenchmarkBudget,
  planBenchmarkInvocations,
  type BenchmarkBudgetConfig,
  type BenchmarkInvocationPlan,
} from "../contracts/benchmark-execution-config";
import {
  buildEvidenceMatrix,
  assertEvidenceCollectionBudget,
  type EvidenceMatrixPlan,
} from "./evidence-matrix";
import {
  collectEvidence,
  type EvidenceCollectionOutput,
} from "./evidence-collection-service";
import { runBenchmark, type BenchmarkModelExecutor, type BenchmarkRunResult } from "../engine/benchmark-runner";
import type { EvidenceCollectionBudget } from "./evidence-collection-config";
import {
  filterValidComparisonRecords,
  filterObservationalProductionRecords,
  separateEvidenceQuality,
} from "./evidence-validity";
import { checkComparisonCompatibility } from "../intelligence/comparison-compatibility";
import type { BenchmarkExecutionOutput } from "../engine/record-builder";
import {
  TIER1_CONTROLLED_EVIDENCE_BENCHMARK_IDS,
  TIER1_CONTROLLED_EVIDENCE_MODELS,
  TIER1_CONTROLLED_EVIDENCE_REPEAT_COUNT,
  TIER1_CONTROLLED_EVIDENCE_KNOWLEDGE_VERSION,
  TIER1_CONTROLLED_EVIDENCE_BUDGET,
  TIER1_EVIDENCE_COLLECTION_BUDGET,
  TIER2_CONTROLLED_EVIDENCE_BENCHMARK_IDS,
  TIER2_CONTROLLED_EVIDENCE_REPEAT_COUNT,
  TIER2_EVIDENCE_COLLECTION_BUDGET,
} from "../config/tier1-controlled-evidence-config";
import {
  beginExecutionTrace,
  recordExecutionTraceStage,
  finalizeExecutionTrace,
} from "../../../../../os/observability/execution-trace";
import { buildBenchmarkPipelineVerification } from "../reporting/benchmark-evaluation-logger";
import { resolveBenchmarkValidationAsync } from "../engine/benchmark-validation-resolver";
import { createArtifactHydrator } from "../../../../../os/evaluation/artifact-evaluation";

export type ControlledEvidenceTier = 1 | 2 | 3;

export type ControlledEvidencePlan = EvidenceMatrixPlan & {
  readonly tier: ControlledEvidenceTier;
  readonly benchmarkIds: readonly string[];
  readonly models: readonly BenchmarkModelTarget[];
  readonly invocationPlan: BenchmarkInvocationPlan;
  readonly budget: EvidenceCollectionBudget;
  readonly adaptiveRoutingPinned: true;
  readonly knowledgeVersion: string;
  readonly concurrency: number;
};

export type TierExpansionRecommendation =
  | "HOLD_TIER1"
  | "EXPAND_TIER2"
  | "EXPAND_TIER3"
  | "INSUFFICIENT_EVIDENCE";

export type PresentationPipelineFailureClass =
  | "NONE"
  | "EXPANSION_MISSING_ROUTES"
  | "EXPANSION_ROUTES_NOT_EXPORTABLE"
  | "EXPANSION_INVALID_STRUCTURED_OUTPUT"
  | "EXPANSION_PROVIDER_ERROR"
  | "EXPANSION_INCOMPLETE"
  | "MATERIALIZATION_FAILURE"
  | "EXECUTION_CAPABILITY_UNAVAILABLE"
  | "PROVIDER_OPERATIONAL_FAILURE"
  | "CONTRACT_FAILURE"
  | "MODEL_QUALITY_FAILURE";

export type ControlledEvidenceExecutionResult = EvidenceCollectionOutput & {
  readonly tier: ControlledEvidenceTier;
  readonly invocationPlan: BenchmarkInvocationPlan;
  readonly executedCalls: number;
  readonly totalCostUsd: number;
  readonly records: readonly ModelPerformanceRecord[];
};

function tierScope(tier: ControlledEvidenceTier): {
  readonly benchmarkIds: readonly string[];
  readonly repeatCount: number;
  readonly budget: EvidenceCollectionBudget;
  readonly benchmarkBudget: BenchmarkBudgetConfig;
} {
  if (tier === 1) {
    return Object.freeze({
      benchmarkIds: TIER1_CONTROLLED_EVIDENCE_BENCHMARK_IDS,
      repeatCount: TIER1_CONTROLLED_EVIDENCE_REPEAT_COUNT,
      budget: TIER1_EVIDENCE_COLLECTION_BUDGET,
      benchmarkBudget: TIER1_CONTROLLED_EVIDENCE_BUDGET,
    });
  }
  if (tier === 2) {
    return Object.freeze({
      benchmarkIds: TIER2_CONTROLLED_EVIDENCE_BENCHMARK_IDS,
      repeatCount: TIER2_CONTROLLED_EVIDENCE_REPEAT_COUNT,
      budget: TIER2_EVIDENCE_COLLECTION_BUDGET,
      benchmarkBudget: Object.freeze({
        maxInvocations: TIER2_EVIDENCE_COLLECTION_BUDGET.maxInvocations,
        maxEstimatedCostUsd: null,
        largeRunThreshold: TIER2_EVIDENCE_COLLECTION_BUDGET.largeRunThreshold,
        allowLargeRunOverride: false,
      }),
    });
  }
  return Object.freeze({
    benchmarkIds: TIER1_CONTROLLED_EVIDENCE_BENCHMARK_IDS,
    repeatCount: TIER1_CONTROLLED_EVIDENCE_REPEAT_COUNT,
    budget: TIER1_EVIDENCE_COLLECTION_BUDGET,
    benchmarkBudget: TIER1_CONTROLLED_EVIDENCE_BUDGET,
  });
}

export function buildControlledEvidencePlan(input?: {
  readonly tier?: ControlledEvidenceTier;
  readonly models?: readonly BenchmarkModelTarget[];
  readonly knowledgeVersion?: string;
}): ControlledEvidencePlan {
  const tier = input?.tier ?? 1;
  const scope = tierScope(tier);
  const models = input?.models ?? TIER1_CONTROLLED_EVIDENCE_MODELS;
  const knowledgeVersion = input?.knowledgeVersion ?? TIER1_CONTROLLED_EVIDENCE_KNOWLEDGE_VERSION;

  for (const benchmarkId of scope.benchmarkIds) {
    const bc = getBenchmarkCase(benchmarkId);
    if (!bc) {
      throw new Error(`Unknown benchmark case: ${benchmarkId}`);
    }
    if (!benchmarkCaseUsesOsArtifactPipeline(bc)) {
      throw new Error(
        `Benchmark ${benchmarkId} does not use OS artifact pipeline — cannot run controlled evidence collection`,
      );
    }
  }

  const matrix = buildEvidenceMatrix({
    strategy: "targeted",
    benchmarkIds: [...scope.benchmarkIds],
    models,
    repeatCount: scope.repeatCount,
    knowledgeVersions: [knowledgeVersion],
  });

  const invocationPlan = planBenchmarkInvocations({
    benchmarkIds: [...scope.benchmarkIds],
    models,
    repeatCount: scope.repeatCount,
    budget: scope.benchmarkBudget,
  });

  return Object.freeze({
    ...matrix,
    tier,
    benchmarkIds: scope.benchmarkIds,
    models,
    invocationPlan,
    budget: scope.budget,
    adaptiveRoutingPinned: true,
    knowledgeVersion,
    concurrency: scope.budget.maxConcurrentExecutions,
    summary: Object.freeze([
      ...matrix.summary,
      `Tier: ${tier}`,
      `Knowledge: ${knowledgeVersion}`,
      `Adaptive routing: OFF (models pinned)`,
      `Concurrency: ${scope.budget.maxConcurrentExecutions}`,
    ]),
  });
}

export function assertControlledEvidenceBudget(plan: ControlledEvidencePlan): void {
  assertEvidenceCollectionBudget(plan, plan.budget);
  assertBenchmarkBudget(plan.invocationPlan, {
    maxInvocations: plan.budget.maxInvocations,
    maxEstimatedCostUsd: plan.budget.maxEstimatedCostUsd ?? null,
    largeRunThreshold: plan.budget.largeRunThreshold,
    allowLargeRunOverride: plan.budget.allowLargeRunOverride ?? false,
  });
}

export function formatControlledEvidencePlan(plan: ControlledEvidencePlan): string {
  return [
    "=== Controlled Evidence Collection Plan ===",
    ...plan.summary,
    "",
    "Sample cells:",
    ...plan.cells.slice(0, 10).map(
      (c) =>
        `  [tier ${plan.tier}] ${c.benchmarkId} × ${c.model.modelId}` +
        (c.repeatIndex != null && c.repeatIndex > 0 ? ` [rep ${c.repeatIndex + 1}]` : ""),
    ),
    plan.cells.length > 10 ? `  ... and ${plan.cells.length - 10} more` : "",
    "",
    `Benchmark invocation plan: ${plan.invocationPlan.totalInvocations} total`,
    `Within max invocations: ${plan.invocationPlan.withinMaxInvocations}`,
  ].join("\n");
}

export function classifyPresentationPipelineFailure(input: {
  readonly record: ModelPerformanceRecord;
  readonly executionOutput?: BenchmarkExecutionOutput;
}): PresentationPipelineFailureClass {
  const { record, executionOutput } = input;
  const message = [
    executionOutput?.operationalFailure?.message ?? "",
    executionOutput?.buildOutput ?? "",
    ...Object.keys(record.failureCategories ?? {}),
  ]
    .join(" ")
    .toLowerCase();

  const expansionCategory = (() => {
    const structured = executionOutput?.structuredData as
      | Record<string, unknown>
      | undefined;
    const diag = structured?.presentationExpansionDiagnostic as
      | { failureCategory?: string }
      | undefined;
    return diag?.failureCategory;
  })();

  if (expansionCategory === "PROVIDER_ERROR") {
    return "EXPANSION_PROVIDER_ERROR";
  }
  if (expansionCategory === "INVALID_STRUCTURED_OUTPUT") {
    return "EXPANSION_INVALID_STRUCTURED_OUTPUT";
  }
  if (expansionCategory === "ROUTES_NOT_EXPORTABLE") {
    return "EXPANSION_ROUTES_NOT_EXPORTABLE";
  }
  if (expansionCategory === "ROUTES_NOT_FOUND") {
    return "EXPANSION_MISSING_ROUTES";
  }
  if (expansionCategory === "MATERIALIZATION_FAILURE") {
    return "MATERIALIZATION_FAILURE";
  }

  if (record.benchmarkOutcome === "EXECUTION_CAPABILITY_UNAVAILABLE") {
    return "EXECUTION_CAPABILITY_UNAVAILABLE";
  }
  if (record.benchmarkOutcome === "PROVIDER_OPERATIONAL_FAILURE") {
    if (
      message.includes("provider_error") ||
      message.includes("provider dispatch") ||
      message.includes("http 401") ||
      message.includes("authentication")
    ) {
      return "EXPANSION_PROVIDER_ERROR";
    }
    if (
      message.includes("invalid_structured_output") ||
      message.includes("structured_output_invalid")
    ) {
      return "EXPANSION_INVALID_STRUCTURED_OUTPUT";
    }
    if (
      message.includes("routes_not_exportable") ||
      message.includes("not exportable")
    ) {
      return "EXPANSION_ROUTES_NOT_EXPORTABLE";
    }
    if (message.includes("missing_routes") || message.includes("missing routes")) {
      return "EXPANSION_MISSING_ROUTES";
    }
    if (message.includes("expansion")) {
      return "EXPANSION_INCOMPLETE";
    }
    return "PROVIDER_OPERATIONAL_FAILURE";
  }
  if (record.benchmarkOutcome === "CONTRACT_FAILURE") {
    return "CONTRACT_FAILURE";
  }
  if (record.benchmarkOutcome === "MODEL_QUALITY_FAILURE") {
    return "MODEL_QUALITY_FAILURE";
  }
  if (
    executionOutput?.buildSucceeded === false ||
    message.includes("materializ") ||
    message.includes("export")
  ) {
    return "MATERIALIZATION_FAILURE";
  }
  if (record.benchmarkOutcome === "MODEL_SUCCESS") {
    return "NONE";
  }
  return "PROVIDER_OPERATIONAL_FAILURE";
}

export function verifyFairComparisonCompatibility(
  records: readonly ModelPerformanceRecord[],
): { readonly compatiblePairs: number; readonly incompatiblePairs: number; readonly reasons: readonly string[] } {
  const valid = filterValidComparisonRecords(records);
  let compatiblePairs = 0;
  let incompatiblePairs = 0;
  const reasons: string[] = [];

  for (let i = 0; i < valid.length; i += 1) {
    for (let j = i + 1; j < valid.length; j += 1) {
      const compat = checkComparisonCompatibility(valid[i]!, valid[j]!);
      if (compat.compatible) compatiblePairs += 1;
      else {
        incompatiblePairs += 1;
        reasons.push(...compat.reasons);
      }
    }
  }

  const productionMixed = filterObservationalProductionRecords(records);
  if (productionMixed.length > 0) {
    reasons.push(
      `Excluded ${productionMixed.length} observational production record(s) from controlled comparison`,
    );
  }

  return Object.freeze({
    compatiblePairs,
    incompatiblePairs,
    reasons: Object.freeze([...new Set(reasons)]),
  });
}

export function evaluateTierExpansionCriteria(input: {
  readonly records: readonly ModelPerformanceRecord[];
  readonly completedTier: ControlledEvidenceTier;
}): TierExpansionRecommendation {
  const separated = separateEvidenceQuality(input.records);
  const validCount = separated.validComparison.length;
  const operationalRate =
    input.records.length > 0
      ? separated.operationalFailures.length / input.records.length
      : 1;

  if (validCount < 3) {
    return "INSUFFICIENT_EVIDENCE";
  }

  if (operationalRate > 0.5) {
    return input.completedTier === 1 ? "EXPAND_TIER2" : "HOLD_TIER1";
  }

  const qualitySpread =
    validCount >= 2
      ? Math.max(...separated.validComparison.map((r) => r.qualityScore)) -
        Math.min(...separated.validComparison.map((r) => r.qualityScore))
      : 0;

  if (qualitySpread >= 10 || operationalRate > 0.25) {
    return input.completedTier === 1 ? "EXPAND_TIER2" : "HOLD_TIER1";
  }

  if (validCount >= 6 && input.completedTier === 2) {
    return "EXPAND_TIER3";
  }

  return "HOLD_TIER1";
}

async function recordBenchmarkExecutionTrace(input: {
  readonly executionId: string;
  readonly benchmarkCase: ReturnType<typeof getBenchmarkCase>;
  readonly model: BenchmarkModelTarget;
  readonly executionOutput: BenchmarkExecutionOutput;
  readonly record: ModelPerformanceRecord;
  readonly organizationId: string;
}): Promise<void> {
  if (!input.benchmarkCase) return;

  beginExecutionTrace({
    requestId: input.executionId,
    executionId: input.executionId,
    correlationId: input.executionId,
    service: input.benchmarkCase.service,
    subtype: input.benchmarkCase.subtype,
    outputKind: input.benchmarkCase.outputKind,
    requestedProviderId: input.model.providerId,
    requestedModelId: input.model.modelId,
    adaptiveRoutingEnabled: false,
    usedStructuredOutput: true,
    usedOsArtifactPipeline: true,
  });

  recordExecutionTraceStage({
    executionId: input.executionId,
    stage: "static_routing",
    status: "COMPLETED",
    details: Object.freeze({ routingMode: "static", adaptiveRoutingEnabled: false }),
  });
  recordExecutionTraceStage({
    executionId: input.executionId,
    stage: "adaptive_routing",
    status: "SKIPPED",
    skipReason: "ADAPTIVE_ROUTING_DISABLED",
  });
  recordExecutionTraceStage({
    executionId: input.executionId,
    stage: "provider_selection",
    status: "COMPLETED",
    details: Object.freeze({
      providerId: input.model.providerId,
      modelId: input.model.modelId,
      pinned: true,
    }),
  });
  recordExecutionTraceStage({
    executionId: input.executionId,
    stage: "provider_dispatch",
    status: input.record.reliabilityStatus === "operational_failure" ? "FAILED" : "COMPLETED",
  });
  recordExecutionTraceStage({
    executionId: input.executionId,
    stage: "structured_output",
    status: input.executionOutput.structuredData ? "COMPLETED" : "FAILED",
    skipReason: input.executionOutput.structuredData ? undefined : "structured_output_missing",
  });
  recordExecutionTraceStage({
    executionId: input.executionId,
    stage: "os_materialization",
    status: input.executionOutput.buildSucceeded === false ? "FAILED" : "COMPLETED",
  });
  recordExecutionTraceStage({
    executionId: input.executionId,
    stage: "artifact_persistence",
    status: (input.executionOutput.mediaArtifactIds?.length ?? 0) > 0 ? "COMPLETED" : "SKIPPED",
    skipReason:
      (input.executionOutput.mediaArtifactIds?.length ?? 0) > 0
        ? undefined
        : "no_artifacts_to_persist",
  });

  let hydratedCount = 0;
  if (
    (input.executionOutput.mediaArtifactIds?.length ?? 0) > 0 &&
    input.executionOutput.benchmarkAsyncMedia &&
    input.executionOutput.benchmarkArtifactsRepo
  ) {
    const hydrate = createArtifactHydrator({
      artifactsRepo: input.executionOutput.benchmarkArtifactsRepo,
      blobStorage: input.executionOutput.benchmarkAsyncMedia.blobStorage,
      organizationId: input.organizationId,
    });
    hydratedCount = (await hydrate(input.executionOutput.mediaArtifactIds!)).length;
  }

  const validationOutcome = await resolveBenchmarkValidationAsync({
    benchmarkCase: input.benchmarkCase,
    executionOutput: input.executionOutput,
    organizationId: input.organizationId,
    executionId: input.executionId,
    artifactEvaluationDeps:
      input.executionOutput.benchmarkAsyncMedia && input.executionOutput.benchmarkArtifactsRepo
        ? {
            asyncMedia: input.executionOutput.benchmarkAsyncMedia,
            artifactsRepo: input.executionOutput.benchmarkArtifactsRepo,
          }
        : undefined,
  });

  const validation =
    validationOutcome.kind === "validated" ? validationOutcome.validation : undefined;

  const pipeline = buildBenchmarkPipelineVerification({
    executionId: input.executionId,
    benchmarkCase: input.benchmarkCase,
    model: input.model,
    executionOutput: input.executionOutput,
    record: input.record,
    validation,
    hydratedArtifacts: hydratedCount > 0 ? Array.from({ length: hydratedCount }) as never : undefined,
    artifactPersisted: hydratedCount === (input.executionOutput.mediaArtifactIds?.length ?? 0),
  });

  recordExecutionTraceStage({
    executionId: input.executionId,
    stage: "artifact_hydration",
    status: pipeline.artifactHydrated ? "COMPLETED" : hydratedCount > 0 ? "FAILED" : "SKIPPED",
    skipReason: hydratedCount === 0 ? "no_artifacts_hydrated" : undefined,
  });
  recordExecutionTraceStage({
    executionId: input.executionId,
    stage: "artifact_render",
    status: pipeline.artifactHydrated ? "COMPLETED" : "SKIPPED",
    skipReason: pipeline.artifactHydrated ? undefined : "artifact_render_not_executed",
  });
  recordExecutionTraceStage({
    executionId: input.executionId,
    stage: "runtime_evaluation",
    status: "SKIPPED",
    skipReason: "benchmark_trace_runtime_deferred_to_evaluation_plane",
  });
  recordExecutionTraceStage({
    executionId: input.executionId,
    stage: "evaluation_plane",
    status: pipeline.evaluationExecuted ? "COMPLETED" : "SKIPPED",
    skipReason: pipeline.evaluationExecuted ? undefined : "evaluation_plane_not_executed",
  });
  recordExecutionTraceStage({
    executionId: input.executionId,
    stage: "step2_validation",
    status: pipeline.step2Executed ? "COMPLETED" : "SKIPPED",
    skipReason: pipeline.step2Executed ? undefined : "step2_not_executed",
  });
  recordExecutionTraceStage({
    executionId: input.executionId,
    stage: "quality_gate",
    status: validation ? "COMPLETED" : "SKIPPED",
    skipReason: validation ? undefined : "quality_gate_not_reached",
  });
  recordExecutionTraceStage({
    executionId: input.executionId,
    stage: "production_evidence",
    status: "SKIPPED",
    skipReason: "controlled_benchmark_not_production_evidence",
  });
  recordExecutionTraceStage({
    executionId: input.executionId,
    stage: "model_performance_record",
    status: pipeline.performanceRecordCreated ? "COMPLETED" : "FAILED",
  });

  finalizeExecutionTrace(input.executionId);
}

export async function executeControlledEvidenceCollection(
  input: {
    readonly tier?: ControlledEvidenceTier;
    readonly organizationId: string;
    readonly models?: readonly BenchmarkModelTarget[];
    readonly knowledgeVersion?: string;
    readonly dryRun?: boolean;
    readonly executeModel?: BenchmarkModelExecutor;
    readonly recordExecutionTrace?: boolean;
    readonly maxConcurrentExecutions?: number;
    readonly createId?: (prefix: string) => string;
    readonly nowIso?: () => string;
  },
  deps?: Parameters<typeof collectEvidence>[1],
): Promise<ControlledEvidenceExecutionResult> {
  const tier = input.tier ?? 1;
  const plan = buildControlledEvidencePlan({
    tier,
    models: input.models,
    knowledgeVersion: input.knowledgeVersion,
  });
  assertControlledEvidenceBudget(plan);

  if (input.dryRun === true) {
    return Object.freeze({
      plan,
      dryRun: true,
      results: Object.freeze([]),
      insertedCount: 0,
      duplicateCount: 0,
      failedCount: 0,
      tier,
      invocationPlan: plan.invocationPlan,
      executedCalls: 0,
      totalCostUsd: 0,
      records: Object.freeze([]),
    });
  }

  if (!input.executeModel) {
    throw new Error("Controlled evidence collection requires executeModel unless dryRun=true");
  }

  const organizationId = input.organizationId;
  const capturedOutputs = new Map<string, BenchmarkExecutionOutput>();
  const baseExecutor = input.executeModel;
  const wrappedExecutor: BenchmarkModelExecutor = async (execInput) => {
    const output = await baseExecutor(execInput);
    capturedOutputs.set(execInput.executionId, output);
    return output;
  };

  const concurrency = Math.min(
    input.maxConcurrentExecutions ?? plan.concurrency,
    plan.cells.length,
  );
  const results: BenchmarkRunResult[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < plan.cells.length) {
      const cellIndex = index;
      index += 1;
      const cell = plan.cells[cellIndex]!;
      try {
        const result = await runBenchmark(
          {
            benchmarkId: cell.benchmarkId,
            model: cell.model,
            organizationId,
            strategy: DEFAULT_BENCHMARK_STRATEGY,
            knowledgeVersion: cell.knowledgeVersion ?? plan.knowledgeVersion,
            executeModel: wrappedExecutor,
            createId: input.createId,
            nowIso: input.nowIso,
          },
          deps,
        );
        results[cellIndex] = result;
      } catch (error) {
        results[cellIndex] = Object.freeze({
          record: undefined as never,
          conditions: undefined as never,
          persisted: false,
          validationAvailable: false,
        }) as unknown as BenchmarkRunResult;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, plan.cells.length) }, () => worker()),
  );

  const validResults = results.filter((r) => r?.record != null);
  const records = validResults.map((r) => r.record);

  if (input.recordExecutionTrace === true) {
    for (const result of validResults) {
      const bc = getBenchmarkCase(result.record.benchmarkId);
      const executionOutput = capturedOutputs.get(result.record.executionId);
      if (!bc || !executionOutput) continue;
      await recordBenchmarkExecutionTrace({
        executionId: result.record.executionId,
        benchmarkCase: bc,
        model: Object.freeze({
          providerId: result.record.providerId,
          modelId: result.record.modelId,
          capabilityId: result.record.capabilityId ?? "text.generate",
        }),
        executionOutput,
        record: result.record,
        organizationId,
      });
    }
  }

  const totalCostUsd = records
    .filter((r) => r.costAvailable && r.estimatedCost != null)
    .reduce((sum, r) => sum + (r.estimatedCost ?? 0), 0);

  let insertedCount = 0;
  let duplicateCount = 0;
  const store = deps?.recordStore;
  if (store) {
    for (const r of validResults) {
      const existing = await store.get(r.record.performanceRecordId);
      if (existing) duplicateCount += 1;
      else insertedCount += 1;
    }
  }

  return Object.freeze({
    plan,
    dryRun: false,
    results: Object.freeze(validResults),
    insertedCount,
    duplicateCount,
    failedCount: plan.cells.length - validResults.length,
    tier,
    invocationPlan: plan.invocationPlan,
    executedCalls: validResults.length,
    totalCostUsd,
    records: Object.freeze(records),
  });
}

export function planControlledEvidenceCollection(input?: {
  readonly tier?: ControlledEvidenceTier;
}): ControlledEvidencePlan {
  const plan = buildControlledEvidencePlan({ tier: input?.tier ?? 1 });
  assertControlledEvidenceBudget(plan);
  return plan;
}
