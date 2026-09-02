/**
 * Benchmark execution runner — controlled Benchmark × Model × Strategy matrix.
 * Reuses Step 2 validation; does not change production routing.
 */

import { clearValidationCache } from "../../../../../os/evaluation/output-validation/output-contract-validation-engine";
import {
  OUTPUT_VALIDATION_VERSION,
  OUTPUT_VALIDATOR_RUNTIME_VERSION,
} from "../../../../../os/evaluation/output-validation/validation-result";
import type {
  BenchmarkCase,
  BenchmarkModelTarget,
  BenchmarkStrategy,
  BenchmarkExecutionConditions,
} from "../contracts/benchmark-case";
import { DEFAULT_BENCHMARK_STRATEGY as DEFAULT_STRATEGY } from "../contracts/benchmark-case";
import type { ModelPerformanceRecord } from "../contracts/model-performance-record";
import { getBenchmarkCase } from "../catalog/benchmark-catalog";
import {
  buildModelPerformanceRecord,
  buildOperationalFailureBenchmarkRecord,
  buildPreFlightSkippedBenchmarkRecord,
  type BenchmarkExecutionOutput,
} from "./record-builder";
import {
  resolveBenchmarkValidation,
  resolveBenchmarkValidationAsync,
  contractReferenceForBenchmark,
} from "./benchmark-validation-resolver";
import type { IBenchmarkPerformanceRecordStore } from "../persistence/benchmark-record-store";
import { defaultBenchmarkPerformanceRecordStore } from "../persistence/benchmark-record-store";
import { persistBenchmarkToPerformanceStore } from "../persistence/performance-evidence-bridge";
import type { IModelPerformanceStore } from "../../interfaces/model-performance-store";

export type BenchmarkModelExecutor = (input: {
  readonly benchmarkCase: BenchmarkCase;
  readonly model: BenchmarkModelTarget;
  readonly strategy: BenchmarkStrategy;
  readonly organizationId: string;
  readonly executionId: string;
}) => Promise<BenchmarkExecutionOutput>;

export type BenchmarkRunInput = {
  readonly benchmarkId: string;
  readonly model: BenchmarkModelTarget;
  readonly organizationId: string;
  readonly strategy?: BenchmarkStrategy;
  readonly knowledgeVersion?: string;
  readonly knowledgeId?: string;
  readonly knowledgeFingerprint?: string;
  readonly experimentId?: string;
  readonly experimentVersion?: string;
  readonly repairCount?: number;
  readonly executeModel: BenchmarkModelExecutor;
  readonly artifactEvaluationDeps?: import("./benchmark-validation-resolver").BenchmarkArtifactEvaluationDeps;
  readonly createId?: (prefix: string) => string;
  readonly nowIso?: () => string;
};

export type BenchmarkRunResult = {
  readonly record: ModelPerformanceRecord;
  readonly conditions: BenchmarkExecutionConditions;
  readonly persisted: boolean;
  readonly validationAvailable: boolean;
};

let idCounter = 0;
function defaultCreateId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now()}_${idCounter}`;
}

function defaultNowIso(): string {
  return new Date().toISOString();
}

function buildRecordFromValidationOutcome(input: {
  readonly benchmarkCase: BenchmarkCase;
  readonly executionOutput: BenchmarkExecutionOutput;
  readonly model: BenchmarkModelTarget;
  readonly strategy: BenchmarkStrategy;
  readonly executionId: string;
  readonly attemptId: string;
  readonly organizationId: string;
  readonly knowledgeVersion?: string;
  readonly repairCount?: number;
  readonly artifactEvaluationDeps?: import("./benchmark-validation-resolver").BenchmarkArtifactEvaluationDeps;
  readonly createId: (prefix: string) => string;
  readonly nowIso: () => string;
}): Promise<{ readonly record: ModelPerformanceRecord; readonly validationAvailable: boolean }> {
  return buildRecordFromValidationOutcomeAsync(input);
}

async function buildRecordFromValidationOutcomeAsync(input: {
  readonly benchmarkCase: BenchmarkCase;
  readonly executionOutput: BenchmarkExecutionOutput;
  readonly model: BenchmarkModelTarget;
  readonly strategy: BenchmarkStrategy;
  readonly executionId: string;
  readonly attemptId: string;
  readonly organizationId: string;
  readonly knowledgeVersion?: string;
  readonly knowledgeId?: string;
  readonly knowledgeFingerprint?: string;
  readonly experimentId?: string;
  readonly experimentVersion?: string;
  readonly repairCount?: number;
  readonly artifactEvaluationDeps?: import("./benchmark-validation-resolver").BenchmarkArtifactEvaluationDeps;
  readonly createId: (prefix: string) => string;
  readonly nowIso: () => string;
}): Promise<{ readonly record: ModelPerformanceRecord; readonly validationAvailable: boolean }> {
  if (input.executionOutput.skippedPreFlight) {
    const contractRef = contractReferenceForBenchmark(input.benchmarkCase);
    return Object.freeze({
      validationAvailable: false,
      record: buildPreFlightSkippedBenchmarkRecord({
        benchmarkCase: input.benchmarkCase,
        model: input.model,
        strategy: input.strategy,
        executionId: input.executionId,
        attemptId: input.attemptId,
        organizationId: input.organizationId,
        executionOutput: input.executionOutput,
        knowledgeVersion: input.knowledgeVersion,
        knowledgeId: input.knowledgeId,
        knowledgeFingerprint: input.knowledgeFingerprint,
        experimentId: input.experimentId,
        experimentVersion: input.experimentVersion,
        contractId: contractRef.contractId,
        contractVersion: contractRef.contractVersion,
        effectiveContractId: contractRef.effectiveContractId,
        createId: input.createId,
        nowIso: input.nowIso,
      }),
    });
  }

  const validationOutcome = input.artifactEvaluationDeps
    ? await resolveBenchmarkValidationAsync({
        benchmarkCase: input.benchmarkCase,
        executionOutput: input.executionOutput,
        organizationId: input.organizationId,
        executionId: input.executionId,
        artifactEvaluationDeps: input.artifactEvaluationDeps,
        createId: input.createId,
        nowIso: input.nowIso,
      })
    : resolveBenchmarkValidation({
        benchmarkCase: input.benchmarkCase,
        executionOutput: input.executionOutput,
        organizationId: input.organizationId,
        executionId: input.executionId,
        createId: input.createId,
        nowIso: input.nowIso,
      });

  if (validationOutcome.kind === "validated") {
    return Object.freeze({
      validationAvailable: true,
      record: buildModelPerformanceRecord({
        benchmarkCase: input.benchmarkCase,
        validation: validationOutcome.validation,
        model: input.model,
        strategy: input.strategy,
        executionId: input.executionId,
        attemptId: input.attemptId,
        organizationId: input.organizationId,
        executionOutput: input.executionOutput,
        knowledgeVersion: input.knowledgeVersion,
        knowledgeId: input.knowledgeId,
        knowledgeFingerprint: input.knowledgeFingerprint,
        experimentId: input.experimentId,
        experimentVersion: input.experimentVersion,
        repairCount: input.repairCount,
        createId: input.createId,
        nowIso: input.nowIso,
      }),
    });
  }

  if (!input.executionOutput.operationalFailure) {
    throw new Error(
      `Benchmark ${input.benchmarkCase.benchmarkId} cannot produce a performance record: ` +
        `output contract validation unavailable (${validationOutcome.reason}).`,
    );
  }

  return Object.freeze({
    validationAvailable: false,
    record: buildOperationalFailureBenchmarkRecord({
      benchmarkCase: input.benchmarkCase,
      model: input.model,
      strategy: input.strategy,
      executionId: input.executionId,
      attemptId: input.attemptId,
      organizationId: input.organizationId,
      executionOutput: input.executionOutput,
      knowledgeVersion: input.knowledgeVersion,
      knowledgeId: input.knowledgeId,
      knowledgeFingerprint: input.knowledgeFingerprint,
      experimentId: input.experimentId,
      experimentVersion: input.experimentVersion,
      repairCount: input.repairCount,
      contractId: validationOutcome.contractId,
      contractVersion: validationOutcome.contractVersion,
      effectiveContractId: validationOutcome.effectiveContractId,
      validationUnavailableReason: validationOutcome.reason,
      createId: input.createId,
      nowIso: input.nowIso,
    }),
  });
}

export async function runBenchmark(
  input: BenchmarkRunInput,
  deps?: {
    readonly recordStore?: IBenchmarkPerformanceRecordStore;
    readonly performanceStore?: IModelPerformanceStore;
    readonly clearCache?: boolean;
  },
): Promise<BenchmarkRunResult> {
  const benchmarkCase = getBenchmarkCase(input.benchmarkId);
  if (!benchmarkCase) {
    throw new Error(`Unknown benchmark: ${input.benchmarkId}`);
  }
  if (!benchmarkCase.enabled) {
    throw new Error(`Benchmark disabled: ${input.benchmarkId}`);
  }

  const strategy = input.strategy ?? DEFAULT_STRATEGY;
  const createId = input.createId ?? defaultCreateId;
  const nowIso = input.nowIso ?? defaultNowIso;
  const executionId = createId("benchexec");
  const attemptId = createId("benchattempt");

  if (deps?.clearCache !== false) {
    clearValidationCache();
  }

  const executionOutput = await input.executeModel({
    benchmarkCase,
    model: input.model,
    strategy,
    organizationId: input.organizationId,
    executionId,
  });

  const { record, validationAvailable } = await buildRecordFromValidationOutcomeAsync({
    benchmarkCase,
    executionOutput,
    model: input.model,
    strategy,
    executionId,
    attemptId,
    organizationId: input.organizationId,
    knowledgeVersion: input.knowledgeVersion,
    knowledgeId: input.knowledgeId,
    knowledgeFingerprint: input.knowledgeFingerprint,
    experimentId: input.experimentId,
    experimentVersion: input.experimentVersion,
    repairCount: input.repairCount,
    artifactEvaluationDeps:
      input.artifactEvaluationDeps ??
      (executionOutput.benchmarkAsyncMedia && executionOutput.benchmarkArtifactsRepo
        ? {
            asyncMedia: executionOutput.benchmarkAsyncMedia,
            artifactsRepo: executionOutput.benchmarkArtifactsRepo,
          }
        : undefined),
    createId,
    nowIso,
  });

  const recordStore = deps?.recordStore ?? defaultBenchmarkPerformanceRecordStore;
  const insertResult = await recordStore.append(record);

  if (deps?.performanceStore && insertResult === "inserted") {
    await persistBenchmarkToPerformanceStore(deps.performanceStore, record);
  }

  const conditions: BenchmarkExecutionConditions = Object.freeze({
    benchmarkId: benchmarkCase.benchmarkId,
    benchmarkVersion: benchmarkCase.version,
    contractId: record.contractId,
    contractVersion: record.contractVersion,
    effectiveContractId: record.effectiveContractId,
    strategyId: strategy.strategyId,
    strategyVersion: strategy.version,
    knowledgeVersion: input.knowledgeVersion,
    knowledgeId: input.knowledgeId,
    knowledgeFingerprint: input.knowledgeFingerprint,
    experimentId: input.experimentId,
    experimentVersion: input.experimentVersion,
    evaluatorVersion: OUTPUT_VALIDATOR_RUNTIME_VERSION,
    validationVersion: OUTPUT_VALIDATION_VERSION,
    providerId: input.model.providerId,
    modelId: input.model.modelId,
    modelVersion: input.model.modelVersion,
  });

  return Object.freeze({
    record,
    conditions,
    persisted: insertResult === "inserted",
    validationAvailable,
  });
}

export type BenchmarkSuiteRunInput = {
  readonly benchmarkIds?: readonly string[];
  readonly suiteId?: string;
  readonly models: readonly BenchmarkModelTarget[];
  readonly organizationId: string;
  readonly strategy?: BenchmarkStrategy;
  readonly knowledgeVersion?: string;
  readonly executeModel: BenchmarkModelExecutor;
};

export async function runBenchmarkSuite(
  input: BenchmarkSuiteRunInput,
  deps?: Parameters<typeof runBenchmark>[1],
): Promise<readonly BenchmarkRunResult[]> {
  const { listBenchmarkCases, buildBenchmarkSuites } = await import(
    "../catalog/benchmark-catalog"
  );

  let benchmarkIds = input.benchmarkIds ?? [];
  if (input.suiteId && benchmarkIds.length === 0) {
    const suite = buildBenchmarkSuites().find((s) => s.suiteId === input.suiteId);
    benchmarkIds = suite?.caseIds ?? [];
  }
  if (benchmarkIds.length === 0) {
    benchmarkIds = listBenchmarkCases({ enabled: true }).map((c) => c.benchmarkId);
  }

  const results: BenchmarkRunResult[] = [];
  for (const benchmarkId of benchmarkIds) {
    for (const model of input.models) {
      const result = await runBenchmark(
        {
          benchmarkId,
          model,
          organizationId: input.organizationId,
          strategy: input.strategy,
          knowledgeVersion: input.knowledgeVersion,
          executeModel: input.executeModel,
        },
        deps,
      );
      results.push(result);
    }
  }
  return Object.freeze(results);
}

export function resetBenchmarkRunnerState(): void {
  idCounter = 0;
}
