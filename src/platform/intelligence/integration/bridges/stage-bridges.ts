/**
 * Concrete integration bridges — each invokes only public module engines.
 */

import { failure, success, type Result } from "../../shared/result";
import { ValidationError } from "../../shared/errors";
import {
  asExecutionId,
  asOrganizationId,
  asProviderId,
  asWorkspaceId,
} from "../../shared/identifiers";
import type { ITaskIntelligenceEngine } from "../../task-intelligence/interfaces/task-intelligence";
import type { ICapabilityIntelligenceEngine } from "../../capability-intelligence/interfaces/capability-intelligence";
import type { IAgentPlanningEngine } from "../../agent-planning/interfaces/agent-planning";
import type { IWorkflowIntelligenceEngine } from "../../workflow-intelligence/interfaces/workflow-intelligence";
import type { IExecutionGovernanceEngine } from "../../execution-governance/interfaces/execution-governance";
import type { IExperienceInjectionEngine } from "../../experience-injection/interfaces/experience-injection";
import type { IExecutionIntelligenceEngine } from "../../execution-intelligence/interfaces/execution-intelligence";
import type { IModelIntelligenceEngine } from "../../model-intelligence/interfaces/model-intelligence";
import type { IProviderNegotiationEngine } from "../../providers/negotiation/interfaces/negotiation-engine";
import type { IProviderRoutingEngine } from "../../providers/routing/interfaces/routing";
import type { IProviderRuntime } from "../../providers/runtime/interfaces/provider-runtime";
import type { IProviderConsensusEngine } from "../../provider-consensus/interfaces/consensus";
import type { IIntelligenceEvaluationEngine } from "../../evaluation/interfaces/evaluation-ports";
import type { ILearningIntelligenceEngine } from "../../learning/interfaces/learning-ports";
import type { IExecutionOptimizationEngine } from "../../execution-optimization/interfaces/execution-optimization";
import type {
  IExperienceIntelligenceEngine,
  IExperienceRepository,
} from "../../experience-intelligence/interfaces/experience-intelligence";
import { indexExperienceForInjection } from "../../experience-injection/retrieval/sync-memory-experience-index";
import type { TaskIntelligenceReport } from "../../task-intelligence/contracts/result";
import type { CapabilityIntelligenceReport } from "../../capability-intelligence/contracts/result";
import type { EvaluationResult } from "../../evaluation/contracts/evaluation-models";
import type {
  BridgeContext,
  BridgeInvocationResult,
  ITaskCapabilityBridge,
  ICapabilityAgentBridge,
  IAgentWorkflowBridge,
  IWorkflowGovernanceBridge,
  IExperienceInjectionBridge,
  ICapabilityExecutionBridge,
  IGovernanceExecutionBridge,
  IExecutionModelBridge,
  IModelNegotiationBridge,
  INegotiationRoutingBridge,
  IRoutingRuntimeBridge,
  IRuntimeConsensusBridge,
  IConsensusEvaluationBridge,
  IEvaluationIntelligenceBridge,
  IEvaluationLearningBridge,
  ILearningOptimizationBridge,
  IOptimizationExperienceBridge,
  IExperienceRepositoryBridge,
  IntegrationBridgeSet,
} from "../interfaces/integration";
import type { IntegrationArtifactBag } from "../contracts/artifacts";
import { observeBridgeCall } from "./observe-bridge";
import {
  toCapabilityRequest,
  toAgentPlanningRequest,
  toWorkflowRequest,
  toGovernanceRequest,
  toExperienceInjectionRequest,
  toExecutionIntelligenceRequest,
  toModelIntelligenceRequest,
  toNegotiationRequest,
  toRoutingRequest,
  toProviderExecutionRequest,
  withIntelligenceInputAssets,
  toConsensusRequest,
  toEvaluationRequest,
  toLearningRequest,
  toOptimizationRequest,
  toExperienceIntelligenceRequest,
  seedNegotiationCapability,
} from "../adapters/request-adapters";
import { buildExecutionIntelligenceContext } from "../context/execution-intelligence-context-pipeline";
import {
  parseToolRequestMetadata,
  resolveServerTools,
  type ToolRuntimePlatform,
} from "../../providers/tools/composition/tool-runtime-platform";
import {
  attachStructuredOutputWithPresentationGate,
  withStructuredOutputRequest,
} from "../../providers/tools/structured/structured-output-execution";
import type { ProviderExecutionResult } from "../../providers/runtime/contracts/provider-execution-response";

export interface BridgeClockDeps {
  readonly nowIso: () => string;
  readonly clockMs: () => number;
  readonly createId: (prefix: string) => string;
  readonly executionContextResolver: import("../../../business/execution-context").ExecutionContextResolver;
}

/**
 * Build an enriched prompt string from the artifact bag using the PromptCompiler.
 * Returns null when compilation fails so the bridge falls back to rawPrompt.
 */
async function enrichPromptFromBag(
  compiler: import("../../prompt-compiler/interfaces/prompt-ports").IPromptCompiler,
  bag: IntegrationArtifactBag,
  ctx: BridgeContext,
  clocks: BridgeClockDeps
): Promise<string | null> {
  try {
    const task = bag.task!;
    const rawPrompt = task.request.rawPrompt ?? ctx.request.rawPrompt ?? "";

    // Build a fully resolved IntelligenceContext + KnowledgeSnapshot
    // (BrandBrain -> resolver -> context -> knowledge).
    const executionContext = await buildExecutionIntelligenceContext({
      requestId: `${ctx.requestId}_prompt_enrich`,
      integrationRequest: ctx.request,
      bag,
      deps: {
        resolver: clocks.executionContextResolver,
        nowIso: clocks.nowIso,
      },
    });

    const request = executionContext.request;

    // Re-compile using the resolved context/knowledge, but override the
    // user input variable to the raw prompt (not JSON-wrapped).
    const compiled = await compiler.compile({
      templateId: request.compiledPrompt.templateId,
      templateVersion: request.compiledPrompt.templateVersion,
      context: request.context,
      knowledge: request.knowledge,
      variables: {
        "user.input": rawPrompt,
      },
    });

    if (!compiled.ok) return null;

    const compiledMessages = compiled.value.compiled.messages;
    if (!compiledMessages.length) return null;

    // Preserve ALL sections (system/brand/capability/knowledge + user).
    const sortedMessages = compiledMessages
      .slice()
      .sort((a, b) => a.order - b.order);
    const parts = sortedMessages.map((m) => m.content);
    const outputIdx = sortedMessages.findIndex((m) => m.role === "output");
    const basePrompt = parts.filter(Boolean).join("\n\n");

    // Merge learned experience memory into the final provider prompt.
    const pkg = bag.experienceInjection?.package;
    const relevant = pkg?.relevantExperiences ?? [];
    if (!relevant.length) return basePrompt;

    const topN = Math.min(pkg?.topN ?? 5, 5, relevant.length);
    const experienceLines = relevant.slice(0, topN).map((p, idx) => {
      const exp = p.experience;
      const learned =
        exp.recommendation?.trim() ||
        exp.correctionStrategy?.instruction?.trim() ||
        "";
      return `- ${idx + 1}. Trigger: ${exp.trigger}\n  Observed: ${exp.observedBehaviour}\n  Learned approach: ${learned}`;
    });

    const corrections = (pkg?.corrections ?? [])
      .slice(0, 3)
      .map((c) => `- ${c.instruction}`);

    const guidanceParts: string[] = [
      "### Experience memory (learned guidance)",
      ...experienceLines,
    ];
    if (corrections.length > 0) {
      guidanceParts.push("### Corrections");
      guidanceParts.push(...corrections);
    }

    const guidanceText = guidanceParts.join("\n").trim();
    if (outputIdx >= 0) {
      parts.splice(outputIdx, 0, guidanceText);
      return parts.filter(Boolean).join("\n\n");
    }

    return `${basePrompt}\n\n${guidanceText}`;
  } catch {
    return null;
  }
}

function ensureProviderResponse(
  result: ProviderExecutionResult,
  nowIso: () => string
): ProviderExecutionResult {
  if (result.response) return result;
  const providerId = String(result.finalProviderId ?? "unknown");
  return {
    ...result,
    response: {
      requestId: result.requestId,
      providerId: asProviderId(providerId),
      output: Object.freeze({
        content: result.error?.message ?? "",
        ...(result.error ? { error: result.error } : {}),
      }),
      streamed: false,
      finishedAt: result.completedAt || nowIso(),
    },
  };
}

export interface StageEngines {
  readonly task: ITaskIntelligenceEngine;
  readonly capability: ICapabilityIntelligenceEngine;
  readonly agent: IAgentPlanningEngine;
  readonly workflow: IWorkflowIntelligenceEngine;
  readonly governance: IExecutionGovernanceEngine;
  readonly injection: IExperienceInjectionEngine;
  readonly executionIntelligence: IExecutionIntelligenceEngine;
  readonly modelIntelligence: IModelIntelligenceEngine;
  readonly negotiation: IProviderNegotiationEngine;
  readonly routing: IProviderRoutingEngine;
  readonly runtime: IProviderRuntime;
  readonly consensus: IProviderConsensusEngine;
  readonly evaluation: IIntelligenceEvaluationEngine;
  readonly learning: ILearningIntelligenceEngine;
  readonly optimization: IExecutionOptimizationEngine;
  readonly experienceIntelligence: IExperienceIntelligenceEngine;
  readonly experienceRepository: IExperienceRepository;
}

export class TaskCapabilityBridge implements ITaskCapabilityBridge {
  constructor(
    private readonly engine: ICapabilityIntelligenceEngine,
    private readonly clocks: BridgeClockDeps
  ) {}

  transfer(ctx: BridgeContext, task: TaskIntelligenceReport) {
    return observeBridgeCall(
      {
        bridgeName: "ITaskCapabilityBridge",
        fromStage: "task_intelligence",
        toStage: "capability_intelligence",
        ctx,
        ...this.clocks,
        inputSummary: { taskResultId: task.resultId },
        artifactRefs: [String(task.resultId)],
      },
      () => this.engine.plan(toCapabilityRequest(ctx.request, task)),
      (v) => ({
        planId: v.executionPlan.planId,
        capabilities: v.executionPlan.capabilityIds.length,
      })
    );
  }
}

export class CapabilityAgentBridge implements ICapabilityAgentBridge {
  constructor(
    private readonly engine: IAgentPlanningEngine,
    private readonly clocks: BridgeClockDeps
  ) {}

  transfer(
    ctx: BridgeContext,
    capability: CapabilityIntelligenceReport,
    task: TaskIntelligenceReport
  ) {
    return observeBridgeCall(
      {
        bridgeName: "ICapabilityAgentBridge",
        fromStage: "capability_intelligence",
        toStage: "agent_planning",
        ctx,
        ...this.clocks,
        inputSummary: { capabilityResultId: capability.resultId },
      },
      () => this.engine.plan(toAgentPlanningRequest(ctx.requestId, task, capability)),
      (v) => ({ teamPlanId: v.executionTeamPlan.planId })
    );
  }
}

export class AgentWorkflowBridge implements IAgentWorkflowBridge {
  constructor(
    private readonly engine: IWorkflowIntelligenceEngine,
    private readonly clocks: BridgeClockDeps
  ) {}

  transfer(ctx: BridgeContext, agent: import("../../agent-planning/contracts/result").AgentPlanningReport) {
    return observeBridgeCall(
      {
        bridgeName: "IAgentWorkflowBridge",
        fromStage: "agent_planning",
        toStage: "workflow_intelligence",
        ctx,
        ...this.clocks,
        inputSummary: { agentResultId: agent.resultId },
      },
      () => this.engine.plan(toWorkflowRequest(ctx.requestId, agent)),
      (v) => ({ workflowPlanId: v.workflowExecutionPlan.planId })
    );
  }
}

export class WorkflowGovernanceBridge implements IWorkflowGovernanceBridge {
  constructor(
    private readonly engine: IExecutionGovernanceEngine,
    private readonly clocks: BridgeClockDeps
  ) {}

  transfer(
    ctx: BridgeContext,
    workflow: import("../../workflow-intelligence/contracts/result").WorkflowIntelligenceReport
  ) {
    return observeBridgeCall(
      {
        bridgeName: "IWorkflowGovernanceBridge",
        fromStage: "workflow_intelligence",
        toStage: "execution_governance",
        ctx,
        ...this.clocks,
        inputSummary: { workflowResultId: workflow.resultId },
      },
      () => this.engine.evaluate(toGovernanceRequest(ctx.request, workflow)),
      (v) => ({ decision: v.governanceExecutionPlan.decision.kind })
    );
  }
}

export class ExperienceInjectionBridge implements IExperienceInjectionBridge {
  constructor(
    private readonly engine: IExperienceInjectionEngine,
    private readonly clocks: BridgeClockDeps
  ) {}

  transfer(ctx: BridgeContext, bag: IntegrationArtifactBag) {
    return observeBridgeCall(
      {
        bridgeName: "IExperienceInjectionBridge",
        fromStage: "execution_governance",
        toStage: "experience_injection",
        ctx,
        ...this.clocks,
        inputSummary: { hasGovernance: Boolean(bag.governance) },
      },
      () => this.engine.inject(toExperienceInjectionRequest(ctx.request, bag)),
      (v) => ({ packageId: v.package.packageId, topN: v.package.topN })
    );
  }
}

async function runExecutionIntelligence(
  engine: IExecutionIntelligenceEngine,
  ctx: BridgeContext,
  bag: IntegrationArtifactBag,
  clocks: BridgeClockDeps,
  bridgeName: string
): Promise<Result<BridgeInvocationResult<import("../../execution-intelligence/contracts/result").ExecutionIntelligenceResult>>> {
  return observeBridgeCall(
    {
      bridgeName,
      fromStage: "experience_injection",
      toStage: "execution_intelligence",
      ctx,
      ...clocks,
      inputSummary: {
        hasCapability: Boolean(bag.capability),
        hasGovernance: Boolean(bag.governance),
      },
    },
    async () => {
      try {
        const built = await toExecutionIntelligenceRequest(
          ctx.requestId,
          bag,
          ctx.request,
          clocks.executionContextResolver
        );
        bag.contextTrace = built.contextTrace;
        return engine.optimize(built.request);
      } catch (e) {
        return failure(
          e instanceof Error
            ? new ValidationError(e.message)
            : new ValidationError("execution intelligence adapter failed")
        );
      }
    },
    (v) => ({ strategy: v.strategy.kind, resultId: v.resultId })
  );
}

export class CapabilityExecutionBridge implements ICapabilityExecutionBridge {
  constructor(
    private readonly engine: IExecutionIntelligenceEngine,
    private readonly clocks: BridgeClockDeps
  ) {}

  transfer(ctx: BridgeContext, bag: IntegrationArtifactBag) {
    return runExecutionIntelligence(
      this.engine,
      ctx,
      bag,
      this.clocks,
      "ICapabilityExecutionBridge"
    );
  }
}

export class GovernanceExecutionBridge implements IGovernanceExecutionBridge {
  constructor(
    private readonly engine: IExecutionIntelligenceEngine,
    private readonly clocks: BridgeClockDeps
  ) {}

  transfer(ctx: BridgeContext, bag: IntegrationArtifactBag) {
    return runExecutionIntelligence(
      this.engine,
      ctx,
      bag,
      this.clocks,
      "IGovernanceExecutionBridge"
    );
  }
}

export class ExecutionModelBridge implements IExecutionModelBridge {
  constructor(
    private readonly engine: IModelIntelligenceEngine,
    private readonly clocks: BridgeClockDeps
  ) {}

  transfer(ctx: BridgeContext, bag: IntegrationArtifactBag) {
    return observeBridgeCall(
      {
        bridgeName: "IExecutionModelBridge",
        fromStage: "execution_intelligence",
        toStage: "model_intelligence",
        ctx,
        ...this.clocks,
        inputSummary: { eiResultId: bag.executionIntelligence?.resultId },
      },
      () => this.engine.recommend(toModelIntelligenceRequest(ctx.requestId, bag)),
      (v) => ({ candidates: v.candidates.candidates.length })
    );
  }
}

export class ModelNegotiationBridge implements IModelNegotiationBridge {
  constructor(
    private readonly engine: IProviderNegotiationEngine,
    private readonly clocks: BridgeClockDeps,
    private readonly ensureCapabilityFromTask?: (task: TaskIntelligenceReport) => void
  ) {}

  transfer(ctx: BridgeContext, bag: IntegrationArtifactBag) {
    if (bag.task) {
      this.ensureCapabilityFromTask?.(bag.task);
      seedNegotiationCapability(bag.task);
    }
    return observeBridgeCall(
      {
        bridgeName: "IModelNegotiationBridge",
        fromStage: "model_intelligence",
        toStage: "negotiation",
        ctx,
        ...this.clocks,
        inputSummary: { modelResultId: bag.modelIntelligence?.resultId },
      },
      () => this.engine.negotiate(toNegotiationRequest(ctx.requestId, bag, ctx.request)),
      (v) => ({ decision: String(v.decision), negotiationId: v.negotiationId })
    );
  }
}

export class NegotiationRoutingBridge implements INegotiationRoutingBridge {
  constructor(
    private readonly engine: IProviderRoutingEngine,
    private readonly clocks: BridgeClockDeps
  ) {}

  transfer(ctx: BridgeContext, bag: IntegrationArtifactBag) {
    const model = bag.modelIntelligence;
    if (!model) {
      return Promise.resolve(
        failure(new ValidationError("model intelligence required for routing bridge"))
      );
    }
    return observeBridgeCall(
      {
        bridgeName: "INegotiationRoutingBridge",
        fromStage: "negotiation",
        toStage: "routing",
        ctx,
        ...this.clocks,
        inputSummary: { negotiationId: bag.negotiation?.negotiationId },
      },
      async () => {
        const meta = ctx.request.metadata ?? {};
        const preferredProviderId =
          typeof meta.preferredProviderId === "string"
            ? meta.preferredProviderId
            : typeof meta.providerId === "string"
              ? meta.providerId
              : undefined;
        const preferredModelId =
          typeof meta.preferredModelId === "string"
            ? meta.preferredModelId
            : typeof meta.modelId === "string"
              ? meta.modelId
              : undefined;
        const routed = await this.engine.route(
          toRoutingRequest(ctx.requestId, model, {
            preferredProviders: preferredProviderId
              ? [preferredProviderId]
              : undefined,
            preferredModelId,
          })
        );
        if (!routed.ok) return routed;
        // Hard-prefer matrix text/image router choice — MI often picks a different leaf.
        if (preferredProviderId && preferredModelId && routed.value.plan?.primary) {
          const vendor = preferredProviderId.replace(/^provider\./, "");
          const modelWithPrefix = preferredModelId.includes("/")
            ? preferredModelId
            : `${vendor}/${preferredModelId}`;

          // Reliable text failover after the preferred primary (OpenAI ↔ Anthropic).
          // Do not burn the failover budget on Gemini/Mistral/Meta first.
          const reliableFailoverSpecs: readonly {
            providerId: string;
            modelId: string;
          }[] = (
            preferredProviderId === "provider.anthropic"
              ? [
                  {
                    providerId: "provider.openai",
                    modelId: "openai/gpt-4o",
                  },
                  {
                    providerId: "provider.openai",
                    modelId: "openai/gpt-4o-mini",
                  },
                  {
                    providerId: "provider.anthropic",
                    modelId: "anthropic/claude-sonnet-4-6",
                  },
                ]
              : [
                  {
                    providerId: "provider.anthropic",
                    modelId: "anthropic/claude-sonnet-4-5",
                  },
                  {
                    providerId: "provider.openai",
                    modelId: "openai/gpt-4o",
                  },
                  {
                    providerId: "provider.openai",
                    modelId: "openai/gpt-4o-mini",
                  },
                  {
                    providerId: "provider.anthropic",
                    modelId: "anthropic/claude-sonnet-4-6",
                  },
                ]
          ).filter(
            (f) =>
              !(
                f.providerId === preferredProviderId &&
                f.modelId === modelWithPrefix
              ),
          );

          const primaryTemplate = routed.value.plan.primary;
          const chainTemplate = routed.value.plan.failoverChain[0];
          const dedupeKey = (providerId: string, modelId?: string) =>
            `${providerId}::${modelId ?? ""}`;
          const seenFallbacks = new Set<string>([
            dedupeKey(preferredProviderId, modelWithPrefix),
          ]);
          const mergedFallbacks = [];
          for (const spec of reliableFailoverSpecs) {
            const key = dedupeKey(spec.providerId, spec.modelId);
            if (seenFallbacks.has(key)) continue;
            seenFallbacks.add(key);
            mergedFallbacks.push({
              ...primaryTemplate,
              providerId: spec.providerId as typeof primaryTemplate.providerId,
              modelId: spec.modelId,
              selected: false,
              reason: "matrix_failover",
            });
          }
          for (const fb of routed.value.plan.fallbacks ?? []) {
            const key = dedupeKey(String(fb.providerId), fb.modelId);
            if (seenFallbacks.has(key)) continue;
            seenFallbacks.add(key);
            mergedFallbacks.push(fb);
          }

          const seenChain = new Set<string>([
            dedupeKey(preferredProviderId, modelWithPrefix),
          ]);
          const mergedChain = [];
          for (const spec of reliableFailoverSpecs) {
            const key = dedupeKey(spec.providerId, spec.modelId);
            if (seenChain.has(key)) continue;
            seenChain.add(key);
            mergedChain.push({
              kind: (chainTemplate?.kind ?? "fallback_chain") as
                | "fallback_chain"
                | "retry_routing"
                | "regional_fallback"
                | "multi_provider",
              providerId: spec.providerId as typeof primaryTemplate.providerId,
              modelId: spec.modelId,
              order: mergedChain.length + 1,
            });
          }
          for (const step of routed.value.plan.failoverChain ?? []) {
            const key = dedupeKey(String(step.providerId), step.modelId);
            if (seenChain.has(key)) continue;
            seenChain.add(key);
            mergedChain.push({
              ...step,
              order: mergedChain.length + 1,
            });
          }

          return success({
            ...routed.value,
            plan: {
              ...routed.value.plan,
              primary: {
                ...primaryTemplate,
                providerId: preferredProviderId as typeof primaryTemplate.providerId,
                modelId: modelWithPrefix,
                selected: true,
              },
              fallbacks: mergedFallbacks,
              failoverChain: mergedChain,
            },
          });
        }
        return routed;
      },
      (v) => ({ primary: String(v.plan.primary.providerId) })
    );
  }
}

export class RoutingRuntimeBridge implements IRoutingRuntimeBridge {
  constructor(
    private readonly engine: IProviderRuntime,
    private readonly clocks: BridgeClockDeps,
    private readonly failover?: {
      orchestrator: import("../../providers/routing/performance/failover/failover-orchestrator").FailoverOrchestrator;
      evidenceWriter?: import("../../providers/routing/performance/feedback/performance-evidence-writer").PerformanceEvidenceWriter;
    },
    private readonly toolRuntime?: ToolRuntimePlatform,
    private readonly promptCompiler?: import("../../prompt-compiler/interfaces/prompt-ports").IPromptCompiler
  ) {}

  transfer(ctx: BridgeContext, bag: IntegrationArtifactBag) {
    return observeBridgeCall(
      {
        bridgeName: "IRoutingRuntimeBridge",
        fromStage: "routing",
        toStage: "provider_runtime",
        ctx,
        ...this.clocks,
        inputSummary: { primary: String(bag.routing?.plan.primary.providerId) },
      },
      async () => {
        let base = withIntelligenceInputAssets(
          toProviderExecutionRequest(ctx.requestId, bag),
          ctx.request.metadata
        );

        // Enrich the prompt via PromptCompiler when available.
        // Skip when OS assembly already stacked Brief/Brand/Knowledge (restack = dilution)
        // or when the thin path / enhance_prompt explicitly opted out.
        const { shouldSkipPromptCompiler } = await import(
          "../../../api/services/execution-thin-path"
        );
        const skipCompiler = shouldSkipPromptCompiler({
          metadata: ctx.request.metadata,
          rawPrompt: bag.task?.request.rawPrompt ?? ctx.request.rawPrompt,
        });
        if (this.promptCompiler && !skipCompiler) {
          const enriched = await enrichPromptFromBag(
            this.promptCompiler,
            bag,
            ctx,
            this.clocks
          );
          if (enriched) {
            base = {
              ...base,
              payload: {
                ...base.payload,
                prompt: enriched,
                text: enriched,
                input: enriched,
              },
            };
          }
        }

        const apiExecutionId =
          typeof ctx.request.metadata?.apiExecutionId === "string"
            ? ctx.request.metadata.apiExecutionId
            : typeof ctx.request.metadata?.executionId === "string"
              ? ctx.request.metadata.executionId
              : String(base.context.executionId);
        const organizationId = String(
          ctx.request.organizationId ?? base.context.organizationId
        );
        const providerRequest = {
          ...base,
          context: {
            ...base.context,
            organizationId: asOrganizationId(organizationId),
            workspaceId: ctx.request.workspaceId
              ? asWorkspaceId(String(ctx.request.workspaceId))
              : base.context.workspaceId,
            executionId: asExecutionId(apiExecutionId),
          },
        };
        const toolRequest = parseToolRequestMetadata(ctx.request.metadata);

        // Tool continuation only when tools are named. Structured LaunchPlan /
        // Create Design must not go through an empty-tool loop (that path can
        // yield success without a response → consensus: "winning candidate
        // missing execution response").
        if (toolRequest.toolNames.length > 0) {
          if (!this.toolRuntime) {
            return failure(new ValidationError("Tool runtime is not configured"));
          }
          const tools = resolveServerTools(this.toolRuntime, toolRequest.toolNames);
          if (!tools.ok) return tools;
          const result = await this.toolRuntime.orchestrator.execute({
            providerRequest,
            tools: tools.value,
            organizationId,
            workspaceId: ctx.request.workspaceId ? String(ctx.request.workspaceId) : undefined,
            principalUserId:
              typeof ctx.request.metadata?.userId === "string"
                ? ctx.request.metadata.userId
                : undefined,
            roles: Array.isArray(ctx.request.metadata?.roles)
              ? ctx.request.metadata.roles.filter((role): role is string => typeof role === "string")
              : undefined,
            allowedToolNames: toolRequest.toolNames,
            structuredOutput: toolRequest.structuredOutput,
            workerId: "integration-tool-runtime",
          });
          if (!result.ok) return result;
          let providerResult = ensureProviderResponse(
            result.value.providerResult,
            this.clocks.nowIso
          );
          if (providerResult.error?.code === "TOOL_APPROVAL_REQUIRED") {
            const records = await this.toolRuntime.invocationStore.listByExecution(
              apiExecutionId
            );
            const invocationKeys = records
              .filter((record) => record.status === "awaiting_approval")
              .map((record) => record.invocationKey);
            providerResult = {
              ...providerResult,
              response: {
                requestId: providerResult.response?.requestId ?? providerResult.requestId,
                providerId:
                  providerResult.response?.providerId ??
                  (providerResult.finalProviderId as never) ??
                  ("" as never),
                output: Object.freeze({
                  ...((providerResult.response?.output ?? {}) as Record<string, unknown>),
                  toolApproval: { required: true, invocationKeys },
                  toolOrchestration: {
                    ...(((providerResult.response?.output as Record<string, unknown> | undefined)
                      ?.toolOrchestration as Record<string, unknown>) ?? {}),
                    aggregatedUsage: result.value.aggregatedUsage,
                    ...result.value.orchestration,
                  },
                }),
                usage: {
                  ...(providerResult.response?.usage ?? {}),
                  ...result.value.aggregatedUsage,
                },
                streamed: providerResult.response?.streamed ?? false,
                finishedAt: providerResult.response?.finishedAt ?? this.clocks.nowIso(),
              },
            };
          } else {
            providerResult = {
              ...providerResult,
              response: {
                ...providerResult.response!,
                output: Object.freeze({
                  ...((providerResult.response?.output ?? {}) as Record<string, unknown>),
                  toolOrchestration: {
                    ...(((providerResult.response?.output as Record<string, unknown> | undefined)
                      ?.toolOrchestration as Record<string, unknown>) ?? {}),
                    aggregatedUsage: result.value.aggregatedUsage,
                    ...result.value.orchestration,
                  },
                }),
                usage: {
                  ...(providerResult.response?.usage ?? {}),
                  ...result.value.aggregatedUsage,
                },
              },
            };
          }
          return success(providerResult);
        }

        const structuredRequest = toolRequest.structuredOutput
          ? withStructuredOutputRequest(providerRequest, toolRequest.structuredOutput)
          : providerRequest;

        let executed: Result<ProviderExecutionResult>;
        if (!this.failover || !bag.routing) {
          executed = await this.engine.execute(structuredRequest);
        } else {
          const outcome = await this.failover.orchestrator.execute(
            structuredRequest,
            bag.routing
          );
          if (!outcome.ok) return outcome;

          if (this.failover.evidenceWriter) {
            let finalAttemptId: string | undefined;
            for (const attempt of outcome.value.attempts) {
              const matching =
                outcome.value.result.finalProviderId === attempt.providerId &&
                outcome.value.result.success === attempt.success
                  ? outcome.value.result
                  : {
                      ...outcome.value.result,
                      success: attempt.success,
                      status: attempt.status as typeof outcome.value.result.status,
                      error: attempt.errorCode
                        ? { code: attempt.errorCode, message: attempt.errorMessage ?? "" }
                        : undefined,
                      statistics: {
                        ...outcome.value.result.statistics,
                        totalMs: attempt.latencyMs,
                        attempts: 1,
                      },
                    };
              await this.failover.evidenceWriter.recordAttempt(attempt, matching, {
                executionId: apiExecutionId,
                organizationId,
                capabilityId: String(providerRequest.capabilityId),
                routingDecisionId: String(bag.routing.decisionId),
                createId: this.clocks.createId,
                nowIso: this.clocks.nowIso,
              });
              if (attempt.success) finalAttemptId = attempt.attemptId;
              else if (!finalAttemptId) finalAttemptId = attempt.attemptId;
            }
            // M9.5P — link evaluation attach to the final recorded attempt (mutable metadata bag).
            if (finalAttemptId && ctx.request.metadata && typeof ctx.request.metadata === "object") {
              (ctx.request.metadata as Record<string, unknown>).finalAttemptId = finalAttemptId;
            }
          }
          executed = success(outcome.value.result);
        }

        if (!executed.ok) return executed;

        const runProvider = async (
          req: import("../../providers/runtime/contracts/provider-execution-request").ProviderExecutionRequest
        ) => {
          if (!this.failover || !bag.routing) {
            return this.engine.execute(req);
          }
          const outcome = await this.failover.orchestrator.execute(req, bag.routing);
          return outcome.ok ? success(outcome.value.result) : outcome;
        };

        return attachStructuredOutputWithPresentationGate({
          executed: executed.value,
          structured: toolRequest.structuredOutput,
          providerRequest: structuredRequest,
          nowIso: this.clocks.nowIso,
          reExecute: runProvider,
        });
      },
      (v) => ({
        success: v.success,
        status: v.status,
        attempts: v.attemptHistory?.length ?? 1,
        finalProvider: v.finalProviderId ?? String(v.response?.providerId ?? ""),
      })
    );
  }
}

export class RuntimeConsensusBridge implements IRuntimeConsensusBridge {
  constructor(
    private readonly engine: IProviderConsensusEngine,
    private readonly clocks: BridgeClockDeps
  ) {}

  transfer(ctx: BridgeContext, bag: IntegrationArtifactBag) {
    if (!bag.runtime) {
      return Promise.resolve(failure(new ValidationError("runtime result required")));
    }
    return observeBridgeCall(
      {
        bridgeName: "IRuntimeConsensusBridge",
        fromStage: "provider_runtime",
        toStage: "consensus",
        ctx,
        ...this.clocks,
        inputSummary: { runtimeSuccess: bag.runtime.success },
      },
      () => this.engine.decide(toConsensusRequest(ctx.requestId, bag.runtime!)),
      (v) => ({ winner: v.consensus.winningProviderId })
    );
  }
}

export class ConsensusEvaluationBridge implements IConsensusEvaluationBridge {
  constructor(
    private readonly engine: IIntelligenceEvaluationEngine,
    private readonly clocks: BridgeClockDeps
  ) {}

  transfer(ctx: BridgeContext, bag: IntegrationArtifactBag) {
    return observeBridgeCall(
      {
        bridgeName: "IConsensusEvaluationBridge",
        fromStage: "consensus",
        toStage: "evaluation",
        ctx,
        ...this.clocks,
        inputSummary: { consensusId: bag.consensus?.resultId },
      },
      async () => {
        // M9.5P — evaluation recursion / internal judge work must not re-enter.
        if (ctx.request.metadata?.isEvaluationWork === true) {
          const { buildUnevaluatedEvaluationResult } = await import(
            "../../evaluation/integrity/unevaluated-result"
          );
          return success(
            buildUnevaluatedEvaluationResult({
              requestId: ctx.requestId,
              reason: "evaluation_recursion_blocked",
            })
          );
        }
        const depth = Number(ctx.request.metadata?.evaluationDepth ?? 0);
        const maxDepth = Number(process.env.EVALUATION_MAX_DEPTH ?? 1) || 1;
        if (depth >= maxDepth && ctx.request.metadata?.evaluationDepth != null) {
          const { buildUnevaluatedEvaluationResult } = await import(
            "../../evaluation/integrity/unevaluated-result"
          );
          return success(
            buildUnevaluatedEvaluationResult({
              requestId: ctx.requestId,
              reason: "evaluation_recursion_blocked",
            })
          );
        }
        return this.engine.evaluate(toEvaluationRequest(ctx, bag));
      },
      (v) => ({
        passed: v.report.summary.passed,
        score: v.report.summary.overallScore,
        feedbackEligible: v.integrity?.feedbackEligible === true,
        qualityScore: v.integrity?.qualityScore ?? null,
        evaluationStatus: v.integrity?.evaluationStatus,
      })
    );
  }
}

export class EvaluationIntelligenceBridge implements IEvaluationIntelligenceBridge {
  constructor(
    private readonly clocks: BridgeClockDeps,
    private readonly performanceStore?: import("../../providers/routing/performance/interfaces/model-performance-store").IModelPerformanceStore
  ) {}

  transfer(ctx: BridgeContext, evaluation: EvaluationResult) {
    return observeBridgeCall(
      {
        bridgeName: "IEvaluationIntelligenceBridge",
        fromStage: "evaluation",
        toStage: "evaluation_intelligence",
        ctx,
        ...this.clocks,
        inputSummary: { reportId: evaluation.report.reportId },
      },
      async () => {
        const attemptId =
          typeof ctx.request.metadata?.finalAttemptId === "string"
            ? ctx.request.metadata.finalAttemptId
            : typeof ctx.request.metadata?.attemptId === "string"
              ? ctx.request.metadata.attemptId
              : undefined;
        const integrity = evaluation.integrity;
        if (this.performanceStore && attemptId && integrity) {
          // Only attach routing quality when feedbackEligible; still record provenance.
          await this.performanceStore.attachEvaluation(
            attemptId,
            integrity.qualityScore,
            Object.fromEntries(
              Object.entries(integrity.dimensions).filter(
                (entry): entry is [string, number] => typeof entry[1] === "number"
              )
            ),
            {
              feedbackEligible: integrity.feedbackEligible,
              evaluationTrust: integrity.evaluationTrust,
              evaluationMethod: integrity.evaluationMethod,
              evaluationStatus: integrity.evaluationStatus,
              judgeId: integrity.judgeId,
              judgeVersion: integrity.judgeVersion,
              rubricVersion: integrity.rubricVersion,
              evaluationExclusionReason: integrity.exclusionReason,
              evaluationMetricNamespace: integrity.metricNamespaces[0],
            }
          );
        }
        return success({
          evaluationResult: evaluation,
          // Learning must not treat placeholder heuristics as ground truth.
          readyForLearning: integrity?.feedbackEligible === true,
          notes:
            integrity?.feedbackEligible === true
              ? "Trusted evaluation attached for adaptive QUALITY feedback."
              : `Evaluation integrity: ${integrity?.evaluationStatus ?? "unknown"}; feedbackEligible=false (${integrity?.exclusionReason ?? "n/a"}).`,
        });
      },
      (v) => ({ readyForLearning: v.readyForLearning })
    );
  }
}

export class EvaluationLearningBridge implements IEvaluationLearningBridge {
  constructor(
    private readonly engine: ILearningIntelligenceEngine,
    private readonly clocks: BridgeClockDeps
  ) {}

  transfer(ctx: BridgeContext, bag: IntegrationArtifactBag) {
    return observeBridgeCall(
      {
        bridgeName: "IEvaluationLearningBridge",
        fromStage: "evaluation_intelligence",
        toStage: "learning",
        ctx,
        ...this.clocks,
        inputSummary: { ready: bag.evaluationIntelligence?.readyForLearning },
      },
      async () => {
        const req = await toLearningRequest(ctx, bag);
        return this.engine.learn(req);
      },
      (v) => ({ requestId: v.requestId, signals: v.signals.length })
    );
  }
}

export class LearningOptimizationBridge implements ILearningOptimizationBridge {
  constructor(
    private readonly engine: IExecutionOptimizationEngine,
    private readonly clocks: BridgeClockDeps
  ) {}

  transfer(ctx: BridgeContext, bag: IntegrationArtifactBag) {
    return observeBridgeCall(
      {
        bridgeName: "ILearningOptimizationBridge",
        fromStage: "learning",
        toStage: "execution_optimization",
        ctx,
        ...this.clocks,
        inputSummary: { learningRequestId: bag.learning?.requestId },
      },
      () => this.engine.optimize(toOptimizationRequest(ctx.requestId, bag)),
      (v) => ({ resultId: v.resultId })
    );
  }
}

export class OptimizationExperienceBridge implements IOptimizationExperienceBridge {
  constructor(
    private readonly engine: IExperienceIntelligenceEngine,
    private readonly clocks: BridgeClockDeps
  ) {}

  transfer(ctx: BridgeContext, bag: IntegrationArtifactBag) {
    return observeBridgeCall(
      {
        bridgeName: "IOptimizationExperienceBridge",
        fromStage: "execution_optimization",
        toStage: "experience_intelligence",
        ctx,
        ...this.clocks,
        inputSummary: { optResultId: bag.optimization?.resultId },
      },
      () => this.engine.process(toExperienceIntelligenceRequest(ctx.requestId, bag)),
      (v) => ({ experiences: v.experiences.length })
    );
  }
}

function collectLockedBrandColors(
  meta: Readonly<Record<string, unknown>>,
  prompt: string
): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.trim()) out.push(v.trim());
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "string" && item.trim()) out.push(item.trim());
      }
    }
  };
  push(meta.learnedBrandColors);
  push(meta.brandColors);
  push(meta.requiredColors);
  if (meta.visualBrandFields && typeof meta.visualBrandFields === "object") {
    push((meta.visualBrandFields as Record<string, unknown>).colors);
  }
  const hexInPrompt = prompt.match(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g);
  if (hexInPrompt) out.push(...hexInPrompt);
  return [...new Set(out)];
}

export class ExperienceRepositoryBridge implements IExperienceRepositoryBridge {
  constructor(
    private readonly repository: IExperienceRepository,
    private readonly clocks: BridgeClockDeps,
    private readonly extras?: {
      readonly memoryEngine?: import("../../memory/interfaces/memory-ports").IMemoryIntelligenceEngine;
      readonly indexExecutionKnowledge?: boolean;
    }
  ) {}

  transfer(ctx: BridgeContext, bag: IntegrationArtifactBag) {
    return observeBridgeCall(
      {
        bridgeName: "IExperienceRepositoryBridge",
        fromStage: "experience_intelligence",
        toStage: "repository_updates",
        ctx,
        ...this.clocks,
        inputSummary: {
          experiences: bag.experienceIntelligence?.experiences.length ?? 0,
        },
      },
      async () => {
        const experiences = bag.experienceIntelligence?.experiences ?? [];
        if (experiences.length > 0) {
          const saved = this.repository.saveMany(experiences);
          if (!saved.ok) return saved;
          for (const experience of experiences) {
            indexExperienceForInjection(experience);
          }
        }

        let memoryRecordsStored = 0;
        if (this.extras?.memoryEngine) {
          const { toMemoryIngestInput } = await import("../adapters/memory-ingest-adapters");
          const ingestInput = toMemoryIngestInput(ctx, bag);
          if (ingestInput.artifacts.length > 0) {
            const memResult = await this.extras.memoryEngine.ingest(ingestInput);
            if (!memResult.ok) return memResult;
            memoryRecordsStored = memResult.value.storedCount;
          }
        }

        let knowledgeChunksIndexed = 0;
        if (this.extras?.indexExecutionKnowledge !== false) {
          const { resolveIntegrationTenant, extractIntegrationOutputText } = await import(
            "../adapters/integration-tenant-scope"
          );
          const tenant = resolveIntegrationTenant({
            request: ctx.request,
            requestId: ctx.requestId,
            bag,
          });
          const outputText = extractIntegrationOutputText(bag);
          const prompt = bag.task?.request.rawPrompt ?? ctx.request.rawPrompt ?? "";
          if (
            tenant.organizationId !== "unknown_org" &&
            (prompt.trim() || outputText.trim())
          ) {
            try {
              const meta = (ctx.request.metadata ?? {}) as Record<string, unknown>;
              const productAction =
                typeof meta.productAction === "string"
                  ? meta.productAction
                  : undefined;

              const lockedColors = collectLockedBrandColors(meta, prompt);
              const { verifyAndReinforceBrandConstraints } = await import(
                "../../../../services/brand-constraint-verify"
              );
              const verify = await verifyAndReinforceBrandConstraints({
                organizationId: tenant.organizationId,
                brandId: tenant.brandId,
                lockedColors,
                brandTone:
                  typeof meta.brandTone === "string" ? meta.brandTone : undefined,
                brandAvoidTerms: Array.isArray(meta.brandAvoidTerms)
                  ? meta.brandAvoidTerms.filter(
                      (t): t is string => typeof t === "string"
                    )
                  : undefined,
                prompt,
                outputText,
                productAction,
              });

              // V1: do not promote failed brand-constraint outputs into knowledge.
              if (verify.checked && !verify.passed) {
                (bag as { brandConstraintFix?: string }).brandConstraintFix =
                  verify.fixDirective;
              } else {
                let allowKnowledgeIndex = true;
                if (
                  meta.service === "presentations" ||
                  meta.outputKind === "presentation"
                ) {
                  try {
                    const parsed = JSON.parse(outputText) as unknown;
                    const brandName =
                      typeof meta.brandName === "string"
                        ? meta.brandName
                        : undefined;
                    const {
                      extractPresentationMustUseFacts,
                      validatePresentationMustUseCoverage,
                      validatePresentationRoutesRelevance,
                    } = await import(
                      "../../../os/delivery/presentation-generation"
                    );
                    const facts = extractPresentationMustUseFacts({
                      userBrief: prompt,
                      brandName,
                      metadata: meta,
                    });
                    const relevance = validatePresentationRoutesRelevance({
                      data: parsed,
                      userBrief: prompt,
                      brandName,
                    });
                    const mustUse = validatePresentationMustUseCoverage({
                      data: parsed,
                      facts,
                    });
                    allowKnowledgeIndex = relevance.ok && mustUse.ok;
                  } catch {
                    /* non-JSON presentation output */
                  }
                }

                if (!allowKnowledgeIndex) {
                  (bag as { brandConstraintFix?: string }).brandConstraintFix =
                    "Presentation output failed brief grounding — not indexed as knowledge.";
                } else {
                const { indexExecutionLearning } = await import(
                  "../../../../services/knowledge-document-index-service"
                );
                const indexed = await indexExecutionLearning({
                  organizationId: tenant.organizationId,
                  brandId: tenant.brandId,
                  executionId: tenant.executionId,
                  prompt,
                  outputText,
                  capabilityId: tenant.capabilityId,
                  productAction,
                });
                knowledgeChunksIndexed = indexed.chunkCount;

                // K1 — also ensure prompt facts are indexed (idempotent by executionId).
                try {
                  const { indexPromptFacts } = await import(
                    "../../../../services/knowledge-prompt-fact-learner"
                  );
                  const facts = await indexPromptFacts({
                    organizationId: tenant.organizationId,
                    brandId: tenant.brandId,
                    executionId: tenant.executionId,
                    prompt,
                    capabilityId: tenant.capabilityId,
                    productAction,
                  });
                  if (facts.indexed) {
                    knowledgeChunksIndexed += facts.factCount > 0 ? 1 : 0;
                  }
                } catch {
                  // non-fatal
                }
                }
              }
            } catch {
              // Non-fatal — repository stage still succeeds for experiences/memory.
            }
          }
        }

        const count = this.repository.count();
        if (!count.ok) return count;
        const snap = this.repository.snapshot();
        if (!snap.ok) return snap;
        return success({
          experiencesSaved: experiences.length,
          repositoryCount: count.value,
          snapshotId: snap.value.snapshotId,
          memoryRecordsStored,
          knowledgeChunksIndexed,
        });
      },
      (v) => ({
        saved: v.experiencesSaved,
        count: v.repositoryCount,
        memory: v.memoryRecordsStored,
        knowledge: v.knowledgeChunksIndexed,
      })
    );
  }
}

/** Ingress: raw request → Task Intelligence (first hop bridge). */
export class RawRequestTaskBridge {
  constructor(
    private readonly engine: ITaskIntelligenceEngine,
    private readonly clocks: BridgeClockDeps
  ) {}

  transfer(ctx: BridgeContext) {
    return observeBridgeCall(
      {
        bridgeName: "IRawRequestTaskBridge",
        fromStage: "task_intelligence",
        toStage: "task_intelligence",
        ctx,
        ...this.clocks,
        inputSummary: { rawPromptLength: ctx.request.rawPrompt.length },
      },
      () =>
        this.engine.analyze({
          requestId: `${ctx.requestId}_ti`,
          rawPrompt: ctx.request.rawPrompt,
          industryHint:
            ctx.request.scenarioHint ??
            (typeof ctx.request.metadata?.briefIntent === "string"
              ? String(ctx.request.metadata.briefIntent)
              : undefined),
          budgetHint: ctx.request.budgetLimit,
          regionHint: ctx.request.regionHint,
        }),
      (v) => ({ taskResultId: v.resultId, objective: v.businessObjective.title })
    );
  }
}

export function createIntegrationBridges(
  engines: StageEngines,
  clocks: BridgeClockDeps,
  extras?: {
    readonly failover?: {
      orchestrator: import("../../providers/routing/performance/failover/failover-orchestrator").FailoverOrchestrator;
      evidenceWriter?: import("../../providers/routing/performance/feedback/performance-evidence-writer").PerformanceEvidenceWriter;
    };
    readonly performanceStore?: import("../../providers/routing/performance/interfaces/model-performance-store").IModelPerformanceStore;
    readonly toolRuntime?: ToolRuntimePlatform;
    readonly ensureCapabilityFromTask?: (task: TaskIntelligenceReport) => void;
    readonly promptCompiler?: import("../../prompt-compiler/interfaces/prompt-ports").IPromptCompiler;
    readonly memoryEngine?: import("../../memory/interfaces/memory-ports").IMemoryIntelligenceEngine;
    readonly indexExecutionKnowledge?: boolean;
  }
): IntegrationBridgeSet & { readonly rawTask: RawRequestTaskBridge } {
  return {
    rawTask: new RawRequestTaskBridge(engines.task, clocks),
    taskCapability: new TaskCapabilityBridge(engines.capability, clocks),
    capabilityAgent: new CapabilityAgentBridge(engines.agent, clocks),
    agentWorkflow: new AgentWorkflowBridge(engines.workflow, clocks),
    workflowGovernance: new WorkflowGovernanceBridge(engines.governance, clocks),
    experienceInjection: new ExperienceInjectionBridge(engines.injection, clocks),
    capabilityExecution: new CapabilityExecutionBridge(engines.executionIntelligence, clocks),
    governanceExecution: new GovernanceExecutionBridge(engines.executionIntelligence, clocks),
    executionModel: new ExecutionModelBridge(engines.modelIntelligence, clocks),
    modelNegotiation: new ModelNegotiationBridge(
      engines.negotiation,
      clocks,
      extras?.ensureCapabilityFromTask
    ),
    negotiationRouting: new NegotiationRoutingBridge(engines.routing, clocks),
    routingRuntime: new RoutingRuntimeBridge(
      engines.runtime,
      clocks,
      extras?.failover,
      extras?.toolRuntime,
      extras?.promptCompiler
    ),
    runtimeConsensus: new RuntimeConsensusBridge(engines.consensus, clocks),
    consensusEvaluation: new ConsensusEvaluationBridge(engines.evaluation, clocks),
    evaluationIntelligence: new EvaluationIntelligenceBridge(
      clocks,
      extras?.performanceStore
    ),
    evaluationLearning: new EvaluationLearningBridge(engines.learning, clocks),
    learningOptimization: new LearningOptimizationBridge(engines.optimization, clocks),
    optimizationExperience: new OptimizationExperienceBridge(engines.experienceIntelligence, clocks),
    experienceRepository: new ExperienceRepositoryBridge(engines.experienceRepository, clocks, {
      memoryEngine: extras?.memoryEngine,
      indexExecutionKnowledge: extras?.indexExecutionKnowledge,
    }),
  };
}
