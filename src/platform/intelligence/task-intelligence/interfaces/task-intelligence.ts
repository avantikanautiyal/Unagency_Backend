/**
 * Task Intelligence public interfaces.
 */

import type { Result } from "../../shared/result";
import type { TaskIntelligenceRequest } from "../contracts/request";
import type { IntentProfile } from "../contracts/intent";
import type { BusinessObjective } from "../contracts/business";
import type {
  DepartmentClassification,
  DomainClassification,
  TaskClassification,
} from "../contracts/classification";
import type { CapabilityMap } from "../contracts/capability";
import type { TaskNode } from "../contracts/task";
import type { TaskGraph, DependencyGraph } from "../contracts/graph";
import type { DeliverablePlan } from "../contracts/deliverable";
import type { ComplexityProfile } from "../contracts/complexity";
import type { ExecutionConstraintProfile } from "../contracts/constraints";
import type { QualityRequirements } from "../contracts/quality";
import type { ReviewPlan } from "../contracts/review";
import type { StructuredTaskPlan, TaskExecutionPlan } from "../contracts/planning";
import type { TaskIntelligenceReport } from "../contracts/result";
import type { ClientPlaybook } from "../contracts/playbook";
import type { TaskPlanExplanation } from "../contracts/explainability";

export interface ITaskIntelligenceEngine {
  analyze(request: TaskIntelligenceRequest): Promise<Result<TaskIntelligenceReport>>;
  explain(request: TaskIntelligenceRequest): Promise<Result<TaskPlanExplanation>>;
}

export interface IIntentAnalyzer {
  analyze(prompt: string): Result<IntentProfile>;
}

export interface IBusinessGoalDetector {
  detect(prompt: string, intent: IntentProfile): Result<BusinessObjective>;
}

export interface IDepartmentClassifier {
  classify(prompt: string, intent: IntentProfile): Result<DepartmentClassification>;
}

export interface IDomainClassifier {
  classify(prompt: string, business: BusinessObjective): Result<DomainClassification>;
}

export interface ITaskClassifier {
  classify(prompt: string, department: DepartmentClassification): Result<TaskClassification>;
}

export interface ICapabilityClassifier {
  classify(
    prompt: string,
    department: DepartmentClassification,
    task: TaskClassification
  ): Result<CapabilityMap>;
}

export interface ITaskDecomposer {
  decompose(
    prompt: string,
    capabilityMap: CapabilityMap,
    playbook?: ClientPlaybook
  ): Result<readonly TaskNode[]>;
}

export interface IDependencyAnalyzer {
  analyze(nodes: readonly TaskNode[]): Result<DependencyGraph>;
}

export interface IDeliverablePlanner {
  plan(prompt: string, nodes: readonly TaskNode[]): Result<DeliverablePlan>;
}

export interface IComplexityEngine {
  analyze(prompt: string, nodes: readonly TaskNode[]): Result<ComplexityProfile>;
}

export interface IConstraintAnalyzer {
  analyze(request: TaskIntelligenceRequest, nodes: readonly TaskNode[]): Result<ExecutionConstraintProfile>;
}

export interface IQualityInferencer {
  infer(prompt: string, department: DepartmentClassification): Result<QualityRequirements>;
}

export interface IReviewPlanner {
  plan(nodes: readonly TaskNode[], quality: QualityRequirements): Result<ReviewPlan>;
}

export interface IWorkflowPlanner {
  plan(
    nodes: readonly TaskNode[],
    dependencyGraph: DependencyGraph,
    capabilityMap: CapabilityMap,
    deliverablePlan: DeliverablePlan,
    constraints: ExecutionConstraintProfile,
    reviewPlan: ReviewPlan,
    complexity: ComplexityProfile
  ): Result<{ structuredTaskPlan: StructuredTaskPlan; taskExecutionPlan: TaskExecutionPlan }>;
}

export interface IPlaybookRepository {
  list(): Result<readonly ClientPlaybook[]>;
  get(playbookId: string): Result<ClientPlaybook>;
  match(prompt: string, industryHint?: string): Result<ClientPlaybook | undefined>;
}

export interface IPlaybookMatcher {
  match(request: TaskIntelligenceRequest): Result<ClientPlaybook | undefined>;
}
