/**
 * Concrete integration bridges — each invokes only public module engines.
 */

import { failure, success, type Result } from "../../shared/result";
import { ValidationError } from "../../shared/errors";
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
  toConsensusRequest,
  toEvaluationRequest,
  toLearningRequest,
  toOptimizationRequest,
  toExperienceIntelligenceRequest,
  seedNegotiationCapability,
} from "../adapters/request-adapters";

export interface BridgeClockDeps {
  readonly nowIso: () => string;
  readonly clockMs: () => number;
  readonly createId: (prefix: string) => string;
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
        const req = await toExecutionIntelligenceRequest(ctx.requestId, bag);
        return engine.optimize(req);
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
    private readonly clocks: BridgeClockDeps
  ) {}

  transfer(ctx: BridgeContext, bag: IntegrationArtifactBag) {
    if (bag.task) seedNegotiationCapability(bag.task);
    return observeBridgeCall(
      {
        bridgeName: "IModelNegotiationBridge",
        fromStage: "model_intelligence",
        toStage: "negotiation",
        ctx,
        ...this.clocks,
        inputSummary: { modelResultId: bag.modelIntelligence?.resultId },
      },
      () => this.engine.negotiate(toNegotiationRequest(ctx.requestId, bag)),
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
      () => this.engine.route(toRoutingRequest(ctx.requestId, model)),
      (v) => ({ primary: String(v.plan.primary.providerId) })
    );
  }
}

export class RoutingRuntimeBridge implements IRoutingRuntimeBridge {
  constructor(
    private readonly engine: IProviderRuntime,
    private readonly clocks: BridgeClockDeps
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
      () => this.engine.execute(toProviderExecutionRequest(ctx.requestId, bag)),
      (v) => ({ success: v.success, status: v.status })
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
      () => this.engine.evaluate(toEvaluationRequest(ctx.requestId, bag)),
      (v) => ({
        passed: v.report.summary.passed,
        score: v.report.summary.overallScore,
      })
    );
  }
}

export class EvaluationIntelligenceBridge implements IEvaluationIntelligenceBridge {
  constructor(private readonly clocks: BridgeClockDeps) {}

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
      async () =>
        success({
          evaluationResult: evaluation,
          readyForLearning: true,
          notes:
            "Evaluation Intelligence is provided by the Evaluation module public outputs (no separate engine).",
        }),
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
        const req = await toLearningRequest(ctx.requestId, bag);
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

export class ExperienceRepositoryBridge implements IExperienceRepositoryBridge {
  constructor(
    private readonly repository: IExperienceRepository,
    private readonly clocks: BridgeClockDeps
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
      () => {
        const experiences = bag.experienceIntelligence?.experiences ?? [];
        if (experiences.length > 0) {
          const saved = this.repository.saveMany(experiences);
          if (!saved.ok) return saved;
        }
        const count = this.repository.count();
        if (!count.ok) return count;
        const snap = this.repository.snapshot();
        if (!snap.ok) return snap;
        return success({
          experiencesSaved: experiences.length,
          repositoryCount: count.value,
          snapshotId: snap.value.snapshotId,
        });
      },
      (v) => ({ saved: v.experiencesSaved, count: v.repositoryCount })
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
          industryHint: ctx.request.scenarioHint,
          budgetHint: ctx.request.budgetLimit,
          regionHint: ctx.request.regionHint,
        }),
      (v) => ({ taskResultId: v.resultId, objective: v.businessObjective.title })
    );
  }
}

export function createIntegrationBridges(
  engines: StageEngines,
  clocks: BridgeClockDeps
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
    modelNegotiation: new ModelNegotiationBridge(engines.negotiation, clocks),
    negotiationRouting: new NegotiationRoutingBridge(engines.routing, clocks),
    routingRuntime: new RoutingRuntimeBridge(engines.runtime, clocks),
    runtimeConsensus: new RuntimeConsensusBridge(engines.consensus, clocks),
    consensusEvaluation: new ConsensusEvaluationBridge(engines.evaluation, clocks),
    evaluationIntelligence: new EvaluationIntelligenceBridge(clocks),
    evaluationLearning: new EvaluationLearningBridge(engines.learning, clocks),
    learningOptimization: new LearningOptimizationBridge(engines.optimization, clocks),
    optimizationExperience: new OptimizationExperienceBridge(engines.experienceIntelligence, clocks),
    experienceRepository: new ExperienceRepositoryBridge(engines.experienceRepository, clocks),
  };
}
