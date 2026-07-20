/**
 * Intelligence Control Plane factory.
 */

import { createTaskIntelligencePlatform } from "../../task-intelligence";
import { createAgentPlanningPlatform } from "../../agent-planning";
import { createWorkflowIntelligencePlatform } from "../../workflow-intelligence";
import { createExecutionGovernancePlatform } from "../../execution-governance";
import { createExecutionIntelligencePlatform } from "../../execution-intelligence";
import { createModelIntelligencePlatform } from "../../model-intelligence";
import { setupNegotiation } from "../../providers/negotiation/testing";
import { createRoutingPlatform } from "../../providers/routing";
import { IntelligenceControlPlaneEngine } from "../engine/control-plane-engine";
import { PipelineOrchestrator } from "../pipeline/pipeline-orchestrator";
import { DefaultPipelineValidator } from "../validation/pipeline-validator";
import { DefaultPipelineSimulator } from "../simulation/pipeline-simulator";
import type { IIntelligenceControlPlaneEngine } from "../interfaces/control-plane";

export interface IntelligenceControlPlanePlatform {
  readonly engine: IIntelligenceControlPlaneEngine;
}

export interface CreateIntelligenceControlPlaneOptions {
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export function createIntelligenceControlPlane(
  options: CreateIntelligenceControlPlaneOptions = {}
): IntelligenceControlPlanePlatform {
  const createId = options.createId ?? ((p) => `${p}_${Date.now()}`);
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const clockMs = options.clockMs ?? (() => Date.now());

  const task = createTaskIntelligencePlatform({ createId, nowIso, clockMs });
  const agent = createAgentPlanningPlatform({ createId, nowIso, clockMs });
  const workflow = createWorkflowIntelligencePlatform({ createId, nowIso, clockMs });
  const governance = createExecutionGovernancePlatform({ createId, nowIso, clockMs });
  const execIntel = createExecutionIntelligencePlatform({ createId, nowIso, clockMs });
  const modelIntel = createModelIntelligencePlatform({ createId, nowIso, clockMs });
  const { engine: negotiation } = setupNegotiation();
  const { engine: routing } = createRoutingPlatform({ createId, nowIso, clockMs });

  const orchestrator = new PipelineOrchestrator({
    taskIntelligence: task.engine,
    agentPlanning: agent.engine,
    workflowIntelligence: workflow.engine,
    executionGovernance: governance.engine,
    executionIntelligence: execIntel.engine,
    modelIntelligence: modelIntel.engine,
    negotiation,
    routing,
    nowIso,
    clockMs,
    createId,
  });

  const engine = new IntelligenceControlPlaneEngine({
    orchestrator,
    validator: new DefaultPipelineValidator(createId),
    simulator: new DefaultPipelineSimulator(createId),
    nowIso,
    createId,
  });

  return { engine };
}
