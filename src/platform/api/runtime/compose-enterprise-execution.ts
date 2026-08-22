/**
 * Composes distributed execution + Integration OS for Enterprise API execution modes.
 * Phase 0: ControllableDispatcher only for simulated (explicit); LIVE requires real dispatcher.
 */

import type { IProviderDispatcher } from "../../intelligence/providers/runtime/interfaces/provider-dispatcher";
import type { IIntelligenceOsIntegrationEngine } from "../../intelligence/integration/interfaces/integration";
import { createIntelligenceOsIntegrationPlatform } from "../../intelligence/integration/factories/create-intelligence-os-integration-platform";
import { createPromptCompiler } from "../../intelligence/prompt-compiler/factories/create-prompt-compiler";
import { ControllableDispatcher } from "../../intelligence/providers/runtime/testing";
import type { IExecutionContextStores } from "../../business/execution-context";
import {
  IntegrationLayerJobExecutor,
  IntelligenceGatewayHolder,
  StubJobExecutor,
  type IntegrationLayerJobExecutorOptions,
  type SyncImageMaterializer,
} from "../../infrastructure/execution/workers/job-executors";
import type { IJobExecutor } from "../../infrastructure/execution/interfaces/execution";
import type { EnterpriseApiExecutionMode } from "./execution-mode";
import { integrationPipelineModeFor } from "./execution-mode";
import { materializeSyncImageArtifacts } from "../services/sync-image-artifact-materializer";
import type { AsyncMediaPlatform } from "../../infrastructure/durability/create-async-media-platform";
import { assertProductionComposition } from "../../os";

export interface ComposeEnterpriseExecutionInput {
  readonly executionMode: EnterpriseApiExecutionMode;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
  readonly integration?: IIntelligenceOsIntegrationEngine;
  readonly runtimeDispatcher?: IProviderDispatcher;
  readonly executionContextStores?: IExecutionContextStores;
  readonly useLiveBusinessContext?: boolean;
  readonly brandBrainRepository?: import("../../infrastructure/durability/interfaces/brand-brain-repository").IBrandBrainRepository;
  readonly toolRuntime?: import("../../intelligence/providers/tools/composition/tool-runtime-platform").ToolRuntimePlatform;
  readonly asyncMedia?: AsyncMediaPlatform;
}

export interface ComposedEnterpriseExecution {
  readonly executor: IJobExecutor;
  readonly integration?: IIntelligenceOsIntegrationEngine;
  readonly integrationJobOptions: IntegrationLayerJobExecutorOptions;
  readonly intelligenceGatewayHolder: IntelligenceGatewayHolder;
}

export function composeEnterpriseExecution(
  input: ComposeEnterpriseExecutionInput
): ComposedEnterpriseExecution {
  const clocks = {
    nowIso: input.nowIso ?? (() => new Date().toISOString()),
    clockMs: input.clockMs ?? (() => Date.now()),
    createId: input.createId ?? ((p: string) => `${p}_${Date.now()}`),
  };

  const materializeSyncImage: SyncImageMaterializer | undefined = input.asyncMedia
    ? (args) =>
        materializeSyncImageArtifacts({
          asyncMedia: input.asyncMedia!,
          createId: clocks.createId,
          ...args,
        })
    : undefined;

  const integrationJobOptions: IntegrationLayerJobExecutorOptions = {
    integrationMode: integrationPipelineModeFor(input.executionMode),
    executionMode: input.executionMode === "live" ? "live" : "simulated",
    materializeSyncImage,
  };

  if (input.executionMode === "stub") {
    return {
      executor: new StubJobExecutor("success"),
      integrationJobOptions,
      intelligenceGatewayHolder: new IntelligenceGatewayHolder(),
    };
  }

  if (input.executionMode === "live" && !input.integration && !input.runtimeDispatcher) {
    throw new Error(
      "LIVE execution requires a pre-booted integration engine or runtimeDispatcher"
    );
  }

  const runtimeDispatcher =
    input.runtimeDispatcher ??
    (input.executionMode === "simulated"
      ? new ControllableDispatcher({ nowIso: clocks.nowIso })
      : undefined);

  if (input.executionMode === "live") {
    assertProductionComposition({
      executionMode: "live",
      runtimeDispatcher,
      negotiationSource: "production",
    });
  }

  // Create a PromptCompiler instance (OpenAI renderer by default).
  // Shared across all executions — stateless, thread-safe.
  const promptCompiler = createPromptCompiler();

  const integration =
    input.integration ??
    createIntelligenceOsIntegrationPlatform({
      ...clocks,
      executionMode: input.executionMode,
      runtimeDispatcher,
      allowSimulatedDispatcher: input.executionMode === "simulated",
      executionContextStores: input.executionContextStores,
      useLiveBusinessContext: input.useLiveBusinessContext,
      brandBrainRepository: input.brandBrainRepository,
      toolRuntime: input.toolRuntime,
      promptCompiler,
    }).engine;

  const intelligenceGatewayHolder = new IntelligenceGatewayHolder();

  return {
    executor: new IntegrationLayerJobExecutor(
      integration,
      integrationJobOptions,
      intelligenceGatewayHolder
    ),
    integration,
    integrationJobOptions,
    intelligenceGatewayHolder,
  };
}
