/**
 * Simulation, optimization, and validation engines.
 */

import { success, type Result } from "../../shared/result";
import type { ExecutionWorkflowGraph } from "../contracts/graph";
import type { WorkflowStage } from "../contracts/stages";
import type { WorkflowExecutionPlan } from "../contracts/plan";
import type {
  SimulationReport,
  SimulationStep,
  WorkflowOptimizationReport,
  WorkflowValidationReport,
} from "../contracts/simulation";
import type {
  IWorkflowSimulator,
  IWorkflowOptimizer,
  IWorkflowValidator,
  IWorkflowAnalyzer,
} from "../interfaces/workflow-intelligence";
import type { ExecutionTeamPlan } from "../../agent-planning/contracts/team-plan";

export class DefaultWorkflowAnalyzer implements IWorkflowAnalyzer {
  analyze(teamPlan: ExecutionTeamPlan): Result<{ name: string; nodeCount: number }> {
    return success({
      name: `${teamPlan.teamName} Workflow`,
      nodeCount: teamPlan.teamMembers.length,
    });
  }
}

export class DefaultWorkflowSimulator implements IWorkflowSimulator {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  simulate(graph: ExecutionWorkflowGraph, stages: readonly WorkflowStage[]): Result<SimulationReport> {
    const sorted = [...graph.nodes].sort((a, b) => a.stageOrder - b.stageOrder);
    let stepNum = 0;
    let totalMinutes = 0;

    const executionOrder: SimulationStep[] = sorted.map((n) => {
      const mins = 30;
      totalMinutes += mins;
      const waiting = n.blocking ? "approval_gate" : undefined;
      return {
        step: ++stepNum,
        nodeId: n.nodeId,
        stage: n.stage,
        action: `Simulate ${n.name}`,
        waitingFor: waiting,
        estimatedMinutes: mins,
      };
    });

    return success({
      reportId: this.createId("sim"),
      executionOrder,
      stageOrder: stages.map((s) => s.kind),
      parallelGroupsResolved: graph.parallelGroups.length,
      approvalWaitSteps: executionOrder.filter((s) => s.waitingFor).length,
      rollbackPaths: ["planning_stage_on_quality_failure"],
      failurePaths: ["retry_then_escalate"],
      recoveryPaths: ["resume_from_checkpoint"],
      estimatedCompletionMinutes: totalMinutes,
      rationale: "Dry-run simulation without AI execution",
    });
  }
}

export class DefaultWorkflowOptimizer implements IWorkflowOptimizer {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  optimize(graph: ExecutionWorkflowGraph, stages: readonly WorkflowStage[]): Result<WorkflowOptimizationReport> {
    const suggestions = [];

    if (graph.edges.length > graph.nodes.length) {
      suggestions.push({
        suggestionId: this.createId("opt"),
        category: "dependencies",
        description: "Some dependencies may be redundant — review hard vs soft edges",
        impact: "medium" as const,
      });
    }

    const parallelStages = stages.filter((s) => s.parallel);
    if (parallelStages.length === 0 && graph.nodes.length > 5) {
      suggestions.push({
        suggestionId: this.createId("opt2"),
        category: "parallelization",
        description: "Consider parallelizing generation stage nodes to reduce critical path",
        impact: "high" as const,
      });
    }

    const approvalCount = graph.nodes.filter((n) => n.kind === "approval_gate").length;
    if (approvalCount > 2) {
      suggestions.push({
        suggestionId: this.createId("opt3"),
        category: "approvals",
        description: "Multiple approval gates may create bottlenecks",
        impact: "medium" as const,
      });
    }

    const criticalPathMinutes = stages.reduce((s, st) => s + st.estimatedDurationMinutes, 0);

    return success({
      reportId: this.createId("optimization"),
      suggestions,
      unnecessaryDependencies: Math.max(0, graph.edges.length - graph.nodes.length),
      duplicateStages: 0,
      criticalPathMinutes,
      rationale: "Recommendations only — graph not modified",
    });
  }
}

export class DefaultWorkflowValidator implements IWorkflowValidator {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  validate(plan: WorkflowExecutionPlan): Result<WorkflowValidationReport> {
    const issues: string[] = [];
    const warnings: string[] = [];

    if (plan.graph.nodes.length === 0) issues.push("Workflow has no nodes");
    if (plan.graph.edges.length === 0 && plan.graph.nodes.length > 1) {
      warnings.push("Multi-node workflow has no edges");
    }
    if (!plan.approvalPlan.gates.length) warnings.push("No approval gates defined");

    return success({
      reportId: this.createId("validation"),
      valid: issues.length === 0,
      issues,
      warnings,
    });
  }
}
