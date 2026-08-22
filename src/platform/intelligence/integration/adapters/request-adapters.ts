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
import type { NegotiationRequest } from "../../providers/negotiation/contracts/negotiation-request";
import type { NegotiationResult } from "../../providers/negotiation/contracts/negotiation-result";
import {
  buildProductionNegotiationPlan,
  buildProductionNegotiationRequest,
} from "../../providers/negotiation/builders/production-negotiation-request";
import { RoutingRequestBuilder } from "../../providers/routing/builders/routing-request-builder";
import type { RoutingCandidate } from "../../providers/routing/contracts/candidate";
import type { RoutingDecision } from "../../providers/routing/contracts/plan";
import type { ProviderExecutionRequest } from "../../providers/runtime/contracts/provider-execution-request";
import type { ProviderExecutionResult } from "../../providers/runtime/contracts/provider-execution-response";
import { sampleRequest } from "../../providers/runtime/testing";
import { resolveExecutableModelId } from "../../providers/routing/performance/failover/executable-model-id";
import { ConsensusRequestBuilder } from "../../provider-consensus/builders/consensus-request-builder";
import { makeCandidate } from "../../provider-consensus/testing";
import type { ConsensusRequest } from "../../provider-consensus/contracts/request";
import { EvaluationRequestBuilder, evaluationIdentityFromIds } from "../../evaluation/builders/evaluation-builders";
import type { EvaluationRequest, EvaluationResult } from "../../evaluation/contracts/evaluation-models";
import { sampleExecutionResult } from "../../evaluation/testing";
import { LearningRequestBuilder, learningIdentityFromIds } from "../../learning/builders/learning-builders";
import type { LearningRequest } from "../../learning/contracts/learning-models";
import type { BridgeContext } from "../interfaces/integration";
import { buildBagArtifactSnapshots } from "./bag-artifact-snapshots";
import { resolveIntegrationTenant } from "./integration-tenant-scope";
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
  bag: IntegrationArtifactBag,
  integrationRequest?: IntelligenceOsIntegrationRequest
): NegotiationRequest {
  const taskReport = bag.task!;
  const execIntelResult = bag.executionIntelligence!;
  const modelPrimary = bag.modelIntelligence?.candidates?.candidates?.[0];
  const capabilityId = String(
    taskReport.capabilityMap.primary ??
      bag.capability?.executionPlan?.capabilityIds?.[0] ??
      "text.generate"
  );
  const primaryProviderId = String(
    modelPrimary?.providerId ??
      bag.routing?.plan?.primary?.providerId ??
      "provider.openai"
  );
  const organizationId = String(
    integrationRequest?.organizationId ??
      (bag as { organizationId?: string }).organizationId ??
      "org_unknown"
  );
  const workspaceId =
    integrationRequest?.workspaceId != null
      ? String(integrationRequest.workspaceId)
      : undefined;

  const plan = buildProductionNegotiationPlan({
    requestId,
    capabilityId,
    primaryProviderId,
    modelId: String(modelPrimary?.modelId ?? execIntelResult.strategy.kind),
    maxCost: execIntelResult.budget.totalEstimated,
    nowIso: new Date().toISOString(),
  });

  return buildProductionNegotiationRequest({
    requestId,
    organizationId,
    workspaceId,
    plan,
  });
}

/**
 * @deprecated Prefer ProductionNegotiationPlatform.ensureCapabilityFromTask.
 * Kept as a no-op marker for bridge call sites during Phase 0 migration.
 */
export function seedNegotiationCapability(_taskReport: TaskIntelligenceReport): void {
  // Capability seeding is performed by ProductionNegotiationPlatform.
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

export function toRoutingRequest(
  requestId: string,
  modelResult: ModelIntelligenceResult,
  preferences?: {
    preferredProviders?: readonly string[];
    preferredModelId?: string;
  }
) {
  const candidates = toRoutingCandidates(modelResult);
  let ordered = candidates;
  if (preferences?.preferredProviders?.length) {
    const preferred = new Set(preferences.preferredProviders.map(String));
    const preferredModel = preferences.preferredModelId?.trim();
    ordered = [
      ...candidates.filter(
        (c) =>
          preferred.has(String(c.providerId)) &&
          (!preferredModel || String(c.modelId) === preferredModel)
      ),
      ...candidates.filter(
        (c) =>
          preferred.has(String(c.providerId)) &&
          preferredModel &&
          String(c.modelId) !== preferredModel
      ),
      ...candidates.filter((c) => !preferred.has(String(c.providerId))),
    ];
  }
  const builder = RoutingRequestBuilder.create()
    .withRequestId(`${requestId}_route`)
    .withCapabilityId(modelResult.candidates.capabilityId)
    .withCandidates(ordered)
    .withStrategy("balanced");
  if (preferences?.preferredProviders?.length) {
    builder.withPreferences({
      preferredProviders: preferences.preferredProviders.map((id) =>
        asProviderId(id)
      ),
    });
  }
  return builder.build();
}

export function toProviderExecutionRequest(
  requestId: string,
  bag: IntegrationArtifactBag
): ProviderExecutionRequest {
  const routing = bag.routing!;
  const task = bag.task!;
  const providerId = asProviderId(String(routing.plan.primary.providerId ?? "openai"));
  const promptText = task.request.rawPrompt;
  // sampleRequest defaults to a 1s test timeout — far too short for LIVE
  // Gemini/OpenAI structured Create Design (was surfacing as "execution timed out").
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
    timeoutPolicy: {
      // LIVE gpt-image / Imagen often needs 40–90s; keep headroom for retries.
      executionTimeoutMs: 120_000,
      streamingTimeoutMs: 120_000,
      queueTimeoutMs: 30_000,
    },
    retryPolicy: {
      strategy: "exponential",
      // Cross-provider failover owns retries — don't burn the latency budget twice on one leaf.
      maxAttempts: 1,
      baseDelayMs: 250,
    },
  });
  return {
    ...base,
    capabilityId: task.capabilityMap.primary,
    providerId,
    modelId: resolveExecutableModelId(
      String(providerId),
      routing.plan.primary.modelId
        ? String(routing.plan.primary.modelId)
        : base.modelId
    ),
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

/** M10.15 — merge ProductAsset-bridged audio/assets from integration metadata into provider payload. */
export function withIntelligenceInputAssets(
  request: ProviderExecutionRequest,
  metadata?: Readonly<Record<string, unknown>>
): ProviderExecutionRequest {
  if (!metadata) return request;
  const assets = Array.isArray(metadata.assets) ? metadata.assets : undefined;
  const audio =
    metadata.audio && typeof metadata.audio === "object" ? metadata.audio : undefined;
  const language =
    typeof metadata.language === "string" ? metadata.language : undefined;
  if (!assets && !audio && !language) return request;
  return {
    ...request,
    payload: {
      ...request.payload,
      ...(assets ? { assets } : {}),
      ...(audio ? { audio } : {}),
      ...(language ? { language } : {}),
    },
  };
}

export function toConsensusRequest(
  requestId: string,
  runtime: ProviderExecutionResult
): ConsensusRequest {
  const providerId = String(
    runtime.response?.providerId ?? runtime.finalProviderId ?? "openai"
  );
  const execution: ProviderExecutionResult = runtime.response
    ? runtime
    : {
        ...runtime,
        response: {
          requestId: runtime.requestId,
          providerId: asProviderId(providerId),
          output: Object.freeze({
            content: runtime.error?.message ?? "",
            ...(runtime.error ? { error: runtime.error } : {}),
          }),
          streamed: false,
          finishedAt: runtime.completedAt,
        },
      };
  const candidate = makeCandidate(providerId, "integrated result", {
    quality: 0.8,
    latencyMs: execution.statistics?.totalMs ?? 0,
  });
  return ConsensusRequestBuilder.create()
    .withRequestId(`${requestId}_cons`)
    .withCandidates([
      {
        ...candidate,
        execution,
      },
    ])
    .withStrategy("single_winner")
    .build();
}

export function toEvaluationRequest(
  ctx: BridgeContext,
  bag: IntegrationArtifactBag
): EvaluationRequest {
  const tenant = resolveIntegrationTenant({
    request: ctx.request,
    requestId: ctx.requestId,
    bag,
  });
  const output =
    bag.consensus?.consensus.canonicalResponse.output ??
    bag.runtime?.response?.output ??
    { message: bag.task?.request.rawPrompt ?? "ok" };

  return EvaluationRequestBuilder.create()
    .withIdentity(
      evaluationIdentityFromIds({
        organizationId: tenant.organizationId,
        workspaceId: tenant.workspaceId,
        executionId: tenant.executionId,
        capabilityId: tenant.capabilityId,
        correlationId: ctx.correlationId,
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
  ctx: BridgeContext,
  bag: IntegrationArtifactBag
): Promise<LearningRequest> {
  const tenant = resolveIntegrationTenant({
    request: ctx.request,
    requestId: ctx.requestId,
    bag,
  });
  const artifacts = await buildBagArtifactSnapshots(ctx, bag);
  return LearningRequestBuilder.create()
    .withIdentity(
      learningIdentityFromIds({
        organizationId: tenant.organizationId,
        workspaceId: tenant.workspaceId,
        capabilityId: tenant.capabilityId,
        executionId: tenant.executionId,
      })
    )
    .withScope({ kind: "workspace", scopeId: tenant.workspaceId })
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
