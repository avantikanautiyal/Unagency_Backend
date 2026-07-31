/**
 * Stage adapters — map canonical artifacts to downstream requests.
 * Control plane only; does not modify frozen modules.
 */

import { asCapabilityId, asOrganizationId, asProviderId, asWorkspaceId } from "../../shared/identifiers";
import { ModelIntelligenceRequestBuilder } from "../../model-intelligence/builders/model-intelligence-request-builder";
import type { TaskIntelligenceReport } from "../../task-intelligence/contracts/result";
import type { GovernanceReport } from "../../execution-governance/contracts/result";
import type { ModelIntelligenceResult } from "../../model-intelligence/contracts/result";
import type { ExecutionIntelligenceRequest } from "../../execution-intelligence/contracts/request";
import type { ModelIntelligenceRequest } from "../../model-intelligence/contracts/recommendation";
import type { RoutingCandidate } from "../../providers/routing/contracts/candidate";
import {
  makeCapability,
  makePlan,
  makeRequest,
  TEST_CAPABILITY,
  TEST_ORG,
  TEST_PROVIDER,
  TEST_WORKSPACE,
} from "../../providers/negotiation/testing";
import type { NegotiationRequest } from "../../providers/negotiation/contracts/negotiation-request";
import { RoutingRequestBuilder } from "../../providers/routing/builders/routing-request-builder";
import type { ExecutionContextResolver } from "../../../business/execution-context";
import { buildExecutionIntelligenceContext } from "../../integration/context/execution-intelligence-context-pipeline";
import type { IntegrationArtifactBag } from "../../integration/contracts/artifacts";
import type { IntelligenceOsIntegrationRequest } from "../../integration/contracts/request";

export async function buildExecutionIntelligenceRequest(
  requestId: string,
  taskReport: TaskIntelligenceReport,
  governanceReport: GovernanceReport,
  resolver: ExecutionContextResolver
): Promise<ExecutionIntelligenceRequest> {
  const integrationRequest: IntelligenceOsIntegrationRequest = {
    requestId,
    rawPrompt: taskReport.request.rawPrompt,
    organizationId: asOrganizationId(String(governanceReport.request.organizationId)),
    workspaceId: asWorkspaceId(String(governanceReport.request.workspaceId)),
    tokenBudgetLimit: governanceReport.request.tokenBudgetLimit,
    scenarioHint: taskReport.request.industryHint,
    metadata: {
      userId: "control_plane_user",
      organizationId: String(governanceReport.request.organizationId),
      workspaceId: String(governanceReport.request.workspaceId),
    },
  };

  const bag: IntegrationArtifactBag = {
    task: taskReport,
    governance: governanceReport,
  };

  const built = await buildExecutionIntelligenceContext({
    requestId,
    integrationRequest,
    bag,
    deps: { resolver },
  });

  return built.request;
}

export function buildModelIntelligenceRequest(
  requestId: string,
  taskReport: TaskIntelligenceReport,
  governanceReport: GovernanceReport
): ModelIntelligenceRequest {
  return ModelIntelligenceRequestBuilder.create()
    .withRequestId(requestId)
    .withCapabilityId(taskReport.capabilityMap.primary)
    .withDepartment(taskReport.departmentClassification.primary)
    .withTaskDescription(taskReport.request.rawPrompt)
    .withBudget(governanceReport.governanceExecutionPlan.budgetAssessment.totalExecutionBudget)
    .withExpectedOutputTokens(
      governanceReport.governanceExecutionPlan.workflowExecutionPlan.graph.nodes.length * 800
    )
    .build();
}

export function buildNegotiationRequest(
  requestId: string,
  taskReport: TaskIntelligenceReport,
  execIntelResult: import("../../execution-intelligence/contracts/result").ExecutionIntelligenceResult
): NegotiationRequest {
  const plan = makePlan({
    planId: `plan_${requestId}`,
    capabilityId: TEST_CAPABILITY,
    providerSelection: {
      primaryProviderId: TEST_PROVIDER,
      fallbackProviderIds: [],
      modelId: execIntelResult.strategy.kind,
    },
    budget: {
      maxCost: execIntelResult.budget.totalEstimated,
      currency: "USD",
    },
    metadata: {
      ...makePlan().metadata,
      capabilityId: TEST_CAPABILITY,
      costEstimate: { estimated: execIntelResult.budget.totalEstimated },
    },
  });

  return makeRequest(plan, {
    requestId,
    organizationId: TEST_ORG,
    workspaceId: TEST_WORKSPACE,
  });
}

export function buildRoutingCandidates(
  modelResult: ModelIntelligenceResult
): RoutingCandidate[] {
  return modelResult.candidates.candidates.map((c) => ({
    providerId: asProviderId(String(c.providerId)),
    vendor: String(c.providerId),
    modelId: String(c.modelId),
    region: "us-east-1",
    capabilities: [String(modelResult.candidates.capabilityId)],
    healthy: true,
    healthState: "healthy" as const,
    estimatedLatencyMs: c.expectedLatencyMs,
    estimatedCost: c.expectedCost,
    qualityScore: c.overallScore / 100,
    availability: 1,
    priority: c.rank,
  }));
}

export function buildRoutingRequest(
  requestId: string,
  modelResult: ModelIntelligenceResult,
  candidates: RoutingCandidate[]
) {
  return RoutingRequestBuilder.create()
    .withRequestId(requestId)
    .withCapabilityId(modelResult.candidates.capabilityId)
    .withCandidates(candidates)
    .withStrategy("balanced")
    .build();
}

export function negotiationCapabilitySeed(taskReport: TaskIntelligenceReport) {
  return makeCapability({
    id: TEST_CAPABILITY,
    name: String(taskReport.capabilityMap.primary),
    displayName: taskReport.structuredTask.title,
  });
}
