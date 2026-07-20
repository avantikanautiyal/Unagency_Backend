/**
 * Distributed Execution Platform factory.
 */

import {
  DistributedExecutionEngine,
  type DistributedExecutionEngineDeps,
} from "../engine/distributed-execution-engine";
import type { IDistributedExecutionEngine, IJobExecutor } from "../interfaces/execution";
import { StubJobExecutor } from "../workers/job-executors";
import { createIntelligenceOsIntegrationPlatform } from "../../../intelligence/integration/factories/create-intelligence-os-integration-platform";
import { IntegrationLayerJobExecutor } from "../workers/job-executors";

export interface DistributedExecutionPlatform {
  readonly engine: IDistributedExecutionEngine;
  readonly rawEngine: DistributedExecutionEngine;
}

export interface CreateDistributedExecutionOptions
  extends Omit<DistributedExecutionEngineDeps, "executor"> {
  readonly executor?: IJobExecutor;
  /** When true (default false), wire Integration Layer as job executor. */
  readonly useIntegrationLayer?: boolean;
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
  if (!executor && options.useIntegrationLayer) {
    const integration = createIntelligenceOsIntegrationPlatform({
      nowIso,
      clockMs,
      createId,
    });
    executor = new IntegrationLayerJobExecutor(integration.engine);
  }
  if (!executor) {
    executor = new StubJobExecutor("success");
  }

  const rawEngine = new DistributedExecutionEngine({
    ...options,
    executor,
    nowIso,
    clockMs,
    createId,
  });

  return { engine: rawEngine, rawEngine };
}
