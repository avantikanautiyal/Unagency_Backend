/**
 * Distributed execution testing helpers.
 */

import {
  createDistributedExecutionPlatform,
  type CreateDistributedExecutionOptions,
  type DistributedExecutionPlatform,
} from "../factories/create-distributed-execution-platform";
import { StubJobExecutor } from "../workers/job-executors";
import { EnqueueJobInputBuilder } from "../builders/enqueue-job-input-builder";

export function deterministicHelpers() {
  let id = 0;
  let ms = 1_700_000_000_000;
  return {
    createId: (prefix: string) => `${prefix}_${++id}`,
    nowIso: () => new Date(ms).toISOString(),
    clockMs: () => ms,
    advance: (n: number) => {
      ms += n;
    },
  };
}

export function setupDistributedExecution(
  options: CreateDistributedExecutionOptions & {
    stubBehavior?: "success" | "fail" | "fail_once";
  } = {}
): DistributedExecutionPlatform & {
  helpers: ReturnType<typeof deterministicHelpers>;
} {
  const helpers = deterministicHelpers();
  const { stubBehavior, executor, ...rest } = options;
  const platform = createDistributedExecutionPlatform({
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    clockMs: helpers.clockMs,
    maxConcurrency: rest.maxConcurrency ?? 8,
    executor: executor ?? new StubJobExecutor(stubBehavior ?? "success"),
    ...rest,
  });
  return { ...platform, helpers };
}

export function sampleEnqueue(prompt = "Launch a retail campaign") {
  return EnqueueJobInputBuilder.create()
    .withPrompt(prompt)
    .withOrganization("org_1")
    .withWorkspace("ws_1")
    .withScenarioHint("retail")
    .withPriority("normal")
    .build();
}
