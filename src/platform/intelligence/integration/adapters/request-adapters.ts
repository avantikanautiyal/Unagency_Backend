/**
 * Stage request adapters — map producer artifacts to consumer public request contracts.
 * No module logic duplicated; only field mapping.
 */

import { asCapabilityId, asExecutionId, asOrganizationId, asProviderId, asWorkspaceId } from "../../shared/identifiers";
import type { TaskIntelligenceReport } from "../../task-intelligence/contracts/result";
import type { CapabilityIntelligenceRequest } from "../../capability-intelligence/contracts/request";
import type { CapabilityIntelligenceReport } from "../../capability-intelligence/contracts/result";
import type { AgentPlanningRequest } from "../../agent-planning/contracts/request";
import type { AgentPlanningReport } from "../../agent-planning/contracts/result";
import type { WorkflowIntelligenceRequest } from "../../workflow-intelligence/contracts/request";
import type { WorkflowIntelligenceReport } from "../../workflow-intelligence/contracts/result";
import type { GovernanceRequest } from "../../execution-governance/contracts/request";
import type { ExperienceInjectionRequest } from "../../experience-injection/contracts/request";
import type { IntegrationArtifactBag } from "../contracts/artifacts";
import type { IntelligenceOsIntegrationRequest } from "../contracts/request";
import { buildExecutionIntelligenceContext } from "../context/execution-intelligence-context-pipeline";
import type { ExecutionContextResolver } from "../../../business/execution-context";
import { ModelIntelligenceRequestBuilder } from "../../model-intelligence/builders/model-intelligence-request-builder";
import type { ExecutionIntelligenceRequest } from "../../execution-intelligence/contracts/request";
import type { ModelIntelligenceRequest } from "../../model-intelligence/contracts/recommendation";
import type { ModelIntelligenceResult } from "../../model-intelligence/contracts/result";
import type { ExecutionIntelligenceResult } from "../../execution-intelligence/contracts/result";
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
import type { NegotiationResult } from "../../providers/negotiation/contracts/negotiation-result";
import { RoutingRequestBuilder } from "../../providers/routing/builders/routing-request-builder";
import type { RoutingCandidate } from "../../providers/routing/contracts/candidate";
import type { RoutingDecision } from "../../providers/routing/contracts/plan";
import type { ProviderExecutionRequest } from "../../providers/runtime/contracts/provider-execution-request";
import type { ProviderExecutionResult } from "../../providers/runtime/contracts/provider-execution-response";
import { sampleRequest } from "../../providers/runtime/testing";
import { ConsensusRequestBuilder } from "../../provider-consensus/builders/consensus-request-builder";
import { makeCandidate } from "../../provider-consensus/testing";
import type { ConsensusRequest } from "../../provider-consensus/contracts/request";
import { EvaluationRequestBuilder, evaluationIdentityFromIds } from "../../evaluation/builders/evaluation-builders";
import type { EvaluationRequest, EvaluationResult } from "../../evaluation/contracts/evaluation-models";
import { sampleExecutionResult } from "../../evaluation/testing";
import { LearningRequestBuilder, learningIdentityFromIds } from "../../learning/builders/learning-builders";
import { sampleArtifactSnapshots } from "../../learning/testing";
import type { LearningRequest } from "../../learning/contracts/learning-models";
import { ExecutionOptimizationRequestBuilder } from "../../execution-optimization/builders/execution-optimization-request-builder";
import { makeObservabilityReport } from "../../execution-optimization/testing";
import type { ExecutionOptimizationRequest } from "../../execution-optimization/contracts/request";
import { ExperienceIntelligenceRequestBuilder } from "../../experience-intelligence/builders/experience-intelligence-request-builder";
import type { ExperienceIntelligenceRequest } from "../../experience-intelligence/contracts/request";
import type { CapabilityDepartment } from "../../capability-intelligence/contracts/enums";

export function toCapabilityRequest(
  request: IntelligenceOsIntegrationRequest,
  task: TaskIntelligenceReport
): CapabilityIntelligenceRequest {
  const department = mapDepartment(task.departmentClassification.primary);
  return {
    requestId: `${request.requestId}_cap`,
    businessObjective: task.businessObjective.description || task.businessObjective.title,
    discovery: {
      department,
      industry: request.scenarioHint,
      keywords: [task.structuredTask.title, String(task.capabilityMap.primary)],
      complexity: task.complexityProfile.tier as never,
    },
    preferredCapabilityIds: [
      String(task.capabilityMap.primary),
      ...task.capabilityMap.requirements.map((r) => String(r.capabilityId)),
    ].filter(Boolean),
    taskPlan: task.structuredTaskPlan,
  };
}

function mapDepartment(primary: string): CapabilityDepartment | undefined {
  const known: CapabilityDepartment[] = [
    "marketing",
    "design",
    "video",
    "software",
    "research",
    "business",
    "legal",
    "finance",
    "operations",
    "general",
  ];
  const lower = primary.toLowerCase();
  return known.find((d) => lower.includes(d));
}

export function toAgentPlanningRequest(
  requestId: string,
  task: TaskIntelligenceReport,
  _capability: CapabilityIntelligenceReport
): AgentPlanningRequest {
  return {
    requestId: `${requestId}_agent`,
    structuredTaskPlan: task.structuredTaskPlan,
    scenarioHint: task.request.industryHint,
  };
}

export function toWorkflowRequest(
  requestId: string,
  agent: AgentPlanningReport
): WorkflowIntelligenceRequest {
  return {
    requestId: `${requestId}_wf`,
    executionTeamPlan: agent.executionTeamPlan,
  };
}

export function toGovernanceRequest(
  request: IntelligenceOsIntegrationRequest,
  workflow: WorkflowIntelligenceReport
): GovernanceRequest {
  return {
    requestId: `${request.requestId}_gov`,
    workflowExecutionPlan: workflow.workflowExecutionPlan,
    organizationId: request.organizationId ? String(request.organizationId) : "org_1",
    workspaceId: request.workspaceId ? String(request.workspaceId) : "ws_1",
    budgetLimit: request.budgetLimit,
    tokenBudgetLimit: request.tokenBudgetLimit,
    regionHint: request.regionHint,
  };
}

export function toExperienceInjectionRequest(
  request: IntelligenceOsIntegrationRequest,
  bag: IntegrationArtifactBag
): ExperienceInjectionRequest {
  const task = bag.task!;
  return {
    requestId: `${request.requestId}_inj`,
    context: {
      capabilityId: task.capabilityMap.primary,
      department: task.departmentClassification.primary,
      industry: request.scenarioHint,
      taskType: task.taskClassification.taskType,
      complexityTier: task.complexityProfile.tier,
      organizationId: request.organizationId,
      workspaceId: request.workspaceId,
      budgetLimit: request.budgetLimit,
    },
    structuredTaskPlan: bag.task?.structuredTaskPlan,
    executionTeamPlan: bag.agentPlanning?.executionTeamPlan,
    workflowExecutionPlan: bag.workflow?.workflowExecutionPlan,
    governanceExecutionPlan: bag.governance?.governanceExecutionPlan,
  };
}

export async function toExecutionIntelligenceRequest(
  requestId: string,
  bag: IntegrationArtifactBag,
  integrationRequest: IntelligenceOsIntegrationRequest,
  resolver: ExecutionContextResolver
): Promise<{
  request: ExecutionIntelligenceRequest;
  contextTrace: {
    contextSnapshotId?: string;
    brandEnrichmentId?: string;
    brandBrainVersion?: number;
    knowledgeSnapshotId?: string;
    promptCompilationId?: string;
    promptVersion?: string;
  };
}> {
  const built = await buildExecutionIntelligenceContext({
    requestId,
    integrationRequest,
    bag,
    deps: { resolver },
  });
  return {
    request: built.request,
    contextTrace: {
      contextSnapshotId: built.contextBundle.trace.contextSnapshotId,
      brandEnrichmentId: built.contextBundle.trace.brandSnapshotId,
      brandBrainVersion: built.contextBundle.trace.brandBrainVersion,
      knowledgeSnapshotId: built.contextBundle.trace.knowledgeSnapshotId,
      promptCompilationId: built.promptCompilationId,
      promptVersion: built.request.compiledPrompt?.templateVersion,
    },
  };
}

export function toModelIntelligenceRequest(
  requestId: string,
  bag: IntegrationArtifactBag
): ModelIntelligenceRequest {
  const taskReport = bag.task!;
  const governanceReport = bag.governance!;
  return ModelIntelligenceRequestBuilder.create()
    .withRequestId(`${requestId}_mi`)
    .withCapabilityId(taskReport.capabilityMap.primary)
    .withDepartment(taskReport.departmentClassification.primary)
    .withTaskDescription(taskReport.request.rawPrompt)
    .withBudget(governanceReport.governanceExecutionPlan.budgetAssessment.totalExecutionBudget)
    .withExpectedOutputTokens(
      governanceReport.governanceExecutionPlan.workflowExecutionPlan.graph.nodes.length * 800
    )
    .build();
}

export function toNegotiationRequest(
  requestId: string,
  bag: IntegrationArtifactBag
): NegotiationRequest {
  const taskReport = bag.task!;
  const execIntelResult = bag.executionIntelligence!;
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
    requestId: `${requestId}_neg`,
    organizationId: TEST_ORG,
    workspaceId: TEST_WORKSPACE,
  });
}

export function seedNegotiationCapability(taskReport: TaskIntelligenceReport) {
  return makeCapability({
    id: TEST_CAPABILITY,
    name: String(taskReport.capabilityMap.primary),
    displayName: taskReport.structuredTask.title,
  });
}

export function toRoutingCandidates(modelResult: ModelIntelligenceResult): RoutingCandidate[] {
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

export function toRoutingRequest(requestId: string, modelResult: ModelIntelligenceResult) {
  const candidates = toRoutingCandidates(modelResult);
  return RoutingRequestBuilder.create()
    .withRequestId(`${requestId}_route`)
    .withCapabilityId(modelResult.candidates.capabilityId)
    .withCandidates(candidates)
    .withStrategy("balanced")
    .build();
}

export function toProviderExecutionRequest(
  requestId: string,
  bag: IntegrationArtifactBag
): ProviderExecutionRequest {
  const routing = bag.routing!;
  const task = bag.task!;
  const providerId = asProviderId(String(routing.plan.primary.providerId ?? "openai"));
  const promptText = task.request.rawPrompt;
  const base = sampleRequest({
    requestId: `${requestId}_rt`,
    providerId: String(providerId),
    payload: {
      prompt: promptText,
      // Embedding leaves read text|prompt|input — keep text for embedding.generate.
      text: promptText,
      input: promptText,
      capabilityPlan: bag.capability?.executionPlan.capabilityIds,
    },
  });
  return {
    ...base,
    capabilityId: task.capabilityMap.primary,
    providerId,
    modelId: routing.plan.primary.modelId
      ? String(routing.plan.primary.modelId)
      : base.modelId,
    context: {
      ...base.context,
      providerId,
      organizationId: asOrganizationId("org_1"),
      workspaceId: asWorkspaceId("ws_1"),
      executionId: asExecutionId(`${requestId}_exec`),
      correlationId: requestId,
    },
  };
}

export function toConsensusRequest(
  requestId: string,
  runtime: ProviderExecutionResult
): ConsensusRequest {
  const providerId = String(runtime.response?.providerId ?? "openai");
  const candidate = makeCandidate(providerId, "integrated result", {
    quality: 0.8,
    latencyMs: runtime.statistics.totalMs,
  });
  return ConsensusRequestBuilder.create()
    .withRequestId(`${requestId}_cons`)
    .withCandidates([
      {
        ...candidate,
        execution: runtime,
      },
    ])
    .withStrategy("single_winner")
    .build();
}

export function toEvaluationRequest(
  requestId: string,
  bag: IntegrationArtifactBag
): EvaluationRequest {
  const output =
    bag.consensus?.consensus.canonicalResponse.output ??
    bag.runtime?.response?.output ??
    { message: bag.task?.request.rawPrompt ?? "ok" };

  return EvaluationRequestBuilder.create()
    .withIdentity(
      evaluationIdentityFromIds({
        organizationId: "org_1",
        workspaceId: "ws_1",
        executionId: `${requestId}_exec`,
        capabilityId: String(bag.task?.capabilityMap.primary ?? "general"),
        correlationId: requestId,
      })
    )
    .withExecutionResult(
      sampleExecutionResult({
        output,
        success: bag.runtime?.success ?? true,
        sessionId: bag.runtime?.sessionId ?? "session_int",
      })
    )
    .build();
}

export async function toLearningRequest(
  requestId: string,
  bag: IntegrationArtifactBag
): Promise<LearningRequest> {
  const artifacts = await sampleArtifactSnapshots();
  return LearningRequestBuilder.create()
    .withIdentity(
      learningIdentityFromIds({
        organizationId: "org_1",
        workspaceId: "ws_1",
        capabilityId: String(bag.task?.capabilityMap.primary ?? "general"),
        executionId: `${requestId}_exec`,
      })
    )
    .withScope({ kind: "workspace", scopeId: "ws_1" })
    .withArtifacts(artifacts)
    .build();
}

export function toOptimizationRequest(
  requestId: string,
  bag: IntegrationArtifactBag
): ExecutionOptimizationRequest {
  return ExecutionOptimizationRequestBuilder.create()
    .withRequestId(`${requestId}_opt`)
    .withCapabilityId(asCapabilityId(String(bag.task?.capabilityMap.primary ?? "text.generate")))
    .withInputs({
      evaluationReports: bag.evaluation ? [bag.evaluation.report] : [],
      learningResults: bag.learning ? [bag.learning] : [],
      intelligenceResults: bag.executionIntelligence ? [bag.executionIntelligence] : [],
      observabilityReports: [
        makeObservabilityReport({
          providerId: String(bag.routing?.plan.primary.providerId ?? "openai"),
          capabilityId: bag.task?.capabilityMap.primary,
        }),
      ],
    })
    .build();
}

export function toExperienceIntelligenceRequest(
  requestId: string,
  bag: IntegrationArtifactBag
): ExperienceIntelligenceRequest {
  return ExperienceIntelligenceRequestBuilder.create()
    .withRequestId(`${requestId}_exp`)
    .withInputs({
      evaluationReports: bag.evaluation ? [bag.evaluation.report] : [],
      learningResults: bag.learning ? [bag.learning] : [],
      optimizationResults: bag.optimization ? [bag.optimization] : [],
      observabilityReports: [
        makeObservabilityReport({
          providerId: String(bag.routing?.plan.primary.providerId ?? "openai"),
        }),
      ],
    })
    .build();
}

/** Ensure unused import referenced for negotiation seed side effects in tests. */
export type { NegotiationResult, ExecutionIntelligenceResult, EvaluationResult };
