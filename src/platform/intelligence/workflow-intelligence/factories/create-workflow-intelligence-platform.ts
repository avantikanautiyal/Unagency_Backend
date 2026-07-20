/**
 * Workflow Intelligence platform factory.
 */

import { DefaultApprovalPlanner, DefaultCheckpointPlanner } from "../approvals/default-approval-planner";
import { DefaultExecutionGraphBuilder } from "../graph/default-execution-graph-builder";
import {
  DefaultStageBuilder,
  DefaultDependencyPlanner,
  DefaultParallelizationPlanner,
  DefaultConditionalBranchPlanner,
} from "../stages/default-stage-builder";
import {
  DefaultRollbackPlanner,
  DefaultFailureRecoveryPlanner,
  DefaultResumePlanner,
} from "../recovery/default-recovery-planner";
import {
  DefaultWorkflowSimulator,
  DefaultWorkflowOptimizer,
  DefaultWorkflowValidator,
  DefaultWorkflowAnalyzer,
} from "../simulation/default-workflow-simulator";
import { DefaultWorkflowExecutionPlanner } from "../workflow/default-workflow-execution-planner";
import { WorkflowIntelligenceEngine } from "../engine/workflow-intelligence-engine";
import type { IWorkflowIntelligenceEngine } from "../interfaces/workflow-intelligence";

export interface WorkflowIntelligencePlatform {
  readonly engine: IWorkflowIntelligenceEngine;
}

export interface CreateWorkflowIntelligencePlatformOptions {
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export function createWorkflowIntelligencePlatform(
  options: CreateWorkflowIntelligencePlatformOptions = {}
): WorkflowIntelligencePlatform {
  const createId = options.createId ?? ((p) => `${p}_${Date.now()}`);
  const nowIso = options.nowIso ?? (() => new Date().toISOString());

  const engine = new WorkflowIntelligenceEngine({
    analyzer: new DefaultWorkflowAnalyzer(),
    graphBuilder: new DefaultExecutionGraphBuilder(createId),
    stageBuilder: new DefaultStageBuilder(createId),
    dependency: new DefaultDependencyPlanner(),
    parallelization: new DefaultParallelizationPlanner(),
    conditional: new DefaultConditionalBranchPlanner(),
    approval: new DefaultApprovalPlanner(createId),
    checkpoints: new DefaultCheckpointPlanner(createId),
    rollback: new DefaultRollbackPlanner(createId),
    recovery: new DefaultFailureRecoveryPlanner(createId),
    resume: new DefaultResumePlanner(createId),
    simulator: new DefaultWorkflowSimulator(createId),
    optimizer: new DefaultWorkflowOptimizer(createId),
    validator: new DefaultWorkflowValidator(createId),
    executionPlanner: new DefaultWorkflowExecutionPlanner(createId, nowIso),
    nowIso: options.nowIso,
    clockMs: options.clockMs,
    createId: options.createId,
  });

  return { engine };
}
