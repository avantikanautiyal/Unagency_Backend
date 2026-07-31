/**
 * Composes distributed execution + Integration OS for Enterprise API execution modes.
 */

import type { IProviderDispatcher } from "../../intelligence/providers/runtime/interfaces/provider-dispatcher";
import type { IIntelligenceOsIntegrationEngine } from "../../intelligence/integration/interfaces/integration";
import { createIntelligenceOsIntegrationPlatform } from "../../intelligence/integration/factories/create-intelligence-os-integration-platform";
import { ControllableDispatcher } from "../../intelligence/providers/runtime/testing";
import type { IExecutionContextStores } from "../../business/execution-context";
import {
  IntegrationLayerJobExecutor,
  StubJobExecutor,
  type IntegrationLayerJobExecutorOptions,
} from "../../infrastructure/execution/workers/job-executors";
import type { IJobExecutor } from "../../infrastructure/execution/interfaces/execution";
import type { EnterpriseApiExecutionMode } from "./execution-mode";
import { integrationPipelineModeFor } from "./execution-mode";

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
}

export interface ComposedEnterpriseExecution {
  readonly executor: IJobExecutor;
  readonly integration?: IIntelligenceOsIntegrationEngine;
  readonly integrationJobOptions: IntegrationLayerJobExecutorOptions;
}

export function composeEnterpriseExecution(
  input: ComposeEnterpriseExecutionInput
): ComposedEnterpriseExecution {
  const clocks = {
    nowIso: input.nowIso ?? (() => new Date().toISOString()),
    clockMs: input.clockMs ?? (() => Date.now()),
    createId: input.createId ?? ((p: string) => `${p}_${Date.now()}`),
  };

  const integrationJobOptions: IntegrationLayerJobExecutorOptions = {
    integrationMode: integrationPipelineModeFor(input.executionMode),
    executionMode: input.executionMode === "live" ? "live" : "simulated",
  };

  if (input.executionMode === "stub") {
    return {
      executor: new StubJobExecutor("success"),
      integrationJobOptions,
    };
  }

  if (input.executionMode === "live" && !input.integration && !input.runtimeDispatcher) {
    throw new Error(
      "LIVE execution requires a pre-booted integration engine or runtimeDispatcher"
    );
  }

  const integration =
    input.integration ??
    createIntelligenceOsIntegrationPlatform({
      ...clocks,
      runtimeDispatcher:
        input.runtimeDispatcher ??
        new ControllableDispatcher({ nowIso: clocks.nowIso }),
      executionContextStores: input.executionContextStores,
      useLiveBusinessContext: input.useLiveBusinessContext,
      brandBrainRepository: input.brandBrainRepository,
      toolRuntime: input.toolRuntime,
    }).engine;

  return {
    executor: new IntegrationLayerJobExecutor(integration, integrationJobOptions),
    integration,
    integrationJobOptions,
  };
}
