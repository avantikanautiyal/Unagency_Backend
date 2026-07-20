/**
 * Task Intelligence testing utilities.
 */

import { TaskIntelligenceRequestBuilder } from "../builders/task-intelligence-request-builder";
import {
  createTaskIntelligencePlatform,
  type CreateTaskIntelligencePlatformOptions,
  type TaskIntelligencePlatform,
} from "../factories/create-task-intelligence-platform";

export function sampleSneakerLaunchRequest() {
  return TaskIntelligenceRequestBuilder.create()
    .withRequestId("ti_req_sneaker_launch")
    .withRawPrompt("Launch a new sneaker collection")
    .withIndustryHint("retail")
    .build();
}

export function deterministicHelpers() {
  let id = 0;
  let ms = 0;
  return {
    createId: (prefix: string) => `${prefix}_${++id}`,
    nowIso: () => "2026-01-01T00:00:00.000Z",
    clockMs: () => (ms += 2),
  };
}

export function setupTaskIntelligencePlatform(
  options: CreateTaskIntelligencePlatformOptions = {}
): TaskIntelligencePlatform {
  const helpers = deterministicHelpers();
  return createTaskIntelligencePlatform({
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    clockMs: helpers.clockMs,
    ...options,
  });
}
