/**
 * Structured task contracts.
 */

import type { CapabilityId } from "../../shared/identifiers";
import type { TaskNodeId } from "./identifiers";
import type { ComplexityTier, PriorityLevel, TaskNodeKind, TaskTypeKind } from "./enums";

export interface StructuredTask {
  readonly taskId: TaskNodeId;
  readonly title: string;
  readonly description: string;
  readonly taskType: TaskTypeKind;
  readonly nodeKind: TaskNodeKind;
  readonly capabilityId: CapabilityId;
  readonly complexity: ComplexityTier;
  readonly priority: PriorityLevel;
  readonly estimatedDurationMinutes: number;
  readonly requiresReview: boolean;
}

export interface TaskNode {
  readonly nodeId: TaskNodeId;
  readonly title: string;
  readonly description: string;
  readonly taskType: TaskTypeKind;
  readonly nodeKind: TaskNodeKind;
  readonly capabilityId: CapabilityId;
  readonly complexity: ComplexityTier;
  readonly priority: PriorityLevel;
  readonly stage: number;
  readonly parallelGroup?: string;
  readonly dependsOn: readonly TaskNodeId[];
  readonly deliverableIds: readonly string[];
  readonly requiresReview: boolean;
  readonly optional: boolean;
}
