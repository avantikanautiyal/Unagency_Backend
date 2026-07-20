/**
 * Agent Planning platform factory.
 */

import { DefaultRoleAssignmentEngine, DefaultSpecializationMatcher } from "../assignment/default-role-assignment-engine";
import {
  DefaultAgentGraphBuilder,
  DefaultDependencyPlanner,
  DefaultParallelizationPlanner,
} from "../collaboration/default-agent-graph-builder";
import {
  DefaultCoordinationPlanner,
  DefaultCommunicationPlanner,
  DefaultReviewHierarchyPlanner,
  DefaultMergeStrategyPlanner,
} from "../coordination/default-coordination-planner";
import { DefaultDelegationPlanner } from "../delegation/default-delegation-planner";
import { DefaultEscalationPlanner } from "../escalation/default-escalation-planner";
import { AgentPlanningEngine } from "../engine/agent-planning-engine";
import { DefaultAgentRequirementAnalyzer } from "../planner/default-requirement-analyzer";
import { DefaultExecutionTeamPlanner, DefaultTeamRecommender } from "../planner/default-execution-team-planner";
import { InMemoryAgentRegistry } from "../registry/in-memory-agent-registry";
import { InMemoryTeamPlaybookRepository } from "../repositories/in-memory-team-playbook-repository";
import type { IAgentPlanningEngine } from "../interfaces/agent-planning";

export interface AgentPlanningPlatform {
  readonly engine: IAgentPlanningEngine;
}

export interface CreateAgentPlanningPlatformOptions {
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export function createAgentPlanningPlatform(
  options: CreateAgentPlanningPlatformOptions = {}
): AgentPlanningPlatform {
  const createId = options.createId ?? ((p) => `${p}_${Date.now()}`);
  const nowIso = options.nowIso ?? (() => new Date().toISOString());

  const registry = new InMemoryAgentRegistry();
  const playbookRepo = new InMemoryTeamPlaybookRepository();

  const engine = new AgentPlanningEngine({
    registry,
    requirementAnalyzer: new DefaultAgentRequirementAnalyzer(),
    assignment: new DefaultRoleAssignmentEngine(new DefaultSpecializationMatcher(), createId),
    graphBuilder: new DefaultAgentGraphBuilder(createId),
    parallelization: new DefaultParallelizationPlanner(),
    coordination: new DefaultCoordinationPlanner(createId),
    communication: new DefaultCommunicationPlanner(createId),
    review: new DefaultReviewHierarchyPlanner(createId),
    merge: new DefaultMergeStrategyPlanner(createId),
    delegation: new DefaultDelegationPlanner(createId),
    escalation: new DefaultEscalationPlanner(createId),
    teamPlanner: new DefaultExecutionTeamPlanner(createId, nowIso),
    teamRecommender: new DefaultTeamRecommender(createId),
    playbookRepo,
    nowIso: options.nowIso,
    clockMs: options.clockMs,
    createId: options.createId,
  });

  return { engine };
}
