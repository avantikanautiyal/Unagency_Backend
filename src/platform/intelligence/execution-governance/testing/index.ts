/**
 * Execution Governance testing utilities.
 */

import { GovernanceRequestBuilder } from "../builders/governance-request-builder";
import {
  createExecutionGovernancePlatform,
  type ExecutionGovernancePlatform,
  type CreateExecutionGovernancePlatformOptions,
} from "../factories/create-execution-governance-platform";
import {
  sampleProductLaunchWorkflowRequest,
  setupWorkflowIntelligencePlatform,
} from "../../workflow-intelligence/testing";

export async function sampleProductLaunchWorkflowPlan() {
  const { engine } = setupWorkflowIntelligencePlatform();
  const request = await sampleProductLaunchWorkflowRequest();
  const result = await engine.plan(request);
  if (!result.ok) throw result.error;
  return result.value.workflowExecutionPlan;
}

export async function sampleProductLaunchGovernanceRequest() {
  const workflowPlan = await sampleProductLaunchWorkflowPlan();
  return GovernanceRequestBuilder.create()
    .withRequestId("gov_req_product_launch")
    .withWorkflowExecutionPlan(workflowPlan)
    .withBudgetLimit(500)
    .withTokenBudgetLimit(500000)
    .withRegionHint("us")
    .withComplianceFrameworks(["gdpr", "internal"])
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

export function setupExecutionGovernancePlatform(
  options: CreateExecutionGovernancePlatformOptions = {}
): ExecutionGovernancePlatform {
  const helpers = deterministicHelpers();
  return createExecutionGovernancePlatform({
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    clockMs: helpers.clockMs,
    ...options,
  });
}
