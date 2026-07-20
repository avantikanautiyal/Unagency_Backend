/**
 * Simulation and optimization contracts.
 */

import type { WorkflowNodeId } from "./identifiers";
import type { WorkflowStageKind } from "./enums";

export interface SimulationStep {
  readonly step: number;
  readonly nodeId: WorkflowNodeId;
  readonly stage: WorkflowStageKind;
  readonly action: string;
  readonly waitingFor?: string;
  readonly estimatedMinutes: number;
}

export interface SimulationReport {
  readonly reportId: string;
  readonly executionOrder: readonly SimulationStep[];
  readonly stageOrder: readonly WorkflowStageKind[];
  readonly parallelGroupsResolved: number;
  readonly approvalWaitSteps: number;
  readonly rollbackPaths: readonly string[];
  readonly failurePaths: readonly string[];
  readonly recoveryPaths: readonly string[];
  readonly estimatedCompletionMinutes: number;
  readonly rationale: string;
}

export interface OptimizationSuggestion {
  readonly suggestionId: string;
  readonly category: string;
  readonly description: string;
  readonly impact: "low" | "medium" | "high";
}

export interface WorkflowOptimizationReport {
  readonly reportId: string;
  readonly suggestions: readonly OptimizationSuggestion[];
  readonly unnecessaryDependencies: number;
  readonly duplicateStages: number;
  readonly criticalPathMinutes: number;
  readonly rationale: string;
}

export interface WorkflowValidationReport {
  readonly reportId: string;
  readonly valid: boolean;
  readonly issues: readonly string[];
  readonly warnings: readonly string[];
}
