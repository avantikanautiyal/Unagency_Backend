/**
 * Task Intelligence platform factory.
 */

import { DefaultBusinessGoalDetector } from "../classification/default-business-goal-detector";
import {
  DefaultDepartmentClassifier,
  DefaultDomainClassifier,
  DefaultTaskClassifier,
} from "../classification/default-classifiers";
import { DefaultCapabilityClassifier } from "../capability-mapping/default-capability-classifier";
import { DefaultComplexityEngine } from "../complexity/default-complexity-engine";
import { DefaultConstraintAnalyzer } from "../constraints/default-constraint-analyzer";
import { DefaultTaskDecomposer } from "../decomposition/default-task-decomposer";
import { DefaultDeliverablePlanner } from "../deliverables/default-deliverable-planner";
import { DefaultDependencyAnalyzer } from "../dependency-analysis/default-dependency-analyzer";
import { TaskIntelligenceEngine } from "../engine/task-intelligence-engine";
import { DefaultIntentAnalyzer } from "../intent/default-intent-analyzer";
import { DefaultQualityInferencer } from "../quality/default-quality-inferencer";
import {
  DefaultPlaybookMatcher,
  InMemoryPlaybookRepository,
} from "../repositories/in-memory-playbook-repository";
import { DefaultReviewPlanner } from "../review/default-review-planner";
import { DefaultWorkflowPlanner } from "../workflow-planning/default-workflow-planner";
import type { ITaskIntelligenceEngine } from "../interfaces/task-intelligence";

export interface TaskIntelligencePlatform {
  readonly engine: ITaskIntelligenceEngine;
}

export interface CreateTaskIntelligencePlatformOptions {
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export function createTaskIntelligencePlatform(
  options: CreateTaskIntelligencePlatformOptions = {}
): TaskIntelligencePlatform {
  const createId = options.createId ?? ((p) => `${p}_${Date.now()}`);
  const nowIso = options.nowIso ?? (() => new Date().toISOString());

  const playbookRepo = new InMemoryPlaybookRepository();
  const playbookMatcher = new DefaultPlaybookMatcher(playbookRepo);

  const engine = new TaskIntelligenceEngine({
    intent: new DefaultIntentAnalyzer(),
    business: new DefaultBusinessGoalDetector(createId),
    department: new DefaultDepartmentClassifier(),
    domain: new DefaultDomainClassifier(),
    taskClassifier: new DefaultTaskClassifier(),
    capability: new DefaultCapabilityClassifier(),
    decomposer: new DefaultTaskDecomposer(createId),
    dependency: new DefaultDependencyAnalyzer(createId),
    deliverables: new DefaultDeliverablePlanner(createId),
    complexity: new DefaultComplexityEngine(),
    constraints: new DefaultConstraintAnalyzer(),
    quality: new DefaultQualityInferencer(),
    review: new DefaultReviewPlanner(createId),
    workflow: new DefaultWorkflowPlanner(createId, nowIso),
    playbookMatcher,
    nowIso: options.nowIso,
    clockMs: options.clockMs,
    createId: options.createId,
  });

  return { engine };
}
