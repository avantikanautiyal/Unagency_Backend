/**
 * Task Intelligence Engine — entry point of the Intelligence OS.
 */

import { failure, success, type Result } from "../../shared/result";
import { ValidationError } from "../../shared/errors";
import { asTaskIntelligenceResultId, asTaskNodeId } from "../contracts/identifiers";
import type { TaskIntelligenceRequest } from "../contracts/request";
import type { TaskIntelligenceReport } from "../contracts/result";
import type { StructuredTask } from "../contracts/task";
import type { TaskGraph } from "../contracts/graph";
import type { TaskPlanExplanation } from "../contracts/explainability";
import type {
  IBusinessGoalDetector,
  ICapabilityClassifier,
  IComplexityEngine,
  IConstraintAnalyzer,
  IDependencyAnalyzer,
  IDeliverablePlanner,
  IDepartmentClassifier,
  IDomainClassifier,
  IIntentAnalyzer,
  IPlaybookMatcher,
  IQualityInferencer,
  IReviewPlanner,
  ITaskClassifier,
  ITaskDecomposer,
  ITaskIntelligenceEngine,
  IWorkflowPlanner,
} from "../interfaces/task-intelligence";

export interface TaskIntelligenceEngineDeps {
  readonly intent: IIntentAnalyzer;
  readonly business: IBusinessGoalDetector;
  readonly department: IDepartmentClassifier;
  readonly domain: IDomainClassifier;
  readonly taskClassifier: ITaskClassifier;
  readonly capability: ICapabilityClassifier;
  readonly decomposer: ITaskDecomposer;
  readonly dependency: IDependencyAnalyzer;
  readonly deliverables: IDeliverablePlanner;
  readonly complexity: IComplexityEngine;
  readonly constraints: IConstraintAnalyzer;
  readonly quality: IQualityInferencer;
  readonly review: IReviewPlanner;
  readonly workflow: IWorkflowPlanner;
  readonly playbookMatcher: IPlaybookMatcher;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export class TaskIntelligenceEngine implements ITaskIntelligenceEngine {
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;
  private readonly createId: (prefix: string) => string;

  constructor(private readonly deps: TaskIntelligenceEngineDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
    this.createId = deps.createId ?? ((p) => `${p}_${Math.random().toString(36).slice(2)}`);
  }

  async analyze(request: TaskIntelligenceRequest): Promise<Result<TaskIntelligenceReport>> {
    const start = this.clockMs();
    const invalid = this.validate(request);
    if (invalid) return failure(invalid);

    const intent = this.deps.intent.analyze(request.rawPrompt);
    if (!intent.ok) return intent;

    const business = this.deps.business.detect(request.rawPrompt, intent.value);
    if (!business.ok) return business;

    const department = this.deps.department.classify(request.rawPrompt, intent.value);
    if (!department.ok) return department;

    const domain = this.deps.domain.classify(request.rawPrompt, business.value);
    if (!domain.ok) return domain;

    const taskClass = this.deps.taskClassifier.classify(request.rawPrompt, department.value);
    if (!taskClass.ok) return taskClass;

    const capabilityMap = this.deps.capability.classify(
      request.rawPrompt,
      department.value,
      taskClass.value
    );
    if (!capabilityMap.ok) return capabilityMap;

    const playbookMatch = this.deps.playbookMatcher.match(request);
    const playbook = playbookMatch.ok ? playbookMatch.value : undefined;

    const nodes = this.deps.decomposer.decompose(
      request.rawPrompt,
      capabilityMap.value,
      playbook
    );
    if (!nodes.ok) return nodes;

    const dependencyGraph = this.deps.dependency.analyze(nodes.value);
    if (!dependencyGraph.ok) return dependencyGraph;

    const deliverablePlan = this.deps.deliverables.plan(request.rawPrompt, nodes.value);
    if (!deliverablePlan.ok) return deliverablePlan;

    const complexityProfile = this.deps.complexity.analyze(request.rawPrompt, nodes.value);
    if (!complexityProfile.ok) return complexityProfile;

    const executionConstraints = this.deps.constraints.analyze(request, nodes.value);
    if (!executionConstraints.ok) return executionConstraints;

    const qualityRequirements = this.deps.quality.infer(request.rawPrompt, department.value);
    if (!qualityRequirements.ok) return qualityRequirements;

    const reviewPlan = this.deps.review.plan(nodes.value, qualityRequirements.value);
    if (!reviewPlan.ok) return reviewPlan;

    const workflow = this.deps.workflow.plan(
      nodes.value,
      dependencyGraph.value,
      capabilityMap.value,
      deliverablePlan.value,
      executionConstraints.value,
      reviewPlan.value,
      complexityProfile.value
    );
    if (!workflow.ok) return workflow;

    const taskGraph: TaskGraph = workflow.value.structuredTaskPlan.taskGraph;
    const structuredTask = buildStructuredTask(nodes.value[0], this.createId);

    const explanation = buildExplanation(
      department.value,
      capabilityMap.value,
      nodes.value,
      dependencyGraph.value,
      reviewPlan.value,
      qualityRequirements.value,
      playbook?.name
    );

    const durationMs = this.clockMs() - start;

    return success({
      resultId: asTaskIntelligenceResultId(this.createId("ti")),
      request,
      businessObjective: business.value,
      intentProfile: intent.value,
      departmentClassification: department.value,
      domainClassification: domain.value,
      taskClassification: taskClass.value,
      structuredTask,
      taskGraph,
      capabilityMap: capabilityMap.value,
      deliverablePlan: deliverablePlan.value,
      complexityProfile: complexityProfile.value,
      qualityRequirements: qualityRequirements.value,
      executionConstraints: executionConstraints.value,
      reviewPlan: reviewPlan.value,
      taskExecutionPlan: workflow.value.taskExecutionPlan,
      structuredTaskPlan: workflow.value.structuredTaskPlan,
      explanation,
      statistics: {
        taskNodes: nodes.value.length,
        dependencies: dependencyGraph.value.edges.length,
        capabilities: capabilityMap.value.requirements.length,
        stages: workflow.value.structuredTaskPlan.executionStages.length,
        durationMs,
      },
      createdAt: this.nowIso(),
    });
  }

  async explain(request: TaskIntelligenceRequest): Promise<Result<TaskPlanExplanation>> {
    const result = await this.analyze(request);
    if (!result.ok) return result;
    return success(result.value.explanation);
  }

  private validate(request: TaskIntelligenceRequest): ValidationError | null {
    if (!request.requestId?.trim()) return new ValidationError("requestId required");
    if (!request.rawPrompt?.trim()) return new ValidationError("rawPrompt required");
    return null;
  }
}

function buildStructuredTask(
  root: import("../contracts/task").TaskNode | undefined,
  createId: (p: string) => string
): StructuredTask {
  const node = root ?? {
    nodeId: asTaskNodeId(createId("root")),
    title: "Root Task",
    description: "Primary task",
    taskType: "strategic" as const,
    nodeKind: "task" as const,
    capabilityId: "marketing.social.carousel" as never,
    complexity: "moderate" as const,
    priority: "high" as const,
    stage: 1,
    dependsOn: [],
    deliverableIds: [],
    requiresReview: false,
    optional: false,
  };
  return {
    taskId: node.nodeId,
    title: node.title,
    description: node.description,
    taskType: node.taskType,
    nodeKind: node.nodeKind,
    capabilityId: node.capabilityId,
    complexity: node.complexity,
    priority: node.priority,
    estimatedDurationMinutes: 60,
    requiresReview: node.requiresReview,
  };
}

function buildExplanation(
  department: import("../contracts/classification").DepartmentClassification,
  capabilityMap: import("../contracts/capability").CapabilityMap,
  nodes: readonly import("../contracts/task").TaskNode[],
  graph: import("../contracts/graph").DependencyGraph,
  reviewPlan: import("../contracts/review").ReviewPlan,
  quality: import("../contracts/quality").QualityRequirements,
  playbookName?: string
): TaskPlanExplanation {
  return {
    classificationRationale: `Classified as ${department.primary} with ${department.confidence} confidence`,
    capabilityRationale: capabilityMap.rationale,
    decompositionRationale: playbookName
      ? `Expanded via playbook "${playbookName}" into ${nodes.length} task nodes`
      : `Decomposed into ${nodes.length} tasks from capability requirements`,
    dependencyRationale: `${graph.edges.length} dependencies: ${graph.parallelGroups.length} parallel groups, ${graph.gateNodes.length} review gates`,
    reviewRationale: reviewPlan.rationale,
    qualityRationale: quality.rationale,
    playbookApplied: playbookName,
  };
}
