/**
 * Distributed Execution Platform factory.
 */

import {
  DistributedExecutionEngine,
  type DistributedExecutionEngineDeps,
} from "../engine/distributed-execution-engine";
import type { IDistributedExecutionEngine, IJobExecutor } from "../interfaces/execution";
import type { IExecutionContextStores } from "../../../business/execution-context";
import type { IIntelligenceOsIntegrationEngine } from "../../../intelligence/integration/interfaces/integration";
import type { IProviderDispatcher } from "../../../intelligence/providers/runtime/interfaces/provider-dispatcher";
import type { EnterpriseApiExecutionMode } from "../../../api/runtime/execution-mode";
import { composeEnterpriseExecution } from "../../../api/runtime/compose-enterprise-execution";

export interface DistributedExecutionPlatform {
  readonly engine: IDistributedExecutionEngine;
  readonly rawEngine: DistributedExecutionEngine;
  readonly intelligenceGatewayHolder?: import("../workers/job-executors").IntelligenceGatewayHolder;
  readonly integration?: IIntelligenceOsIntegrationEngine;
}

export interface CreateDistributedExecutionOptions
  extends Omit<DistributedExecutionEngineDeps, "executor"> {
  readonly executor?: IJobExecutor;
  /** @deprecated Prefer executionMode */
  readonly useIntegrationLayer?: boolean;
  readonly executionMode?: EnterpriseApiExecutionMode;
  readonly integration?: IIntelligenceOsIntegrationEngine;
  readonly runtimeDispatcher?: IProviderDispatcher;
  readonly executionContextStores?: IExecutionContextStores;
  readonly useLiveBusinessContext?: boolean;
  readonly brandBrainRepository?: import("../../durability/interfaces/brand-brain-repository").IBrandBrainRepository;
  readonly jobStore?: import("../interfaces/execution").IJobStore;
  readonly toolRuntime?: import("../../../intelligence/providers/tools/composition/tool-runtime-platform").ToolRuntimePlatform;
  readonly asyncMedia?: import("../../durability/create-async-media-platform").AsyncMediaPlatform;
}

export function createDistributedExecutionPlatform(
  options: CreateDistributedExecutionOptions = {}
): DistributedExecutionPlatform {
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const clockMs = options.clockMs ?? (() => Date.now());
  let seq = 0;
  const createId =
    options.createId ?? ((p: string) => `${p}_${++seq}_${clockMs()}`);

  let executor = options.executor;
  let intelligenceGatewayHolder:
    | import("../workers/job-executors").IntelligenceGatewayHolder
    | undefined;
  let integration = options.integration;
  if (!executor) {
    const mode: EnterpriseApiExecutionMode =
      options.executionMode ??
      (options.useIntegrationLayer ? "simulated" : "stub");

    const composed = composeEnterpriseExecution({
      executionMode: mode,
      nowIso,
      clockMs,
      createId,
      integration: options.integration,
      runtimeDispatcher: options.runtimeDispatcher,
      executionContextStores: options.executionContextStores,
      useLiveBusinessContext: options.useLiveBusinessContext,
      brandBrainRepository: options.brandBrainRepository,
      toolRuntime: options.toolRuntime,
      asyncMedia: options.asyncMedia,
    });
    executor = composed.executor;
    intelligenceGatewayHolder = composed.intelligenceGatewayHolder;
    integration = composed.integration ?? integration;
  }

  const rawEngine = new DistributedExecutionEngine({
    ...options,
    executor,
    store: options.jobStore ?? options.store,
    nowIso,
    clockMs,
    createId,
  });

  return { engine: rawEngine, rawEngine, intelligenceGatewayHolder, integration };
}
