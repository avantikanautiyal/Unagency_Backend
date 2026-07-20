/**
 * Integration bridge + pipeline interfaces.
 * Modules never call each other — only bridges invoke public engines.
 */

import type { Result } from "../../shared/result";
import type { IntelligenceOsIntegrationRequest } from "../contracts/request";
import type { IntelligenceOsIntegrationReport } from "../contracts/result";
import type { BridgeObservabilityRecord } from "../contracts/trace";
import type { IntegrationArtifactBag } from "../contracts/artifacts";
import type { TaskIntelligenceReport } from "../../task-intelligence/contracts/result";
import type { CapabilityIntelligenceReport } from "../../capability-intelligence/contracts/result";
import type { AgentPlanningReport } from "../../agent-planning/contracts/result";
import type { WorkflowIntelligenceReport } from "../../workflow-intelligence/contracts/result";
import type { GovernanceReport } from "../../execution-governance/contracts/result";
import type { ExperienceInjectionReport } from "../../experience-injection/contracts/result";
import type { ExecutionIntelligenceResult } from "../../execution-intelligence/contracts/result";
import type { ModelIntelligenceResult } from "../../model-intelligence/contracts/result";
import type { NegotiationResult } from "../../providers/negotiation/contracts/negotiation-result";
import type { RoutingDecision } from "../../providers/routing/contracts/plan";
import type { ProviderExecutionResult } from "../../providers/runtime/contracts/provider-execution-response";
import type { ConsensusReport } from "../../provider-consensus/contracts/result";
export type { EvaluationResult } from "../../evaluation/contracts/evaluation-models";
import type { EvaluationResult } from "../../evaluation/contracts/evaluation-models";
import type { LearningResult } from "../../learning/contracts/learning-models";
import type { ExecutionOptimizationResult } from "../../execution-optimization/contracts/result";
import type { ExperienceIntelligenceReport } from "../../experience-intelligence/contracts/result";
import type {
  EvaluationIntelligencePackage,
  RepositoryUpdateSummary,
} from "../contracts/artifacts";

export interface BridgeContext {
  readonly correlationId: string;
  readonly requestId: string;
  readonly request: IntelligenceOsIntegrationRequest;
}

export interface BridgeInvocationResult<T> {
  readonly value: T;
  readonly observability: BridgeObservabilityRecord;
}

export interface IIntelligenceOsIntegrationEngine {
  run(request: IntelligenceOsIntegrationRequest): Promise<Result<IntelligenceOsIntegrationReport>>;
}

export interface IIntegrationPipeline {
  execute(request: IntelligenceOsIntegrationRequest): Promise<Result<IntelligenceOsIntegrationReport>>;
}

/** Listed bridges */
export interface ITaskCapabilityBridge {
  transfer(
    ctx: BridgeContext,
    task: TaskIntelligenceReport
  ): Promise<Result<BridgeInvocationResult<CapabilityIntelligenceReport>>>;
}

export interface ICapabilityAgentBridge {
  transfer(
    ctx: BridgeContext,
    capability: CapabilityIntelligenceReport,
    task: TaskIntelligenceReport
  ): Promise<Result<BridgeInvocationResult<AgentPlanningReport>>>;
}

export interface IAgentWorkflowBridge {
  transfer(
    ctx: BridgeContext,
    agent: AgentPlanningReport
  ): Promise<Result<BridgeInvocationResult<WorkflowIntelligenceReport>>>;
}

export interface IWorkflowGovernanceBridge {
  transfer(
    ctx: BridgeContext,
    workflow: WorkflowIntelligenceReport
  ): Promise<Result<BridgeInvocationResult<GovernanceReport>>>;
}

export interface IExperienceInjectionBridge {
  transfer(
    ctx: BridgeContext,
    bag: IntegrationArtifactBag
  ): Promise<Result<BridgeInvocationResult<ExperienceInjectionReport>>>;
}

export interface ICapabilityExecutionBridge {
  transfer(
    ctx: BridgeContext,
    bag: IntegrationArtifactBag
  ): Promise<Result<BridgeInvocationResult<ExecutionIntelligenceResult>>>;
}

export interface IGovernanceExecutionBridge {
  transfer(
    ctx: BridgeContext,
    bag: IntegrationArtifactBag
  ): Promise<Result<BridgeInvocationResult<ExecutionIntelligenceResult>>>;
}

export interface IExecutionModelBridge {
  transfer(
    ctx: BridgeContext,
    bag: IntegrationArtifactBag
  ): Promise<Result<BridgeInvocationResult<ModelIntelligenceResult>>>;
}

export interface IModelNegotiationBridge {
  transfer(
    ctx: BridgeContext,
    bag: IntegrationArtifactBag
  ): Promise<Result<BridgeInvocationResult<NegotiationResult>>>;
}

export interface INegotiationRoutingBridge {
  transfer(
    ctx: BridgeContext,
    bag: IntegrationArtifactBag
  ): Promise<Result<BridgeInvocationResult<RoutingDecision>>>;
}

export interface IRoutingRuntimeBridge {
  transfer(
    ctx: BridgeContext,
    bag: IntegrationArtifactBag
  ): Promise<Result<BridgeInvocationResult<ProviderExecutionResult>>>;
}

export interface IRuntimeConsensusBridge {
  transfer(
    ctx: BridgeContext,
    bag: IntegrationArtifactBag
  ): Promise<Result<BridgeInvocationResult<ConsensusReport>>>;
}

export interface IConsensusEvaluationBridge {
  transfer(
    ctx: BridgeContext,
    bag: IntegrationArtifactBag
  ): Promise<Result<BridgeInvocationResult<EvaluationResult>>>;
}

export interface IEvaluationIntelligenceBridge {
  transfer(
    ctx: BridgeContext,
    evaluation: EvaluationResult
  ): Promise<Result<BridgeInvocationResult<EvaluationIntelligencePackage>>>;
}

export interface IEvaluationLearningBridge {
  transfer(
    ctx: BridgeContext,
    bag: IntegrationArtifactBag
  ): Promise<Result<BridgeInvocationResult<LearningResult>>>;
}

export interface ILearningOptimizationBridge {
  transfer(
    ctx: BridgeContext,
    bag: IntegrationArtifactBag
  ): Promise<Result<BridgeInvocationResult<ExecutionOptimizationResult>>>;
}

export interface IOptimizationExperienceBridge {
  transfer(
    ctx: BridgeContext,
    bag: IntegrationArtifactBag
  ): Promise<Result<BridgeInvocationResult<ExperienceIntelligenceReport>>>;
}

export interface IExperienceRepositoryBridge {
  transfer(
    ctx: BridgeContext,
    bag: IntegrationArtifactBag
  ): Promise<Result<BridgeInvocationResult<RepositoryUpdateSummary>>>;
}

export interface IntegrationBridgeSet {
  readonly taskCapability: ITaskCapabilityBridge;
  readonly capabilityAgent: ICapabilityAgentBridge;
  readonly agentWorkflow: IAgentWorkflowBridge;
  readonly workflowGovernance: IWorkflowGovernanceBridge;
  readonly experienceInjection: IExperienceInjectionBridge;
  readonly capabilityExecution: ICapabilityExecutionBridge;
  readonly governanceExecution: IGovernanceExecutionBridge;
  readonly executionModel: IExecutionModelBridge;
  readonly modelNegotiation: IModelNegotiationBridge;
  readonly negotiationRouting: INegotiationRoutingBridge;
  readonly routingRuntime: IRoutingRuntimeBridge;
  readonly runtimeConsensus: IRuntimeConsensusBridge;
  readonly consensusEvaluation: IConsensusEvaluationBridge;
  readonly evaluationIntelligence: IEvaluationIntelligenceBridge;
  readonly evaluationLearning: IEvaluationLearningBridge;
  readonly learningOptimization: ILearningOptimizationBridge;
  readonly optimizationExperience: IOptimizationExperienceBridge;
  readonly experienceRepository: IExperienceRepositoryBridge;
}
