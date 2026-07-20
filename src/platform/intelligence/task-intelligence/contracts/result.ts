/**
 * Task Intelligence result contracts.
 */

import type { TaskIntelligenceResultId } from "./identifiers";
import type { TaskIntelligenceRequest } from "./request";
import type { IntentProfile } from "./intent";
import type { BusinessObjective } from "./business";
import type {
  DepartmentClassification,
  DomainClassification,
  TaskClassification,
} from "./classification";
import type { CapabilityMap } from "./capability";
import type { StructuredTask, TaskNode } from "./task";
import type { TaskGraph } from "./graph";
import type { DeliverablePlan } from "./deliverable";
import type { ComplexityProfile } from "./complexity";
import type { ExecutionConstraintProfile } from "./constraints";
import type { QualityRequirements } from "./quality";
import type { ReviewPlan } from "./review";
import type { StructuredTaskPlan, TaskExecutionPlan } from "./planning";
import type { TaskPlanExplanation } from "./explainability";

export interface TaskIntelligenceStatistics {
  readonly taskNodes: number;
  readonly dependencies: number;
  readonly capabilities: number;
  readonly stages: number;
  readonly durationMs: number;
}

export interface TaskIntelligenceReport {
  readonly resultId: TaskIntelligenceResultId;
  readonly request: TaskIntelligenceRequest;
  readonly businessObjective: BusinessObjective;
  readonly intentProfile: IntentProfile;
  readonly departmentClassification: DepartmentClassification;
  readonly domainClassification: DomainClassification;
  readonly taskClassification: TaskClassification;
  readonly structuredTask: StructuredTask;
  readonly taskGraph: TaskGraph;
  readonly capabilityMap: CapabilityMap;
  readonly deliverablePlan: DeliverablePlan;
  readonly complexityProfile: ComplexityProfile;
  readonly qualityRequirements: QualityRequirements;
  readonly executionConstraints: ExecutionConstraintProfile;
  readonly reviewPlan: ReviewPlan;
  readonly taskExecutionPlan: TaskExecutionPlan;
  readonly structuredTaskPlan: StructuredTaskPlan;
  readonly explanation: TaskPlanExplanation;
  readonly statistics: TaskIntelligenceStatistics;
  readonly createdAt: string;
}
