/**
 * Execution decomposer — heuristic placeholder.
 */

import { success, type Result } from "../../shared/result";
import type { ExecutionDecompositionPlan } from "../contracts/reasoning";
import type { ExecutionStrategy } from "../contracts/strategy";
import type { ExecutionIntelligenceRequest } from "../contracts/request";
import type { IExecutionDecomposer } from "../interfaces/execution-intelligence";

export class DefaultExecutionDecomposer implements IExecutionDecomposer {
  decompose(
    _request: ExecutionIntelligenceRequest,
    strategy: ExecutionStrategy
  ): Result<ExecutionDecompositionPlan> {
    const decomposable =
      strategy.kind === "plan_first" ||
      strategy.kind === "tree_of_thought" ||
      strategy.supportsParallelism;

    if (!decomposable) {
      return success({ enabled: false, steps: [], parallelism: 1 });
    }

    const steps =
      strategy.kind === "parallel_generation" ||
      strategy.kind === "consensus_generation"
        ? [
            {
              id: "step_1",
              order: 1,
              title: "Parallel candidate generation",
              description: "Generate multiple candidates concurrently",
            },
            {
              id: "step_2",
              order: 2,
              title: "Candidate aggregation",
              description: "Merge or select best candidate",
              dependsOn: ["step_1"],
            },
          ]
        : [
            {
              id: "step_1",
              order: 1,
              title: "Task analysis",
              description: "Break task into sub-problems",
            },
            {
              id: "step_2",
              order: 2,
              title: "Sub-task execution",
              description: "Execute sub-tasks in order",
              dependsOn: ["step_1"],
            },
            {
              id: "step_3",
              order: 3,
              title: "Synthesis",
              description: "Combine sub-task outputs",
              dependsOn: ["step_2"],
            },
          ];

    return success({
      enabled: true,
      steps,
      parallelism: strategy.supportsParallelism ? 3 : 1,
    });
  }
}
