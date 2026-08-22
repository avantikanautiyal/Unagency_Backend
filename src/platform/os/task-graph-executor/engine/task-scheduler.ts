/**
 * Deterministic DAG scheduler — which tasks are runnable now.
 */

import type { ExecutionPlan } from "../../execution-intelligence/contracts/execution-plan";
import type { TaskNodeState } from "../contracts/task-graph-state";

export function predecessorsOf(
  plan: ExecutionPlan,
  taskId: string
): readonly string[] {
  const task = plan.tasks.find((t) => t.taskId === taskId);
  return task?.dependencies ?? [];
}

export function successorsOf(
  plan: ExecutionPlan,
  taskId: string
): readonly string[] {
  return plan.tasks
    .filter((t) => t.dependencies.includes(taskId))
    .map((t) => t.taskId);
}

/**
 * A task is runnable when all predecessors SUCCEEDED and it is PENDING/READY/RETRYING.
 */
export function selectRunnableTaskIds(
  plan: ExecutionPlan,
  nodes: ReadonlyMap<string, TaskNodeState>,
  options: {
    readonly cancelRequested: boolean;
    readonly terminalStatuses?: ReadonlySet<string>;
  }
): readonly string[] {
  if (options.cancelRequested) return [];

  const runnable: string[] = [];
  for (const task of plan.tasks) {
    const node = nodes.get(task.taskId);
    if (!node) continue;
    if (
      node.status !== "PENDING" &&
      node.status !== "READY" &&
      node.status !== "RETRYING"
    ) {
      continue;
    }

    const preds = predecessorsOf(plan, task.taskId);
    const allSucceeded = preds.every(
      (pid) => nodes.get(pid)?.status === "SUCCEEDED"
    );
    if (!allSucceeded) continue;

    const anyFailed = preds.some((pid) => {
      const s = nodes.get(pid)?.status;
      return s === "FAILED" || s === "BLOCKED" || s === "CANCELLED" || s === "SKIPPED";
    });
    if (anyFailed) continue;

    runnable.push(task.taskId);
  }
  return runnable;
}

/**
 * Tasks that should be blocked because a hard predecessor failed terminally.
 */
export function selectBlockedByDependency(
  plan: ExecutionPlan,
  nodes: ReadonlyMap<string, TaskNodeState>
): readonly { readonly taskId: string; readonly blockedBy: readonly string[] }[] {
  const out: { taskId: string; blockedBy: string[] }[] = [];
  for (const task of plan.tasks) {
    const node = nodes.get(task.taskId);
    if (!node) continue;
    if (
      node.status === "SUCCEEDED" ||
      node.status === "RUNNING" ||
      node.status === "BLOCKED" ||
      node.status === "SKIPPED" ||
      node.status === "CANCELLED"
    ) {
      continue;
    }
    const failedPreds = predecessorsOf(plan, task.taskId).filter((pid) => {
      const s = nodes.get(pid)?.status;
      return s === "FAILED" || s === "BLOCKED" || s === "CANCELLED";
    });
    if (failedPreds.length) {
      out.push({ taskId: task.taskId, blockedBy: failedPreds });
    }
  }
  return out;
}

/**
 * Independent ready tasks that can run concurrently (same wave).
 */
export function selectParallelEligible(
  runnableIds: readonly string[],
  plan: ExecutionPlan
): readonly string[] {
  // All currently runnable tasks are independent by construction (preds done).
  // Still filter to those sharing no mutual dependency edges.
  const set = new Set(runnableIds);
  return runnableIds.filter((id) => {
    const preds = predecessorsOf(plan, id);
    return !preds.some((p) => set.has(p));
  });
}
