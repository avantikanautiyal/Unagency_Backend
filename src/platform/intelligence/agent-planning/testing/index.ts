/**
 * Agent Planning testing utilities.
 */

import { AgentPlanningRequestBuilder } from "../builders/agent-planning-request-builder";
import {
  createAgentPlanningPlatform,
  type AgentPlanningPlatform,
  type CreateAgentPlanningPlatformOptions,
} from "../factories/create-agent-planning-platform";
import {
  sampleSneakerLaunchRequest,
  setupTaskIntelligencePlatform,
} from "../../task-intelligence/testing";

export async function sampleSneakerLaunchStructuredPlan() {
  const { engine } = setupTaskIntelligencePlatform();
  const taskResult = await engine.analyze(sampleSneakerLaunchRequest());
  if (!taskResult.ok) throw taskResult.error;
  return taskResult.value.structuredTaskPlan;
}

export async function sampleSneakerLaunchAgentRequest() {
  const plan = await sampleSneakerLaunchStructuredPlan();
  return AgentPlanningRequestBuilder.create()
    .withRequestId("ap_req_sneaker_launch")
    .withStructuredTaskPlan(plan)
    .withScenarioHint("Launch a new sneaker collection")
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

export function setupAgentPlanningPlatform(
  options: CreateAgentPlanningPlatformOptions = {}
): AgentPlanningPlatform {
  const helpers = deterministicHelpers();
  return createAgentPlanningPlatform({
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    clockMs: helpers.clockMs,
    ...options,
  });
}
