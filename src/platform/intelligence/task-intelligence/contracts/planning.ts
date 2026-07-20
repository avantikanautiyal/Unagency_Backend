/**
 * Workflow and execution planning contracts.
 */

import type { CapabilityId } from "../../shared/identifiers";
import type { TaskNodeId } from "./identifiers";
import type { ComplexityTier } from "./enums";
import type { CapabilityMap } from "./capability";
import type { DeliverablePlan } from "./deliverable";
import type { DependencyGraph, TaskGraph } from "./graph";
import type { ExecutionConstraintProfile } from "./constraints";
import type { ReviewPlan } from "./review";
import type { TaskNode } from "./task";

export interface ExecutionStage {
  readonly stage: number;
  readonly name: string;
  readonly nodeIds: readonly TaskNodeId[];
  readonly parallel: boolean;
}

export interface TaskExecutionPlan {
  readonly planId: string;
  readonly orderedTasks: readonly TaskNode[];
  readonly parallelGroups: readonly (readonly TaskNodeId[])[];
  readonly dependencies: DependencyGraph;
  readonly stages: readonly ExecutionStage[];
  readonly expectedDeliverables: readonly string[];
  readonly estimatedComplexity: ComplexityTier;
  readonly estimatedDurationMinutes: number;
  readonly requiredCapabilities: readonly CapabilityId[];
  readonly reviewCheckpoints: readonly string[];
  readonly rationale: string;
}

export interface StructuredTaskPlan {
  readonly planId: string;
  readonly taskGraph: TaskGraph;
  readonly executionStages: readonly ExecutionStage[];
  readonly capabilityRequirements: CapabilityMap;
  readonly dependencyGraph: DependencyGraph;
  readonly deliverablePlan: DeliverablePlan;
  readonly executionConstraints: ExecutionConstraintProfile;
  readonly reviewPlan: ReviewPlan;
  readonly taskExecutionPlan: TaskExecutionPlan;
  readonly version: string;
  readonly createdAt: string;
}
