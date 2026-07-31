/**
 * Intelligence OS Integration factory.
 * Wires existing public platforms through bridges — does not merge modules.
 */

import { createTaskIntelligencePlatform } from "../../task-intelligence";
import { createCapabilityIntelligencePlatform } from "../../capability-intelligence";
import { createAgentPlanningPlatform } from "../../agent-planning";
import { createWorkflowIntelligencePlatform } from "../../workflow-intelligence";
import { createExecutionGovernancePlatform } from "../../execution-governance";
import { createExperienceIntelligencePlatform } from "../../experience-intelligence";
import { createExperienceInjectionPlatform } from "../../experience-injection";
import { createExecutionIntelligencePlatform } from "../../execution-intelligence";
import { createModelIntelligencePlatform } from "../../model-intelligence";
import { setupNegotiation } from "../../providers/negotiation/testing";
import { createRoutingPlatform } from "../../providers/routing";
import { createProviderRuntime } from "../../providers/runtime";
import { ControllableDispatcher } from "../../providers/runtime/testing";
import { createProviderConsensusPlatform } from "../../provider-consensus";
import { createIntelligenceEvaluationEngine } from "../../evaluation/factories/create-evaluation-engine";
import { createLearningIntelligenceEngine } from "../../learning/factories/create-learning-engine";
import { createExecutionOptimizationPlatform } from "../../execution-optimization";
import { createIntegrationBridges } from "../bridges/stage-bridges";
import { IntegrationPipeline } from "../pipeline/integration-pipeline";
import { IntelligenceOsIntegrationEngine } from "../engine/intelligence-os-integration-engine";
import type { IIntelligenceOsIntegrationEngine } from "../interfaces/integration";
import type { IProviderDispatcher } from "../../providers/runtime/interfaces/provider-dispatcher";
import {
  createExecutionContextResolver,
  InMemoryExecutionContextStores,
  type IExecutionContextStores,
} from "../../../business/execution-context";
import type { ProviderId } from "../../shared/identifiers";
import { createBrandBrainPlatform } from "../../../business/brand-brain/factories/create-brand-brain-platform";
import { createLiveBusinessContextStores } from "../../../business/execution-context/live";
import { FailoverOrchestrator } from "../../providers/routing/performance/failover/failover-orchestrator";

export interface IntelligenceOsIntegrationPlatform {
  readonly engine: IIntelligenceOsIntegrationEngine;
}

export interface CreateIntelligenceOsIntegrationOptions {
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
  /** Defaults to ControllableDispatcher (no networking). Override for OpenAI leaf only. */
  readonly runtimeDispatcher?: IProviderDispatcher;
  /** Business entity stores for real execution context resolution. */
  readonly executionContextStores?: IExecutionContextStores;
  /**
   * When true (default if stores omitted), use Mongo + Brand Brain live context.
   * Tests should pass executionContextStores (fixtures) instead.
   */
  readonly useLiveBusinessContext?: boolean;
  readonly brandBrainRepository?: import("../../../infrastructure/durability/interfaces/brand-brain-repository").IBrandBrainRepository;
  /**
   * Limits model intelligence candidate models to safe executable providers.
   * Production LIVE uses this to prevent routing to catalogue-only providers.
   */
  readonly allowedModelProviderIds?: readonly ProviderId[];
  readonly toolRuntime?: import("../../providers/tools/composition/tool-runtime-platform").ToolRuntimePlatform;
}

export function createIntelligenceOsIntegrationPlatform(
  options: CreateIntelligenceOsIntegrationOptions = {}
): IntelligenceOsIntegrationPlatform {
  const createId = options.createId ?? ((p) => `${p}_${Date.now()}`);
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const clockMs = options.clockMs ?? (() => Date.now());
  const clocks = { createId, nowIso, clockMs };

  const task = createTaskIntelligencePlatform(clocks);
  const capability = createCapabilityIntelligencePlatform(clocks);
  const agent = createAgentPlanningPlatform(clocks);
  const workflow = createWorkflowIntelligencePlatform(clocks);
  const governance = createExecutionGovernancePlatform(clocks);
  const experienceIntel = createExperienceIntelligencePlatform(clocks);
  const injection = createExperienceInjectionPlatform({
    repository: experienceIntel.repository,
    ...clocks,
  });
  const execIntel = createExecutionIntelligencePlatform(clocks);
  const modelIntel = createModelIntelligencePlatform({
    ...clocks,
    allowedProviderIds: options.allowedModelProviderIds,
  });
  const { engine: negotiation } = setupNegotiation();
  const routingPlatform = createRoutingPlatform(clocks);
  const { engine: routing } = routingPlatform;
  const runtime = createProviderRuntime({
    dispatcher: options.runtimeDispatcher ?? new ControllableDispatcher({ nowIso }),
    nowIso,
    createId,
  });
  const consensus = createProviderConsensusPlatform(clocks);
  const evaluation = createIntelligenceEvaluationEngine();
  const learning = createLearningIntelligenceEngine();
  const optimization = createExecutionOptimizationPlatform(clocks);

  const brandBrain = createBrandBrainPlatform({
    ...clocks,
    repository: options.brandBrainRepository,
  }).engine;
  const useLive =
    options.useLiveBusinessContext === true ||
    (options.useLiveBusinessContext !== false &&
      options.executionContextStores === undefined &&
      process.env.ENTERPRISE_API_EXECUTION_MODE === "live");
  const stores =
    options.executionContextStores ??
    (useLive
      ? createLiveBusinessContextStores({ brandBrain, ...clocks })
      : new InMemoryExecutionContextStores());

  const executionContextResolver = createExecutionContextResolver({
    stores,
    brandBrain,
    useLiveBusinessContext: false,
    ...clocks,
  });

  const failoverOrchestrator = new FailoverOrchestrator({
    runtime,
    failover: routingPlatform.performance!.failoverConfig,
    nowIso,
    nowMs: clockMs,
    createId,
  });

  const bridges = createIntegrationBridges(
    {
      task: task.engine,
      capability: capability.engine,
      agent: agent.engine,
      workflow: workflow.engine,
      governance: governance.engine,
      injection: injection.engine,
      executionIntelligence: execIntel.engine,
      modelIntelligence: modelIntel.engine,
      negotiation,
      routing,
      runtime,
      consensus: consensus.engine,
      evaluation,
      learning,
      optimization: optimization.engine,
      experienceIntelligence: experienceIntel.engine,
      experienceRepository: experienceIntel.repository,
    },
    { ...clocks, executionContextResolver },
    {
      failover: {
        orchestrator: failoverOrchestrator,
        evidenceWriter: routingPlatform.performance?.evidenceWriter,
      },
      performanceStore: routingPlatform.performance?.store,
      toolRuntime: options.toolRuntime,
    }
  );

  const pipeline = new IntegrationPipeline({ bridges, ...clocks });
  const engine = new IntelligenceOsIntegrationEngine({ pipeline });
  return { engine };
}
