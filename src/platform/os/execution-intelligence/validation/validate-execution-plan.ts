/**
 * Deterministic ExecutionPlan validator — DAG, capabilities, contracts, tenant.
 */

import type { ICapabilityRegistry } from "../../../intelligence/capability-registry/interfaces/capability-registry";
import { asCapabilityId } from "../../../intelligence/shared/identifiers";
import type { IOutputContractRegistry } from "../../contracts/layer-ports";
import type { ExecutionPlan } from "../contracts/execution-plan";
import { ExecutionIntelligenceError } from "../contracts/errors";

export interface ValidateExecutionPlanResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly code?: ExecutionIntelligenceErrorCode;
}

type ExecutionIntelligenceErrorCode =
  import("../contracts/errors").ExecutionIntelligenceErrorCode;

/**
 * Detect cycles via Kahn topological sort. Returns cycle error if not a DAG.
 */
export function detectDependencyCycle(
  taskIds: readonly string[],
  edges: readonly { readonly fromTaskId: string; readonly toTaskId: string }[]
): string | undefined {
  const ids = new Set(taskIds);
  const indegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const id of taskIds) {
    indegree.set(id, 0);
    adj.set(id, []);
  }
  for (const e of edges) {
    if (!ids.has(e.fromTaskId) || !ids.has(e.toTaskId)) continue;
    adj.get(e.fromTaskId)!.push(e.toTaskId);
    indegree.set(e.toTaskId, (indegree.get(e.toTaskId) ?? 0) + 1);
  }
  const queue = [...taskIds.filter((id) => (indegree.get(id) ?? 0) === 0)];
  let visited = 0;
  while (queue.length) {
    const n = queue.shift()!;
    visited++;
    for (const m of adj.get(n) ?? []) {
      const next = (indegree.get(m) ?? 0) - 1;
      indegree.set(m, next);
      if (next === 0) queue.push(m);
    }
  }
  if (visited !== taskIds.length) {
    return "PLAN_INVALID_CYCLE: dependency graph contains a cycle";
  }
  return undefined;
}

export function validateExecutionPlan(
  plan: ExecutionPlan,
  options: {
    readonly trustedOrganizationId: string;
    readonly capabilityRegistry: ICapabilityRegistry;
    readonly outputContractRegistry: IOutputContractRegistry;
  }
): ValidateExecutionPlanResult {
  const errors: string[] = [];
  let code: ExecutionIntelligenceErrorCode | undefined;

  if (!plan.id?.trim()) errors.push("plan.id required");
  if (!plan.executionId?.trim()) errors.push("plan.executionId required");
  if (!plan.organizationId?.trim()) errors.push("plan.organizationId required");

  if (plan.organizationId !== options.trustedOrganizationId) {
    return {
      ok: false,
      errors: ["PLAN_TENANT_VIOLATION: organizationId mismatch"],
      code: "PLAN_TENANT_VIOLATION",
    };
  }

  const taskIds = plan.tasks.map((t) => t.taskId);
  const unique = new Set(taskIds);
  if (unique.size !== taskIds.length) {
    errors.push("duplicate task IDs");
    code = "PLAN_INVALID";
  }

  for (const t of plan.tasks) {
    if (!t.taskId?.trim() || !t.taskKey?.trim()) {
      errors.push(`task missing id/key`);
    }
    for (const dep of t.dependencies) {
      if (!unique.has(dep)) {
        errors.push(`task ${t.taskId} depends on missing task ${dep}`);
        code = "PLAN_INVALID";
      }
    }
    for (const cap of t.requiredCapabilities) {
      if (!options.capabilityRegistry.exists(asCapabilityId(cap))) {
        errors.push(`unsupported capability: ${cap}`);
        code = "PLAN_UNSUPPORTED_CAPABILITY";
      }
    }
    const contract = options.outputContractRegistry.getContract(
      t.outputRequirements.outputContractId
    );
    if (!contract || contract.status === "not_implemented") {
      // Also allow lookup by capability if contract id is a capability
      const byCap = options.outputContractRegistry.getContract(
        t.requiredCapabilities[0] ?? ""
      );
      if (
        !contract ||
        (contract.status === "not_implemented" &&
          (!byCap || byCap.status === "not_implemented"))
      ) {
        errors.push(
          `missing output contract: ${t.outputRequirements.outputContractId}`
        );
        code = "PLAN_MISSING_OUTPUT_CONTRACT";
      }
    }
  }

  for (const e of plan.dependencies) {
    if (!unique.has(e.fromTaskId) || !unique.has(e.toTaskId)) {
      errors.push(
        `dependency edge references missing task (${e.fromTaskId}→${e.toTaskId})`
      );
      code = "PLAN_INVALID";
    }
  }

  // Orphans: tasks with no path from roots — soft warning only if graph has edges
  // and some nodes are unreachable from roots (allowed for multi-root DAGs).
  // Hard fail only for edges pointing to missing IDs (above) and cycles.

  const cycle = detectDependencyCycle(taskIds, plan.dependencies);
  if (cycle) {
    return { ok: false, errors: [cycle, ...errors], code: "PLAN_INVALID_CYCLE" };
  }

  // Also validate per-task dependency edges consistency with plan.dependencies
  for (const t of plan.tasks) {
    for (const dep of t.dependencies) {
      const hasEdge = plan.dependencies.some(
        (e) => e.fromTaskId === dep && e.toTaskId === t.taskId
      );
      if (!hasEdge) {
        errors.push(
          `task ${t.taskId} lists dependency ${dep} without matching edge`
        );
        code = code ?? "PLAN_INVALID";
      }
    }
  }

  if (errors.length) {
    return { ok: false, errors, code: code ?? "PLAN_INVALID" };
  }
  return { ok: true, errors: [] };
}

export function assertValidExecutionPlan(
  plan: ExecutionPlan,
  options: {
    readonly trustedOrganizationId: string;
    readonly capabilityRegistry: ICapabilityRegistry;
    readonly outputContractRegistry: IOutputContractRegistry;
  }
): void {
  const result = validateExecutionPlan(plan, options);
  if (!result.ok) {
    throw new ExecutionIntelligenceError(
      result.code ?? "PLAN_INVALID",
      result.errors.join("; ")
    );
  }
}
