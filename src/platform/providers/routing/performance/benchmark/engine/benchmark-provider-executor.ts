/**
 * Step 4A — Real provider benchmark executor.
 * Calls existing IProviderDispatcher with explicit model selection (no production routing).
 */

import {
  asCapabilityId,
  asExecutionId,
  asOrganizationId,
  asProviderId,
  asWorkspaceId,
} from "../../../../../core/identifiers";
import type { IProviderDispatcher } from "../../../../runtime/interfaces/provider-dispatcher";
import type { ProviderExecutionRequest } from "../../../../runtime/contracts/provider-execution-request";
import { UNCANCELLED_TOKEN } from "../../../../runtime/contracts/cancellation";
import { sampleRequest } from "../../../../runtime/testing";
import { resolveExecutableModelId } from "../../failover/executable-model-id";
import { classifyExecutionFailure } from "../../failover/failure-classification";
import type { PerformanceFailureCategory } from "../../contracts/performance-evidence";
import type { IPricingEngine } from "../../../../../model-registry/interfaces/model-registry";
import type { IModelRegistry } from "../../../../../model-registry/interfaces/model-registry";
import type { ICompatibilityEngine } from "../../../../../model-registry/interfaces/model-registry";
import type {
  BenchmarkCase,
  BenchmarkModelTarget,
  BenchmarkStrategy,
} from "../contracts/benchmark-case";
import { BENCHMARK_EXECUTION_MODE } from "../contracts/benchmark-execution-config";
import type { BenchmarkRepeatConfig } from "../contracts/benchmark-execution-config";
import { resolveBenchmarkCapability } from "./benchmark-capability-resolver";
import { checkBenchmarkCompatibility } from "./benchmark-compatibility";
import { estimateBenchmarkCostFromRegistry } from "./benchmark-cost-accounting";
import { normalizeProviderResponseForBenchmark } from "./benchmark-output-normalizer";
import type { BenchmarkExecutionOutput } from "./record-builder";
import type { BenchmarkModelExecutor } from "./benchmark-runner";
import {
  executeBenchmarkOsPipeline,
  shouldUseBenchmarkOsPipeline,
  type BenchmarkOsExecutionBridgeDeps,
} from "./benchmark-os-execution-bridge";

export type BenchmarkProviderExecutorDeps = {
  readonly dispatcher: IProviderDispatcher;
  readonly osBridge?: BenchmarkOsExecutionBridgeDeps;
  readonly modelRegistry?: IModelRegistry;
  readonly pricingEngine?: IPricingEngine;
  readonly compatibilityEngine?: ICompatibilityEngine;
  readonly workspaceId?: string;
  readonly clockMs?: () => number;
  readonly nowIso?: () => string;
  readonly createId?: (prefix: string) => string;
  readonly repeatConfig?: BenchmarkRepeatConfig;
  readonly onObservability?: (event: BenchmarkExecutionObservabilityEvent) => void;
};

export type BenchmarkExecutionObservabilityEvent = {
  readonly benchmarkId: string;
  readonly executionId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly modelVersion?: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly latencyMs: number;
  readonly validationStatus?: string;
  readonly qualityScore?: number;
  readonly operationalStatus:
    | "success"
    | "operational_failure"
    | "unsupported_capability"
    | "execution_capability_unavailable";
  readonly benchmarkOutcome?: string;
  readonly message?: string;
};

function extractTokenUsage(
  usage?: Readonly<Record<string, unknown>>,
): { inputTokens?: number; outputTokens?: number; totalTokens?: number } {
  if (!usage) return {};
  const inputTokens =
    typeof usage.promptTokens === "number"
      ? usage.promptTokens
      : typeof usage.input_tokens === "number"
        ? usage.input_tokens
        : undefined;
  const outputTokens =
    typeof usage.completionTokens === "number"
      ? usage.completionTokens
      : typeof usage.output_tokens === "number"
        ? usage.output_tokens
        : undefined;
  const totalTokens =
    typeof usage.totalTokens === "number"
      ? usage.totalTokens
      : typeof usage.total_tokens === "number"
        ? usage.total_tokens
        : inputTokens != null && outputTokens != null
          ? inputTokens + outputTokens
          : typeof usage.tokens === "number"
            ? usage.tokens
            : undefined;
  return { inputTokens, outputTokens, totalTokens };
}

function estimateCostFromRegistry(
  deps: BenchmarkProviderExecutorDeps,
  modelId: string,
  inputTokens?: number,
  outputTokens?: number,
): { readonly estimatedCost?: number; readonly breakdown?: ReturnType<typeof estimateBenchmarkCostFromRegistry>["breakdown"] } {
  return estimateBenchmarkCostFromRegistry(deps, modelId, inputTokens, outputTokens);
}

function buildBenchmarkProviderRequest(input: {
  readonly benchmarkCase: BenchmarkCase;
  readonly model: BenchmarkModelTarget;
  readonly strategy: BenchmarkStrategy;
  readonly organizationId: string;
  readonly executionId: string;
  readonly capabilityId: string;
  readonly workspaceId?: string;
  readonly repeatConfig?: BenchmarkRepeatConfig;
  readonly createId: (prefix: string) => string;
  readonly nowIso: () => string;
}): ProviderExecutionRequest {
  const providerId = asProviderId(input.model.providerId);
  const executableModelId = resolveExecutableModelId(
    input.model.providerId,
    input.model.modelId,
  );
  const brief = input.benchmarkCase.inputBrief;

  const base = sampleRequest({
    requestId: input.createId("benchpreq"),
    providerId: String(providerId),
    payload: {
      prompt: brief,
      text: brief,
      input: brief,
      rawPrompt: brief,
    },
    timeoutPolicy: {
      executionTimeoutMs: 120_000,
      streamingTimeoutMs: 120_000,
      queueTimeoutMs: 30_000,
    },
    retryPolicy: {
      strategy: "none",
      maxAttempts: 1,
      baseDelayMs: 0,
    },
  });

  const generationOptions: Record<string, unknown> = {};
  if (input.repeatConfig?.seed != null) {
    generationOptions.seed = input.repeatConfig.seed;
  }
  if (input.repeatConfig?.temperature != null) {
    generationOptions.temperature = input.repeatConfig.temperature;
  }

  return Object.freeze({
    ...base,
    capabilityId: asCapabilityId(input.capabilityId),
    providerId,
    modelId: executableModelId,
    context: Object.freeze({
      ...base.context,
      executionId: asExecutionId(input.executionId),
      organizationId: asOrganizationId(input.organizationId),
      workspaceId: asWorkspaceId(input.workspaceId ?? "ws_benchmark"),
      providerId,
      attributes: Object.freeze({
        executionMode: BENCHMARK_EXECUTION_MODE,
        benchmarkId: input.benchmarkCase.benchmarkId,
        strategyId: input.strategy.strategyId,
        strategyVersion: input.strategy.version,
      }),
    }),
    metadata: Object.freeze({
      executionMode: BENCHMARK_EXECUTION_MODE,
      benchmarkId: input.benchmarkCase.benchmarkId,
      service: input.benchmarkCase.service,
      subtype: input.benchmarkCase.subtype,
      outputKind: input.benchmarkCase.outputKind,
      industry: input.benchmarkCase.industry,
      complexity: input.benchmarkCase.complexity,
      platform: input.benchmarkCase.platform,
      format: input.benchmarkCase.format,
      strategyId: input.strategy.strategyId,
      strategyVersion: input.strategy.version,
      preferredProviderId: input.model.providerId,
      preferredModelId: executableModelId,
      capabilityId: input.capabilityId,
      nondeterministic: input.repeatConfig?.nondeterministic ?? true,
      ...(Object.keys(generationOptions).length > 0 ? { generationConfig: generationOptions } : {}),
    }),
    options: Object.freeze(generationOptions),
    createdAt: input.nowIso(),
  });
}

function checkModelCapability(
  deps: BenchmarkProviderExecutorDeps,
  modelId: string,
  benchmarkCase: BenchmarkCase,
): ReturnType<typeof checkBenchmarkCompatibility> {
  return checkBenchmarkCompatibility({
    benchmarkCase,
    modelId,
    modelRegistry: deps.modelRegistry,
    compatibilityEngine: deps.compatibilityEngine,
  });
}

export function createBenchmarkProviderExecutor(
  deps: BenchmarkProviderExecutorDeps,
): BenchmarkModelExecutor {
  const clockMs = deps.clockMs ?? (() => Date.now());
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const createId = deps.createId ?? ((p: string) => `${p}_${Date.now()}`);

  return async (input): Promise<BenchmarkExecutionOutput> => {
    const startMs = clockMs();
    const startTime = nowIso();
    const resolved = resolveBenchmarkCapability(input.benchmarkCase);
    const executableModelId = resolveExecutableModelId(
      input.model.providerId,
      input.model.modelId,
    );

    if (shouldUseBenchmarkOsPipeline(input.benchmarkCase) && deps.osBridge) {
      const osOutput = await executeBenchmarkOsPipeline(deps.osBridge, {
        benchmarkCase: input.benchmarkCase,
        model: input.model,
        strategy: input.strategy,
        organizationId: input.organizationId,
        executionId: input.executionId,
      });
      const endTime = nowIso();
      deps.onObservability?.({
        benchmarkId: input.benchmarkCase.benchmarkId,
        executionId: input.executionId,
        providerId: input.model.providerId,
        modelId: executableModelId,
        modelVersion: input.model.modelVersion,
        startTime,
        endTime,
        latencyMs: osOutput.latencyMs,
        operationalStatus: osOutput.operationalFailure
          ? "operational_failure"
          : osOutput.skippedPreFlight
            ? osOutput.compatibility?.outcomeIfSkipped === "MODEL_CAPABILITY_UNSUPPORTED"
              ? "unsupported_capability"
              : "execution_capability_unavailable"
            : "success",
        benchmarkOutcome: osOutput.compatibility?.outcomeIfSkipped,
        message: osOutput.operationalFailure?.message ?? osOutput.compatibility?.reasons.join("; "),
      });
      return osOutput;
    }

    const compatibility = checkModelCapability(deps, executableModelId, input.benchmarkCase);

    if (compatibility.skipExecution) {
      const endTime = nowIso();
      const latencyMs = clockMs() - startMs;
      const observabilityStatus =
        compatibility.outcomeIfSkipped === "MODEL_CAPABILITY_UNSUPPORTED"
          ? "unsupported_capability"
          : "execution_capability_unavailable";
      deps.onObservability?.({
        benchmarkId: input.benchmarkCase.benchmarkId,
        executionId: input.executionId,
        providerId: input.model.providerId,
        modelId: executableModelId,
        modelVersion: input.model.modelVersion,
        startTime,
        endTime,
        latencyMs,
        operationalStatus: observabilityStatus,
        benchmarkOutcome: compatibility.outcomeIfSkipped,
        message: compatibility.reasons.join("; "),
      });
      return Object.freeze({
        preview: "",
        latencyMs,
        compatibility,
        skippedPreFlight: true,
        resolvedCapabilityId: resolved.capabilityId,
        operationalFailure:
          compatibility.outcomeIfSkipped === "MODEL_CAPABILITY_UNSUPPORTED"
            ? Object.freeze({
                category: "unsupported_capability" as PerformanceFailureCategory,
                message: compatibility.reasons.join("; "),
              })
            : undefined,
      });
    }

    const request = buildBenchmarkProviderRequest({
      benchmarkCase: input.benchmarkCase,
      model: input.model,
      strategy: input.strategy,
      organizationId: input.organizationId,
      executionId: input.executionId,
      capabilityId: resolved.capabilityId,
      workspaceId: deps.workspaceId,
      repeatConfig: deps.repeatConfig,
      createId,
      nowIso,
    });

    const dispatchStartMs = clockMs();
    const dispatchResult = await deps.dispatcher.dispatch(request, UNCANCELLED_TOKEN);
    const dispatchEndMs = clockMs();
    const modelLatencyMs = dispatchEndMs - dispatchStartMs;
    const totalLatencyMs = clockMs() - startMs;
    const endTime = nowIso();

    if (!dispatchResult.ok) {
      const category = classifyExecutionFailure({
        message: dispatchResult.error.message,
        error: { code: dispatchResult.error.name, message: dispatchResult.error.message },
      });
      deps.onObservability?.({
        benchmarkId: input.benchmarkCase.benchmarkId,
        executionId: input.executionId,
        providerId: input.model.providerId,
        modelId: executableModelId,
        modelVersion: input.model.modelVersion,
        startTime,
        endTime,
        latencyMs: totalLatencyMs,
        operationalStatus: "operational_failure",
        message: dispatchResult.error.message,
      });
      return Object.freeze({
        preview: "",
        latencyMs: totalLatencyMs,
        modelLatencyMs,
        operationalFailure: Object.freeze({
          category,
          message: dispatchResult.error.message,
        }),
      });
    }

    const response = dispatchResult.value;
    const normalized = normalizeProviderResponseForBenchmark(response, input.benchmarkCase);
    const tokens = extractTokenUsage(response.usage);
    const costResult = estimateCostFromRegistry(
      deps,
      executableModelId,
      tokens.inputTokens,
      tokens.outputTokens,
    );

    deps.onObservability?.({
      benchmarkId: input.benchmarkCase.benchmarkId,
      executionId: input.executionId,
      providerId: input.model.providerId,
      modelId: executableModelId,
      modelVersion: input.model.modelVersion,
      startTime,
      endTime,
      latencyMs: totalLatencyMs,
      operationalStatus: "success",
    });

    return Object.freeze({
      preview: normalized.preview,
      structuredData: normalized.structuredData,
      mediaArtifactIds: normalized.mediaArtifactIds,
      latencyMs: totalLatencyMs,
      modelLatencyMs,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      totalTokens: tokens.totalTokens,
      estimatedCost: costResult.estimatedCost ?? undefined,
      costBreakdown: costResult.breakdown,
      compatibility,
      resolvedCapabilityId: resolved.capabilityId,
    });
  };
}

/**
 * Factory using bootProductionExecution runtime dispatcher.
 * For manual smoke tests with configured credentials — not for automated CI.
 */
export async function createProductionBenchmarkExecutor(input?: {
  readonly organizationId?: string;
  readonly workspaceId?: string;
  readonly repeatConfig?: BenchmarkRepeatConfig;
  readonly onObservability?: BenchmarkProviderExecutorDeps["onObservability"];
}): Promise<BenchmarkModelExecutor> {
  const { bootProductionExecution } = await import(
    "../../../../../production/execution/production-executor"
  );
  const { createModelRegistryPlatform } = await import(
    "../../../../../model-registry/factories/create-model-registry-platform"
  );
  const { DefaultCompatibilityEngine } = await import(
    "../../../../../model-registry/compatibility/default-compatibility-engine"
  );
  const { createBenchmarkAsyncMediaPlatform } = await import(
    "./benchmark-os-execution-bridge"
  );

  const boot = await bootProductionExecution({
    organizationId: input?.organizationId ?? "org_benchmark",
    workspaceId: input?.workspaceId ?? "ws_benchmark",
  });
  if (!boot.ok) {
    throw boot.error;
  }

  const registryPlatform = createModelRegistryPlatform({ loadSeed: true });
  const benchmarkMedia = createBenchmarkAsyncMediaPlatform();

  return createBenchmarkProviderExecutor({
    dispatcher: boot.value.runtimeDispatcher,
    osBridge: {
      engine: boot.value.integration,
      asyncMedia: benchmarkMedia.platform,
      artifactsRepo: benchmarkMedia.artifactsRepo,
      workspaceId: input?.workspaceId ?? "ws_benchmark",
    },
    modelRegistry: registryPlatform.registry,
    pricingEngine: registryPlatform.pricing,
    compatibilityEngine: new DefaultCompatibilityEngine(),
    workspaceId: input?.workspaceId ?? "ws_benchmark",
    repeatConfig: input?.repeatConfig,
    onObservability: input?.onObservability,
  });
}
