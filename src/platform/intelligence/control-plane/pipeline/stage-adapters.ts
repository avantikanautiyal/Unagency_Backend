/**
 * Stage adapters — map canonical artifacts to downstream requests.
 * Control plane only; does not modify frozen modules.
 */

import { asCapabilityId } from "../../shared/identifiers";
import { createContextIntelligenceEngine } from "../../context/factories/create-context-engine";
import { sampleContextBuildRequest } from "../../context/testing";
import { createKnowledgeIntelligenceEngine } from "../../knowledge/factories/create-knowledge-engine";
import { KnowledgeRequestBuilder } from "../../knowledge/builders/knowledge-builders";
import { createPromptCompiler } from "../../prompt-compiler/factories/create-prompt-compiler";
import { ExecutionIntelligenceRequestBuilder } from "../../execution-intelligence/builders/execution-intelligence-request-builder";
import { ModelIntelligenceRequestBuilder } from "../../model-intelligence/builders/model-intelligence-request-builder";
import type { TaskIntelligenceReport } from "../../task-intelligence/contracts/result";
import type { GovernanceReport } from "../../execution-governance/contracts/result";
import type { ModelIntelligenceResult } from "../../model-intelligence/contracts/result";
import type { ExecutionIntelligenceRequest } from "../../execution-intelligence/contracts/request";
import type { ModelIntelligenceRequest } from "../../model-intelligence/contracts/recommendation";
import type { RoutingCandidate } from "../../providers/routing/contracts/candidate";
import { asProviderId } from "../../shared/identifiers";
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

export async function buildExecutionIntelligenceRequest(
  requestId: string,
  taskReport: TaskIntelligenceReport,
  governanceReport: GovernanceReport
): Promise<ExecutionIntelligenceRequest> {
  const contextEngine = createContextIntelligenceEngine();
  const knowledgeEngine = createKnowledgeIntelligenceEngine({ enableCache: false });
  const compiler = createPromptCompiler();

  const contextReq = sampleContextBuildRequest();
  const context = await contextEngine.build({
    ...contextReq,
    inputHints: { message: taskReport.request.rawPrompt, task: taskReport.request.rawPrompt },
  });
  if (!context.ok) throw context.error;

  const knowledgeRequest = KnowledgeRequestBuilder.fromIntelligenceContext(
    context.value,
    "brand"
  ).build();
  const knowledge = await knowledgeEngine.snapshot(knowledgeRequest);
  if (!knowledge.ok) throw knowledge.error;

  const compiled = await compiler.compile({
    templateId: "default.capability",
    templateVersion: "1.0.0",
    context: context.value,
    knowledge: knowledge.value,
    variables: { "user.input": JSON.stringify({ message: taskReport.request.rawPrompt }) },
  });
  if (!compiled.ok) throw compiled.error;

  const capabilityId = String(taskReport.capabilityMap.primary);
  const budget = governanceReport.governanceExecutionPlan.budgetAssessment.totalExecutionBudget;

  return ExecutionIntelligenceRequestBuilder.create()
    .withRequestId(requestId)
    .withCapabilityId(asCapabilityId(capabilityId))
    .withContext(context.value)
    .withKnowledge(knowledge.value)
    .withCompiledPrompt(compiled.value.compiled)
    .withPreferences({
      maxTokenBudget: governanceReport.request.tokenBudgetLimit ?? 500000,
      prioritizeQuality: true,
      enableReasoning: taskReport.complexityProfile.tier !== "simple",
    })
    .withAttributes({ governanceDecision: governanceReport.governanceExecutionPlan.decision.kind })
    .build();
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
  const capabilityId = asCapabilityId(String(taskReport.capabilityMap.primary));
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
  return modelResult.candidates.candidates.map((c, i) => ({
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
