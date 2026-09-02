/**
 * Distributed Execution Platform factory.
 */

import {
  DistributedExecutionEngine,
  type DistributedExecutionEngineDeps,
} from "../engine/distributed-execution-engine";
import type { IDistributedExecutionEngine, IJobExecutor } from "../interfaces/execution";
import type { IDirectExecutionEngine } from "../../../direct/contracts";
import type { IProviderDispatcher } from "../../../providers/runtime/interfaces/provider-dispatcher";
import type { EnterpriseApiExecutionMode } from "../../../api/runtime/execution-mode";
import { composeEnterpriseExecution } from "../../../api/runtime/compose-enterprise-execution";

export interface DistributedExecutionPlatform {
  readonly engine: IDistributedExecutionEngine;
  readonly rawEngine: DistributedExecutionEngine;
  readonly integration?: IDirectExecutionEngine;
}

export interface CreateDistributedExecutionOptions
  extends Omit<DistributedExecutionEngineDeps, "executor"> {
  readonly executor?: IJobExecutor;
  /** @deprecated Prefer executionMode */
  readonly useIntegrationLayer?: boolean;
  readonly executionMode?: EnterpriseApiExecutionMode;
  readonly integration?: IDirectExecutionEngine;
  readonly runtimeDispatcher?: IProviderDispatcher;
  readonly jobStore?: import("../interfaces/execution").IJobStore;
  readonly toolRuntime?: import("../../../providers/tools/composition/tool-runtime-platform").ToolRuntimePlatform;
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
      toolRuntime: options.toolRuntime,
      asyncMedia: options.asyncMedia,
    });
    executor = composed.executor;
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

  return { engine: rawEngine, rawEngine, integration };
}
