/**
 * Workflow Intelligence testing utilities.
 */

import { WorkflowIntelligenceRequestBuilder } from "../builders/workflow-intelligence-request-builder";
import {
  createWorkflowIntelligencePlatform,
  type WorkflowIntelligencePlatform,
  type CreateWorkflowIntelligencePlatformOptions,
} from "../factories/create-workflow-intelligence-platform";
import {
  sampleSneakerLaunchAgentRequest,
  setupAgentPlanningPlatform,
} from "../../agent-planning/testing";

export async function sampleProductLaunchTeamPlan() {
  const { engine } = setupAgentPlanningPlatform();
  const request = await sampleSneakerLaunchAgentRequest();
  const result = await engine.plan(request);
  if (!result.ok) throw result.error;
  return result.value.executionTeamPlan;
}

export async function sampleProductLaunchWorkflowRequest() {
  const teamPlan = await sampleProductLaunchTeamPlan();
  return WorkflowIntelligenceRequestBuilder.create()
    .withRequestId("wi_req_product_launch")
    .withExecutionTeamPlan(teamPlan)
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

export function setupWorkflowIntelligencePlatform(
  options: CreateWorkflowIntelligencePlatformOptions = {}
): WorkflowIntelligencePlatform {
  const helpers = deterministicHelpers();
  return createWorkflowIntelligencePlatform({
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    clockMs: helpers.clockMs,
    ...options,
  });
}
