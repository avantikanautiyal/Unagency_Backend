/**
 * Intelligence OS Integration factory.
 * Wires existing public platforms through bridges — does not merge modules.
 *
 * Phase 0: production negotiation uses real CapabilityRegistry (never FakeCapabilityRegistry).
 * ControllableDispatcher is permitted only when explicitly allowed (simulated/test).
 */

import { createTaskIntelligencePlatform } from "../../task-intelligence";
import { createCapabilityIntelligencePlatform } from "../../capability-intelligence";
import { createAgentPlanningPlatform } from "../../agent-planning";
import { createWorkflowIntelligencePlatform } from "../../workflow-intelligence";
import { createExecutionGovernancePlatform } from "../../execution-governance";
import { createExperienceIntelligencePlatform } from "../../experience-intelligence";
import { createExperienceInjectionPlatform } from "../../experience-injection";
import { createMemoryIntelligenceEngine } from "../../memory/factories/create-memory-engine";
import type { IMemoryStore } from "../../memory/interfaces/memory-ports";
import { MongoMemoryStore } from "../../../infrastructure/durability/repositories/mongo-memory-store";
import { createExecutionIntelligencePlatform } from "../../execution-intelligence";
import { MongoExperienceRepository } from "../../experience-intelligence/experience-repository/mongo-experience-repository";
import { createModelIntelligencePlatform } from "../../model-intelligence";
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
import {
  assertProductionComposition,
  createProductionNegotiationPlatform,
  isControllableDispatcher,
} from "../../../os";

export interface IntelligenceOsIntegrationPlatform {
  readonly engine: IIntelligenceOsIntegrationEngine;
  readonly negotiationSource: "production";
  readonly capabilityRegistry: unknown;
}

export interface CreateIntelligenceOsIntegrationOptions {
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
  /**
   * Provider leaf dispatcher.
   * LIVE: required (no ControllableDispatcher).
   * SIMULATED/test: ControllableDispatcher allowed when allowSimulatedDispatcher !== false.
   */
  readonly runtimeDispatcher?: IProviderDispatcher;
  /** When true (default for non-live), ControllableDispatcher may be used if dispatcher omitted. */
  readonly allowSimulatedDispatcher?: boolean;
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
  /** Authoritative mode for composition assertions. */
  readonly executionMode?: "stub" | "simulated" | "live";
  /**
   * PromptCompiler — when provided, enriches every prompt with brand context,
   * system instructions, and structured template variables before dispatch.
   */
  readonly promptCompiler?: import("../../prompt-compiler/interfaces/prompt-ports").IPromptCompiler;
  /** Override memory store (tests). LIVE defaults to MongoMemoryStore. */
  readonly memoryStore?: IMemoryStore;
}

export function createIntelligenceOsIntegrationPlatform(
  options: CreateIntelligenceOsIntegrationOptions = {}
): IntelligenceOsIntegrationPlatform {
  const createId = options.createId ?? ((p) => `${p}_${Date.now()}`);
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const clockMs = options.clockMs ?? (() => Date.now());
  const clocks = { createId, nowIso, clockMs };

  // Prefer explicit options. Do NOT inherit LIVE from process.env here — that
  // would break simulated/unit composition whenever a developer .env is live.
  // LIVE boot paths must pass executionMode: "live" + runtimeDispatcher.
  const executionMode = options.executionMode ?? "simulated";

  const allowSimulated =
    options.allowSimulatedDispatcher !== false && executionMode !== "live";

  let runtimeDispatcher = options.runtimeDispatcher;
  if (!runtimeDispatcher) {
    if (executionMode === "live" || !allowSimulated) {
      throw new Error(
        "Integration OS requires runtimeDispatcher for LIVE (or when simulated dispatcher is disallowed). ControllableDispatcher will not be silently used."
      );
    }
    runtimeDispatcher = new ControllableDispatcher({ nowIso });
  }

  const productionNegotiation = createProductionNegotiationPlatform({
    nowIso,
    createId,
  });

  assertProductionComposition({
    executionMode: executionMode === "stub" ? "simulated" : executionMode,
    runtimeDispatcher,
    capabilityRegistry: productionNegotiation.capabilityRegistry,
    negotiationSource: "production",
    allowSimulatedDispatcher: allowSimulated,
  });

  if (executionMode === "live" && isControllableDispatcher(runtimeDispatcher)) {
    throw new Error(
      "LIVE Integration OS forbids ControllableDispatcher — inject a real provider dispatcher"
    );
  }

  const task = createTaskIntelligencePlatform(clocks);
  const capability = createCapabilityIntelligencePlatform(clocks);
  const agent = createAgentPlanningPlatform(clocks);
  const workflow = createWorkflowIntelligencePlatform(clocks);
  const governance = createExecutionGovernancePlatform(clocks);
  const experienceRepository =
    executionMode === "live"
      ? new MongoExperienceRepository({ nowIso: nowIso, createId })
      : undefined;

  const experienceIntel = createExperienceIntelligencePlatform({
    ...clocks,
    repository: experienceRepository,
  });
  const memoryStore =
    options.memoryStore ??
    (executionMode === "live" ? new MongoMemoryStore() : undefined);
  const memoryEngine = createMemoryIntelligenceEngine(
    memoryStore ? { store: memoryStore } : {}
  );
  const injection = createExperienceInjectionPlatform({
    repository: experienceIntel.repository,
    ...clocks,
  });
  const execIntel = createExecutionIntelligencePlatform(clocks);
  const modelIntel = createModelIntelligencePlatform({
    ...clocks,
    allowedProviderIds: options.allowedModelProviderIds,
  });
  const negotiation = productionNegotiation.engine;
  const routingPlatform = createRoutingPlatform(clocks);
  const { engine: routing } = routingPlatform;
  const runtime = createProviderRuntime({
    dispatcher: runtimeDispatcher,
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
      ensureCapabilityFromTask: productionNegotiation.ensureCapabilityFromTask,
      promptCompiler: options.promptCompiler,
      memoryEngine,
      indexExecutionKnowledge: executionMode === "live",
    }
  );

  const pipeline = new IntegrationPipeline({ bridges, ...clocks });
  const engine = new IntelligenceOsIntegrationEngine({ pipeline });
  return {
    engine,
    negotiationSource: "production",
    capabilityRegistry: productionNegotiation.capabilityRegistry,
  };
}
