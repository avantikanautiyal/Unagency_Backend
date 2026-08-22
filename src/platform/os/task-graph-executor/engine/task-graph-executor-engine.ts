/**
 * Phase 5 — Task Graph Executor (canonical DAG runtime).
 * Consumes APPROVED_FOR_EXECUTION OsExecutionPlan only.
 * Does NOT plan. Does NOT select models. Bounded parallel task execution.
 */

import type { ICapabilityRegistry } from "../../../intelligence/capability-registry/interfaces/capability-registry";
import { asCapabilityId } from "../../../intelligence/shared/identifiers";
import {
  defaultOutputContractRegistry,
} from "../../contracts/output-contract-registry";
import type { IOutputContractRegistry } from "../../contracts/layer-ports";
import type { ExecutionPlan } from "../../execution-intelligence/contracts/execution-plan";
import { inspectPlanForExecution } from "../../execution-intelligence/adapters/plan-execution-adapter";
import { logOsExecutionEvent } from "../../observability/execution-log";
import { ConcurrencyLimiter } from "../../../infrastructure/execution/concurrency/concurrency-limiter";
import { TaskGraphExecutorError } from "../contracts/errors";
import {
  TASK_GRAPH_RUNTIME_VERSION,
  canTransitionTaskStatus,
  type ExecutionApprovalStatus,
  type TaskGraphEvent,
  type TaskGraphExecutionStatus,
  type TaskGraphRunSnapshot,
  type TaskNodeState,
  type TaskNodeStatus,
  type TaskOutputReference,
} from "../contracts/task-graph-state";
import {
  selectBlockedByDependency,
  selectParallelEligible,
  selectRunnableTaskIds,
  predecessorsOf,
} from "./task-scheduler";
import type { ITaskCapabilityRunner } from "./task-capability-runner";
import type { ITaskGraphRunStore } from "../persistence/task-graph-run-store";
import { InMemoryTaskGraphRunStore } from "../persistence/task-graph-run-store";
import type { GovernanceFinalizeService } from "../../governance/finalize";
import { createGovernanceFinalizeService } from "../../governance/finalize";

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_MAX_CONCURRENCY = 3;

export interface ExecuteTaskGraphInput {
  readonly organizationId: string;
  readonly executionId: string;
  readonly requestId: string;
  readonly plan: ExecutionPlan;
  readonly briefObjective?: string;
  readonly brandTone?: string;
  readonly brandVoice?: string;
  readonly brandAvoidTerms?: readonly string[];
  readonly prohibitedPatterns?: readonly string[];
  readonly knowledgeFactSummary?: string;
  /** Parent brand for thin leaf learning (no OS re-assembly). */
  readonly brandId?: string;
  readonly maxConcurrency?: number;
  readonly workerId?: string;
  readonly nowIso?: () => string;
  readonly createId?: (prefix: string) => string;
  /** Phase 6 — disable governance for pure Phase 5 tech tests when needed */
  readonly skipGovernance?: boolean;
}

export interface ITaskGraphExecutorEngine {
  readonly implementationStatus: "implemented";
  execute(input: ExecuteTaskGraphInput): Promise<TaskGraphRunSnapshot>;
  resume(input: {
    readonly organizationId: string;
    readonly executionId: string;
    readonly requestId: string;
    readonly plan: ExecutionPlan;
    readonly briefObjective?: string;
    readonly brandTone?: string;
    readonly brandVoice?: string;
    readonly brandAvoidTerms?: readonly string[];
    readonly prohibitedPatterns?: readonly string[];
    readonly knowledgeFactSummary?: string;
    readonly brandId?: string;
    readonly maxConcurrency?: number;
    readonly workerId?: string;
    readonly nowIso?: () => string;
    readonly skipGovernance?: boolean;
  }): Promise<TaskGraphRunSnapshot>;
  cancel(input: {
    readonly organizationId: string;
    readonly executionId: string;
    readonly reason?: string;
    readonly nowIso?: () => string;
  }): Promise<TaskGraphRunSnapshot>;
  getStatus(input: {
    readonly organizationId: string;
    readonly executionId: string;
  }): Promise<TaskGraphRunSnapshot | undefined>;
  /** Phase 6 — apply human review decision and optionally resume. */
  applyHumanReviewDecision(input: {
    readonly organizationId: string;
    readonly executionId: string;
    readonly reviewId: string;
    readonly decision: "APPROVED" | "REJECTED" | "REQUEST_CHANGES";
    readonly reviewer: string;
    readonly comments?: string;
    readonly plan: ExecutionPlan;
    readonly requestId?: string;
    readonly nowIso?: () => string;
  }): Promise<TaskGraphRunSnapshot>;
  /** Phase 8 — claim + execute one queued task (multi-worker safe). */
  processQueuedTask(input: {
    readonly organizationId: string;
    readonly executionId: string;
    readonly requestId: string;
    readonly plan: ExecutionPlan;
    readonly taskId: string;
    readonly workerId: string;
    readonly nowIso?: () => string;
    readonly skipGovernance?: boolean;
    readonly briefObjective?: string;
    readonly brandTone?: string;
    readonly brandVoice?: string;
    readonly brandAvoidTerms?: readonly string[];
    readonly prohibitedPatterns?: readonly string[];
    readonly knowledgeFactSummary?: string;
    readonly brandId?: string;
  }): Promise<{
    readonly claimed: boolean;
    readonly snapshot: TaskGraphRunSnapshot;
    readonly reason?: string;
  }>;
  completeAsyncTask(input: {
    readonly organizationId: string;
    readonly executionId: string;
    readonly taskId: string;
    readonly requestId: string;
    readonly plan: ExecutionPlan;
    readonly preview: string;
    readonly outputContractId: string;
    readonly externalJobRef: string;
    readonly nowIso?: () => string;
    readonly skipGovernance?: boolean;
  }): Promise<TaskGraphRunSnapshot>;
}

type RunLoopCtx = {
  organizationId: string;
  executionId: string;
  requestId: string;
  briefObjective?: string;
  brandTone?: string;
  brandVoice?: string;
  brandAvoidTerms?: readonly string[];
  prohibitedPatterns?: readonly string[];
  knowledgeFactSummary?: string;
  brandId?: string;
  maxConcurrency: number;
  workerId: string;
  nowIso: () => string;
  skipGovernance?: boolean;
};

function pushEvent(
  events: TaskGraphEvent[],
  type: string,
  at: string,
  taskId?: string,
  detail?: string
): void {
  events.push({ at, type, taskId, detail });
  // Bound event log size
  if (events.length > 200) events.splice(0, events.length - 200);
}

function transitionNode(
  node: TaskNodeState,
  to: TaskNodeStatus,
  at: string,
  patch: Partial<TaskNodeState> = {}
): TaskNodeState {
  if (!canTransitionTaskStatus(node.status, to)) {
    throw new TaskGraphExecutorError(
      "INVALID_TRANSITION",
      `Illegal task transition ${node.status} → ${to} for ${node.taskId}`
    );
  }
  return {
    ...node,
    ...patch,
    status: to,
    updatedAt: at,
  };
}

function deriveRunStatus(nodes: readonly TaskNodeState[]): TaskGraphExecutionStatus {
  if (nodes.some((n) => n.status === "RUNNING" || n.status === "RETRYING" || n.status === "READY")) {
    return "RUNNING";
  }
  if (nodes.every((n) => n.status === "SUCCEEDED")) return "SUCCEEDED";
  if (nodes.every((n) => n.status === "CANCELLED" || n.status === "SKIPPED")) {
    return "CANCELLED";
  }
  if (
    nodes.some((n) => n.status === "SUCCEEDED") &&
    nodes.some(
      (n) =>
        n.status === "FAILED" ||
        n.status === "BLOCKED" ||
        n.status === "SKIPPED" ||
        n.status === "CANCELLED"
    )
  ) {
    return "PARTIALLY_SUCCEEDED";
  }
  if (nodes.some((n) => n.status === "BLOCKED") && !nodes.some((n) => n.status === "SUCCEEDED")) {
    return "BLOCKED";
  }
  if (nodes.some((n) => n.status === "FAILED")) return "FAILED";
  if (nodes.some((n) => n.status === "CANCELLED")) return "CANCELLED";
  return "PENDING";
}

export class TaskGraphExecutorEngine implements ITaskGraphExecutorEngine {
  readonly implementationStatus = "implemented" as const;
  private readonly abortByExecution = new Map<string, AbortController>();
  private readonly activeWorkers = new Set<string>();

  constructor(
    private readonly deps: {
      readonly runner: ITaskCapabilityRunner;
      readonly capabilityRegistry: ICapabilityRegistry;
      readonly outputContractRegistry?: IOutputContractRegistry;
      readonly store?: ITaskGraphRunStore;
      readonly defaultMaxConcurrency?: number;
      readonly defaultMaxAttempts?: number;
      /** Phase 6 — evaluation + governance finalize (default enabled). */
      readonly governanceFinalize?: GovernanceFinalizeService;
      readonly enableGovernance?: boolean;
      /** Phase 8 — default in_process keeps Phase 5 tests green. */
      readonly executeMode?: "in_process" | "queued";
      readonly onTasksReady?: (input: {
        readonly snapshot: TaskGraphRunSnapshot;
        readonly readyTaskIds: readonly string[];
      }) => Promise<void>;
    }
  ) {}

  private get governance(): GovernanceFinalizeService | undefined {
    if (this.deps.enableGovernance === false) return undefined;
    return this.deps.governanceFinalize ?? createGovernanceFinalizeService();
  }

  private get store(): ITaskGraphRunStore {
    return this.deps.store ?? new InMemoryTaskGraphRunStore();
  }

  private get contracts(): IOutputContractRegistry {
    return this.deps.outputContractRegistry ?? defaultOutputContractRegistry;
  }

  async getStatus(input: {
    readonly organizationId: string;
    readonly executionId: string;
  }): Promise<TaskGraphRunSnapshot | undefined> {
    return this.store.get(input.executionId, input.organizationId);
  }

  async cancel(input: {
    readonly organizationId: string;
    readonly executionId: string;
    readonly reason?: string;
    readonly nowIso?: () => string;
  }): Promise<TaskGraphRunSnapshot> {
    const nowIso = input.nowIso ?? (() => new Date().toISOString());
    const at = nowIso();
    const existing = await this.store.get(input.executionId, input.organizationId);
    if (!existing) {
      throw new TaskGraphExecutorError("RUN_NOT_FOUND", "No task graph run to cancel");
    }
    if (
      existing.status === "SUCCEEDED" ||
      existing.status === "CANCELLED" ||
      existing.status === "FAILED"
    ) {
      // Idempotent cancel on terminal
      return existing;
    }

    this.abortByExecution.get(input.executionId)?.abort();

    const events = [...existing.events];
    pushEvent(events, "execution.cancelled", at, undefined, input.reason);

    const tasks = existing.tasks.map((n) => {
      if (
        n.status === "SUCCEEDED" ||
        n.status === "FAILED" ||
        n.status === "CANCELLED" ||
        n.status === "SKIPPED" ||
        n.status === "BLOCKED"
      ) {
        return n;
      }
      if (n.status === "RUNNING" || n.status === "READY" || n.status === "PENDING" || n.status === "RETRYING") {
        return transitionNode(n, "CANCELLED", at, {
          finishedAt: at,
          errorCode: "CANCELLED",
          errorMessage: input.reason ?? "cancelled",
          failureClass: "cancelled",
          claimedBy: undefined,
          claimToken: undefined,
        });
      }
      return n;
    });

    const next: TaskGraphRunSnapshot = {
      ...existing,
      status: "CANCELLED",
      cancelRequested: true,
      cancelReason: input.reason,
      tasks,
      events,
      updatedAt: at,
      completedAt: at,
      stateVersion: existing.stateVersion + 1,
    };

    const saved = await this.store.compareAndSet(next, existing.stateVersion);
    if (!saved) {
      // Retry once on conflict
      return this.cancel(input);
    }

    logOsExecutionEvent("task_graph.execution.cancelled", {
      requestId: existing.runId,
      executionId: input.executionId,
      organizationId: input.organizationId,
      status: "CANCELLED",
      planId: existing.planId,
      planVersion: existing.planVersion,
    });

    return next;
  }

  async execute(input: ExecuteTaskGraphInput): Promise<TaskGraphRunSnapshot> {
    this.assertTenant(input);
    this.assertPlanExecutable(input);

    const existing = await this.store.get(input.executionId, input.organizationId);
    if (existing) {
      // Idempotent: if already running/succeeded, resume or return
      if (existing.planVersion !== input.plan.planVersion) {
        throw new TaskGraphExecutorError(
          "PLAN_VERSION_MISMATCH",
          `Execution bound to plan v${existing.planVersion}; cannot switch to v${input.plan.planVersion}`
        );
      }
      if (
        existing.status === "SUCCEEDED" ||
        existing.status === "CANCELLED" ||
        existing.status === "FAILED" ||
        existing.status === "PARTIALLY_SUCCEEDED" ||
        existing.status === "BLOCKED"
      ) {
        return existing;
      }
      return this.resume({
        organizationId: input.organizationId,
        executionId: input.executionId,
        requestId: input.requestId,
        plan: input.plan,
        briefObjective: input.briefObjective,
        brandTone: input.brandTone,
        brandVoice: input.brandVoice,
        brandAvoidTerms: input.brandAvoidTerms,
        prohibitedPatterns: input.prohibitedPatterns,
        knowledgeFactSummary: input.knowledgeFactSummary,
        brandId: input.brandId,
        maxConcurrency: input.maxConcurrency,
        workerId: input.workerId,
        nowIso: input.nowIso,
        skipGovernance: input.skipGovernance,
      });
    }

    const nowIso = input.nowIso ?? (() => new Date().toISOString());
    const createId = input.createId ?? ((p: string) => `${p}_${Date.now()}`);
    const at = nowIso();
    const maxAttempts = this.deps.defaultMaxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const maxConcurrency =
      input.maxConcurrency ??
      this.deps.defaultMaxConcurrency ??
      DEFAULT_MAX_CONCURRENCY;

    const events: TaskGraphEvent[] = [];
    pushEvent(events, "execution.started", at);

    const tasks: TaskNodeState[] = input.plan.tasks.map((t) => ({
      taskId: t.taskId,
      taskKey: t.taskKey,
      status: "PENDING" as const,
      attempt: 0,
      maxAttempts,
      attempts: [],
      updatedAt: at,
    }));

    const snap: TaskGraphRunSnapshot = {
      runId: createId("tgrun"),
      runtimeVersion: TASK_GRAPH_RUNTIME_VERSION,
      executionId: input.executionId,
      organizationId: input.organizationId,
      planId: input.plan.id,
      planVersion: input.plan.planVersion,
      status: "RUNNING",
      tasks,
      parallelEligibleTaskIds: [],
      maxConcurrency,
      cancelRequested: false,
      createdAt: at,
      updatedAt: at,
      stateVersion: 0,
      events,
      approvalStatus: "NOT_EVALUATED",
    };

    const created = await this.store.compareAndSet(snap, undefined);
    if (!created) {
      // Race: another worker created — resume
      return this.resume({
        organizationId: input.organizationId,
        executionId: input.executionId,
        requestId: input.requestId,
        plan: input.plan,
        briefObjective: input.briefObjective,
        brandTone: input.brandTone,
        brandVoice: input.brandVoice,
        brandAvoidTerms: input.brandAvoidTerms,
        prohibitedPatterns: input.prohibitedPatterns,
        knowledgeFactSummary: input.knowledgeFactSummary,
        brandId: input.brandId,
        maxConcurrency,
        workerId: input.workerId,
        nowIso,
        skipGovernance: input.skipGovernance,
      });
    }

    logOsExecutionEvent("task_graph.execution.started", {
      requestId: input.requestId,
      executionId: input.executionId,
      organizationId: input.organizationId,
      status: "RUNNING",
      planId: input.plan.id,
      planVersion: input.plan.planVersion,
      taskCount: input.plan.tasks.length,
    });

    const ctx: RunLoopCtx = {
      organizationId: input.organizationId,
      executionId: input.executionId,
      requestId: input.requestId,
      briefObjective: input.briefObjective,
      brandTone: input.brandTone,
      brandVoice: input.brandVoice,
      brandAvoidTerms: input.brandAvoidTerms,
      prohibitedPatterns: input.prohibitedPatterns,
      knowledgeFactSummary: input.knowledgeFactSummary,
      brandId: input.brandId,
      maxConcurrency,
      workerId: input.workerId ?? createId("worker"),
      nowIso,
      skipGovernance: input.skipGovernance,
    };

    if (this.deps.executeMode === "queued") {
      return this.scheduleReadyTasks(input.plan, ctx);
    }

    return this.runLoop(input.plan, ctx);
  }

  async resume(input: {
    readonly organizationId: string;
    readonly executionId: string;
    readonly requestId: string;
    readonly plan: ExecutionPlan;
    readonly briefObjective?: string;
    readonly brandTone?: string;
    readonly brandVoice?: string;
    readonly brandAvoidTerms?: readonly string[];
    readonly prohibitedPatterns?: readonly string[];
    readonly knowledgeFactSummary?: string;
    readonly brandId?: string;
    readonly maxConcurrency?: number;
    readonly workerId?: string;
    readonly nowIso?: () => string;
    readonly skipGovernance?: boolean;
  }): Promise<TaskGraphRunSnapshot> {
    this.assertTenant({
      organizationId: input.organizationId,
      plan: input.plan,
      executionId: input.executionId,
    });
    if (input.plan.organizationId !== input.organizationId) {
      throw new TaskGraphExecutorError("TENANT_VIOLATION", "plan tenant mismatch");
    }

    const existing = await this.store.get(input.executionId, input.organizationId);
    if (!existing) {
      throw new TaskGraphExecutorError("RUN_NOT_FOUND", "No run to resume");
    }
    if (existing.planVersion !== input.plan.planVersion) {
      throw new TaskGraphExecutorError(
        "PLAN_VERSION_MISMATCH",
        `Bound to plan v${existing.planVersion}`
      );
    }
    if (
      existing.status === "SUCCEEDED" ||
      existing.status === "CANCELLED" ||
      existing.status === "FAILED" ||
      existing.status === "PARTIALLY_SUCCEEDED" ||
      existing.status === "BLOCKED"
    ) {
      return existing;
    }

    const nowIso = input.nowIso ?? (() => new Date().toISOString());
    const at = nowIso();

    // Reconcile interrupted RUNNING → RETRYING (deterministic recovery)
    let version = existing.stateVersion;
    let tasks = existing.tasks.map((n) => {
      if (n.status === "RUNNING") {
        if (n.executionMode === "ASYNC" && n.externalJobRef) {
          return n;
        }
        return transitionNode(n, "FAILED", at, {
          errorCode: "INTERRUPTED",
          errorMessage: "Recovered interrupted RUNNING task",
          failureClass: "transient",
          claimedBy: undefined,
          claimToken: undefined,
        });
      }
      return n;
    });
    // Move interrupted failures to RETRYING if attempts remain
    tasks = tasks.map((n) => {
      if (
        n.status === "FAILED" &&
        n.errorCode === "INTERRUPTED" &&
        n.attempt < n.maxAttempts
      ) {
        return transitionNode(n, "RETRYING", at);
      }
      return n;
    });

    const events = [...existing.events];
    pushEvent(events, "execution.resumed", at);

    const reconciled: TaskGraphRunSnapshot = {
      ...existing,
      status: "RUNNING",
      tasks,
      events,
      updatedAt: at,
      stateVersion: version + 1,
    };
    const ok = await this.store.compareAndSet(reconciled, version);
    if (!ok) {
      return this.resume(input);
    }

    logOsExecutionEvent("task_graph.execution.resumed", {
      requestId: input.requestId,
      executionId: input.executionId,
      organizationId: input.organizationId,
      status: "RUNNING",
      planId: existing.planId,
      planVersion: existing.planVersion,
    });

    const resumeCtx: RunLoopCtx = {
      organizationId: input.organizationId,
      executionId: input.executionId,
      requestId: input.requestId,
      briefObjective: input.briefObjective,
      brandTone: input.brandTone,
      brandVoice: input.brandVoice,
      brandAvoidTerms: input.brandAvoidTerms,
      prohibitedPatterns: input.prohibitedPatterns,
      knowledgeFactSummary: input.knowledgeFactSummary,
      brandId: input.brandId,
      maxConcurrency:
        input.maxConcurrency ??
        existing.maxConcurrency ??
        DEFAULT_MAX_CONCURRENCY,
      workerId: input.workerId ?? `worker_${Date.now()}`,
      nowIso,
      skipGovernance: input.skipGovernance,
    };

    if (this.deps.executeMode === "queued") {
      return this.scheduleReadyTasks(input.plan, resumeCtx);
    }

    return this.runLoop(input.plan, resumeCtx);
  }

  private assertTenant(input: {
    organizationId: string;
    executionId: string;
    plan: ExecutionPlan;
  }): void {
    if (!input.organizationId?.trim()) {
      throw new TaskGraphExecutorError("TENANT_VIOLATION", "organizationId required");
    }
    if (input.plan.organizationId !== input.organizationId) {
      throw new TaskGraphExecutorError(
        "TENANT_VIOLATION",
        "Plan organizationId does not match trusted tenant"
      );
    }
    if (input.plan.executionId !== input.executionId) {
      throw new TaskGraphExecutorError(
        "TENANT_VIOLATION",
        "Plan executionId does not match"
      );
    }
  }

  private assertPlanExecutable(input: ExecuteTaskGraphInput): void {
    if (input.plan.status !== "APPROVED_FOR_EXECUTION") {
      throw new TaskGraphExecutorError(
        "PLAN_STATUS_REJECTED",
        `Only APPROVED_FOR_EXECUTION plans may run; got ${input.plan.status}`
      );
    }
    const inspected = inspectPlanForExecution(input.plan, {
      trustedOrganizationId: input.organizationId,
      capabilityRegistry: this.deps.capabilityRegistry,
      outputContractRegistry: this.contracts,
    });
    if (!inspected.readyForGraphExecution) {
      throw new TaskGraphExecutorError(
        "PLAN_NOT_EXECUTABLE",
        inspected.errors.join("; ") || "Plan not executable"
      );
    }
  }

  async processQueuedTask(input: {
    readonly organizationId: string;
    readonly executionId: string;
    readonly requestId: string;
    readonly plan: ExecutionPlan;
    readonly taskId: string;
    readonly workerId: string;
    readonly nowIso?: () => string;
    readonly skipGovernance?: boolean;
    readonly briefObjective?: string;
    readonly brandTone?: string;
    readonly brandVoice?: string;
    readonly brandAvoidTerms?: readonly string[];
    readonly prohibitedPatterns?: readonly string[];
    readonly knowledgeFactSummary?: string;
    readonly brandId?: string;
  }): Promise<{
    readonly claimed: boolean;
    readonly snapshot: TaskGraphRunSnapshot;
    readonly reason?: string;
  }> {
    const nowIso = input.nowIso ?? (() => new Date().toISOString());
    const ctx: RunLoopCtx = {
      organizationId: input.organizationId,
      executionId: input.executionId,
      requestId: input.requestId,
      briefObjective: input.briefObjective,
      brandTone: input.brandTone,
      brandVoice: input.brandVoice,
      brandAvoidTerms: input.brandAvoidTerms,
      prohibitedPatterns: input.prohibitedPatterns,
      knowledgeFactSummary: input.knowledgeFactSummary,
      brandId: input.brandId,
      maxConcurrency: this.deps.defaultMaxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
      workerId: input.workerId,
      nowIso,
      skipGovernance: input.skipGovernance,
    };

    const snap = await this.store.get(input.executionId, input.organizationId);
    if (!snap) {
      throw new TaskGraphExecutorError("RUN_NOT_FOUND", "No task graph run");
    }
    if (snap.cancelRequested || snap.status === "CANCELLED" || snap.status === "PAUSED") {
      return { claimed: false, snapshot: snap, reason: "not_runnable" };
    }
    const node = snap.tasks.find((t) => t.taskId === input.taskId);
    if (!node) {
      return { claimed: false, snapshot: snap, reason: "unknown_task" };
    }
    if (node.status === "SUCCEEDED") {
      return { claimed: false, snapshot: snap, reason: "already_done" };
    }
    if (node.status === "RUNNING") {
      return { claimed: false, snapshot: snap, reason: "already_claimed" };
    }
    if (node.status !== "READY" && node.status !== "RETRYING") {
      return { claimed: false, snapshot: snap, reason: "not_ready" };
    }

    const claimAt = nowIso();
    const attempt = node.attempt + 1;
    const claimToken = `${input.workerId}:${claimAt}:${input.taskId}`;
    const tasks = snap.tasks.map((t) =>
      t.taskId === input.taskId
        ? transitionNode(t, "RUNNING", claimAt, {
            attempt,
            claimedBy: input.workerId,
            claimToken,
            startedAt: claimAt,
            heartbeatAt: claimAt,
            executionMode: "SYNC",
            attempts: [
              ...t.attempts,
              { attempt, startedAt: claimAt, status: "RUNNING" },
            ],
          })
        : t
    );
    const events = [...snap.events];
    pushEvent(events, "task.started", claimAt, input.taskId, `attempt=${attempt}`);
    const claimed: TaskGraphRunSnapshot = {
      ...snap,
      tasks,
      events,
      status: "RUNNING",
      updatedAt: claimAt,
      stateVersion: snap.stateVersion + 1,
    };
    const saved = await this.store.compareAndSet(claimed, snap.stateVersion);
    if (!saved) {
      const latest = (await this.store.get(input.executionId, input.organizationId))!;
      return { claimed: false, snapshot: latest, reason: "cas_conflict" };
    }
    logOsExecutionEvent("task_graph.task.started", {
      requestId: input.requestId,
      executionId: input.executionId,
      organizationId: input.organizationId,
      taskId: input.taskId,
      status: "RUNNING",
      planId: snap.planId,
      planVersion: snap.planVersion,
    });

    await this.runClaimedTask(input.plan, ctx, input.taskId, claimed);
    const after = await this.scheduleReadyTasks(input.plan, ctx);
    return { claimed: true, snapshot: after };
  }

  async completeAsyncTask(input: {
    readonly organizationId: string;
    readonly executionId: string;
    readonly taskId: string;
    readonly requestId: string;
    readonly plan: ExecutionPlan;
    readonly preview: string;
    readonly outputContractId: string;
    readonly externalJobRef: string;
    readonly nowIso?: () => string;
    readonly skipGovernance?: boolean;
  }): Promise<TaskGraphRunSnapshot> {
    const nowIso = input.nowIso ?? (() => new Date().toISOString());
    const snap = await this.store.get(input.executionId, input.organizationId);
    if (!snap) {
      throw new TaskGraphExecutorError("RUN_NOT_FOUND", "No task graph run");
    }
    const node = snap.tasks.find((t) => t.taskId === input.taskId);
    if (!node || node.externalJobRef !== input.externalJobRef) {
      return snap;
    }
    if (node.status !== "RUNNING") return snap;
    const claimToken = node.claimToken ?? `async:${input.taskId}`;
    await this.succeedTask(
      {
        organizationId: input.organizationId,
        executionId: input.executionId,
        requestId: input.requestId,
        nowIso,
      },
      input.taskId,
      claimToken,
      {
        preview: input.preview,
        outputContractId: input.outputContractId,
      }
    );
    return this.scheduleReadyTasks(input.plan, {
      organizationId: input.organizationId,
      executionId: input.executionId,
      requestId: input.requestId,
      maxConcurrency: snap.maxConcurrency,
      workerId: "async-reconcile",
      nowIso,
      skipGovernance: input.skipGovernance,
    });
  }

  private async scheduleReadyTasks(
    plan: ExecutionPlan,
    ctx: RunLoopCtx
  ): Promise<TaskGraphRunSnapshot> {
    for (let i = 0; i < 6; i++) {
      let snap = await this.store.get(ctx.executionId, ctx.organizationId);
      if (!snap) {
        throw new TaskGraphExecutorError("RUN_NOT_FOUND", "Run disappeared");
      }
      if (snap.cancelRequested || snap.status === "CANCELLED" || snap.status === "PAUSED") {
        return snap;
      }
      const at = ctx.nowIso();
      const nodeMap = new Map(snap.tasks.map((t) => [t.taskId, t]));
      const toBlock = selectBlockedByDependency(plan, nodeMap);
      if (toBlock.length) {
        let tasks = [...snap.tasks];
        const events = [...snap.events];
        for (const b of toBlock) {
          const idx = tasks.findIndex((t) => t.taskId === b.taskId);
          if (idx < 0) continue;
          const n = tasks[idx]!;
          if (n.status === "PENDING" || n.status === "READY" || n.status === "RETRYING") {
            tasks[idx] = transitionNode(n, "BLOCKED", at, {
              blockedByTaskIds: b.blockedBy,
              finishedAt: at,
              errorCode: "DEPENDENCY_FAILED",
              errorMessage: `Blocked by ${b.blockedBy.join(",")}`,
              failureClass: "dependency",
            });
            pushEvent(events, "task.blocked", at, b.taskId);
          }
        }
        const next: TaskGraphRunSnapshot = {
          ...snap,
          tasks,
          events,
          status: deriveRunStatus(tasks),
          updatedAt: at,
          stateVersion: snap.stateVersion + 1,
        };
        const saved = await this.store.compareAndSet(next, snap.stateVersion);
        if (!saved) continue;
        snap = next;
      }

      const runnable = selectRunnableTaskIds(
        plan,
        new Map(snap.tasks.map((t) => [t.taskId, t])),
        { cancelRequested: snap.cancelRequested }
      );
      const parallel = selectParallelEligible(runnable, plan);
      {
        let tasks = [...snap.tasks];
        const events = [...snap.events];
        let changed = false;
        const readyIds: string[] = [];
        for (const id of parallel) {
          const idx = tasks.findIndex((t) => t.taskId === id);
          if (idx < 0) continue;
          const n = tasks[idx]!;
          if (n.status === "PENDING" || n.status === "RETRYING") {
            tasks[idx] = transitionNode(n, "READY", at);
            pushEvent(events, "task.scheduled", at, id);
            changed = true;
            readyIds.push(id);
          } else if (n.status === "READY") {
            readyIds.push(id);
          }
        }
        if (changed) {
          const next: TaskGraphRunSnapshot = {
            ...snap,
            tasks,
            events,
            parallelEligibleTaskIds: parallel,
            status: "RUNNING",
            updatedAt: at,
            stateVersion: snap.stateVersion + 1,
          };
          const saved = await this.store.compareAndSet(next, snap.stateVersion);
          if (!saved) continue;
          snap = next;
        }
        if (readyIds.length && this.deps.onTasksReady) {
          await this.deps.onTasksReady({ snapshot: snap, readyTaskIds: readyIds });
        }
      }

      const status = deriveRunStatus(snap.tasks);
      if (status !== "RUNNING" && status !== "PENDING") {
        const done: TaskGraphRunSnapshot = {
          ...snap,
          status,
          updatedAt: ctx.nowIso(),
          completedAt: ctx.nowIso(),
          stateVersion: snap.stateVersion + 1,
        };
        await this.store.compareAndSet(done, snap.stateVersion);
        let final = (await this.store.get(ctx.executionId, ctx.organizationId))!;
        if (final.status === "SUCCEEDED" && !ctx.skipGovernance) {
          final = await this.applyExecutionLevelGovernance(plan, ctx, final);
        }
        this.logTerminal(ctx, final);
        return final;
      }
      return (await this.store.get(ctx.executionId, ctx.organizationId))!;
    }
    return (await this.store.get(ctx.executionId, ctx.organizationId))!;
  }

  private async runLoop(
    plan: ExecutionPlan,
    ctx: RunLoopCtx
  ): Promise<TaskGraphRunSnapshot> {
    const workerKey = `${ctx.executionId}:${ctx.workerId}`;
    if (this.activeWorkers.has(workerKey)) {
      // Prevent two scheduler loops for same worker key; allow other workers via CAS
    }
    this.activeWorkers.add(workerKey);

    const limiter = new ConcurrencyLimiter(ctx.maxConcurrency);
    if (!this.abortByExecution.has(ctx.executionId)) {
      this.abortByExecution.set(ctx.executionId, new AbortController());
    } else if (this.abortByExecution.get(ctx.executionId)?.signal.aborted) {
      // Fresh abort controller when resuming after human-review pause
      this.abortByExecution.set(ctx.executionId, new AbortController());
    }

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        let snap = await this.store.get(ctx.executionId, ctx.organizationId);
        if (!snap) {
          throw new TaskGraphExecutorError("RUN_NOT_FOUND", "Run disappeared");
        }
        if (snap.cancelRequested || snap.status === "CANCELLED") {
          return snap;
        }
        if (snap.status === "PAUSED") {
          return snap;
        }

        const nodeMap = new Map(snap.tasks.map((t) => [t.taskId, t]));
        const at = ctx.nowIso();

        // Propagate dependency failures
        const toBlock = selectBlockedByDependency(plan, nodeMap);
        if (toBlock.length) {
          let tasks = [...snap.tasks];
          const events = [...snap.events];
          for (const b of toBlock) {
            const idx = tasks.findIndex((t) => t.taskId === b.taskId);
            if (idx < 0) continue;
            const n = tasks[idx]!;
            if (
              n.status === "PENDING" ||
              n.status === "READY" ||
              n.status === "RETRYING"
            ) {
              tasks[idx] = transitionNode(n, "BLOCKED", at, {
                blockedByTaskIds: b.blockedBy,
                finishedAt: at,
                errorCode: "DEPENDENCY_FAILED",
                errorMessage: `Blocked by ${b.blockedBy.join(",")}`,
                failureClass: "dependency",
              });
              pushEvent(
                events,
                "task.blocked",
                at,
                b.taskId,
                `deps=${b.blockedBy.join(",")}`
              );
              logOsExecutionEvent("task_graph.task.blocked", {
                requestId: ctx.requestId,
                executionId: ctx.executionId,
                organizationId: ctx.organizationId,
                taskId: b.taskId,
                status: "BLOCKED",
                planId: snap.planId,
              });
            }
          }
          const next: TaskGraphRunSnapshot = {
            ...snap,
            tasks,
            events,
            status: deriveRunStatus(tasks),
            updatedAt: at,
            stateVersion: snap.stateVersion + 1,
            completedAt:
              deriveRunStatus(tasks) !== "RUNNING" &&
              deriveRunStatus(tasks) !== "PENDING"
                ? at
                : snap.completedAt,
          };
          const saved = await this.store.compareAndSet(next, snap.stateVersion);
          if (!saved) continue;
          snap = next;
        }

        const runnable = selectRunnableTaskIds(plan, new Map(snap.tasks.map((t) => [t.taskId, t])), {
          cancelRequested: snap.cancelRequested,
        });
        const parallel = selectParallelEligible(runnable, plan);

        // Mark READY
        {
          let tasks = [...snap.tasks];
          const events = [...snap.events];
          let changed = false;
          for (const id of parallel) {
            const idx = tasks.findIndex((t) => t.taskId === id);
            if (idx < 0) continue;
            const n = tasks[idx]!;
            if (n.status === "PENDING" || n.status === "RETRYING") {
              tasks[idx] = transitionNode(n, "READY", at);
              pushEvent(events, "task.scheduled", at, id);
              changed = true;
              logOsExecutionEvent("task_graph.task.scheduled", {
                requestId: ctx.requestId,
                executionId: ctx.executionId,
                organizationId: ctx.organizationId,
                taskId: id,
                status: "READY",
                planId: snap.planId,
              });
            }
          }
          if (changed) {
            const next: TaskGraphRunSnapshot = {
              ...snap,
              tasks,
              events,
              parallelEligibleTaskIds: parallel,
              status: "RUNNING",
              updatedAt: at,
              stateVersion: snap.stateVersion + 1,
            };
            const saved = await this.store.compareAndSet(next, snap.stateVersion);
            if (!saved) continue;
            snap = next;
          } else {
            snap = {
              ...snap,
              parallelEligibleTaskIds: parallel,
            };
          }
        }

        const readyIds = snap.tasks
          .filter((t) => t.status === "READY" || t.status === "RETRYING")
          .map((t) => t.taskId)
          .filter((id) => parallel.includes(id) || selectRunnableTaskIds(plan, new Map(snap!.tasks.map((t) => [t.taskId, t])), { cancelRequested: snap!.cancelRequested }).includes(id));

        if (readyIds.length === 0) {
          const status = deriveRunStatus(snap.tasks);
          if (status === "RUNNING" || status === "PENDING") {
            // Waiting on in-flight?
            if (snap.tasks.some((t) => t.status === "RUNNING")) {
              await new Promise((r) => setTimeout(r, 10));
              continue;
            }
            // Deadlock / drained
            const terminal: TaskGraphRunSnapshot = {
              ...snap,
              status: deriveRunStatus(snap.tasks),
              updatedAt: ctx.nowIso(),
              completedAt: ctx.nowIso(),
              stateVersion: snap.stateVersion + 1,
            };
            await this.store.compareAndSet(terminal, snap.stateVersion);
            return (await this.store.get(ctx.executionId, ctx.organizationId))!;
          }
          const done: TaskGraphRunSnapshot = {
            ...snap,
            status,
            updatedAt: ctx.nowIso(),
            completedAt: ctx.nowIso(),
            stateVersion: snap.stateVersion + 1,
          };
          await this.store.compareAndSet(done, snap.stateVersion);
          let final = (await this.store.get(ctx.executionId, ctx.organizationId))!;
          if (final.status === "SUCCEEDED" && !ctx.skipGovernance) {
            final = await this.applyExecutionLevelGovernance(plan, ctx, final);
          }
          this.logTerminal(ctx, final);
          return final;
        }

        // Claim and run up to available slots
        const batch: string[] = [];
        for (const id of readyIds) {
          if (!limiter.tryAcquire()) break;
          batch.push(id);
        }

        if (batch.length === 0) {
          await new Promise((r) => setTimeout(r, 10));
          continue;
        }

        // Claim entire wave in one CAS, then run runners concurrently.
        const claimAt = ctx.nowIso();
        let claimSnap = await this.store.get(ctx.executionId, ctx.organizationId);
        if (!claimSnap || claimSnap.cancelRequested) continue;

        const claimTokenBase = `${ctx.workerId}:${claimAt}`;
        const claimedIds: string[] = [];
        {
          let tasks = [...claimSnap.tasks];
          const events = [...claimSnap.events];
          for (const taskId of batch) {
            const idx = tasks.findIndex((t) => t.taskId === taskId);
            if (idx < 0) continue;
            const node = tasks[idx]!;
            if (node.status !== "READY" && node.status !== "RETRYING") continue;
            const attempt = node.attempt + 1;
            const claimToken = `${claimTokenBase}:${taskId}`;
            tasks[idx] = transitionNode(node, "RUNNING", claimAt, {
              attempt,
              claimedBy: ctx.workerId,
              claimToken,
              startedAt: claimAt,
              attempts: [
                ...node.attempts,
                { attempt, startedAt: claimAt, status: "RUNNING" },
              ],
            });
            claimedIds.push(taskId);
            pushEvent(events, "task.started", claimAt, taskId, `attempt=${attempt}`);
            logOsExecutionEvent("task_graph.task.started", {
              requestId: ctx.requestId,
              executionId: ctx.executionId,
              organizationId: ctx.organizationId,
              taskId,
              status: "RUNNING",
              planId: claimSnap.planId,
              planVersion: claimSnap.planVersion,
            });
          }
          if (!claimedIds.length) {
            for (const _ of batch) limiter.release();
            continue;
          }
          const nextClaim: TaskGraphRunSnapshot = {
            ...claimSnap,
            tasks,
            events,
            status: "RUNNING",
            updatedAt: claimAt,
            stateVersion: claimSnap.stateVersion + 1,
          };
          const saved = await this.store.compareAndSet(
            nextClaim,
            claimSnap.stateVersion
          );
          if (!saved) {
            for (const _ of batch) limiter.release();
            continue;
          }
          claimSnap = nextClaim;
        }

        await Promise.all(
          claimedIds.map(async (taskId) => {
            try {
              await this.runClaimedTask(plan, ctx, taskId, claimSnap!);
            } finally {
              limiter.release();
            }
          })
        );
      }
    } finally {
      this.activeWorkers.delete(workerKey);
    }
  }

  private async runClaimedTask(
    plan: ExecutionPlan,
    ctx: RunLoopCtx,
    taskId: string,
    claimedSnap: TaskGraphRunSnapshot
  ): Promise<void> {
    const node = claimedSnap.tasks.find((t) => t.taskId === taskId);
    if (!node?.claimToken) return;
    const claimToken = node.claimToken;
    const attempt = node.attempt;

    const taskDef = plan.tasks.find((t) => t.taskId === taskId);
    if (!taskDef) {
      await this.failTask(ctx, taskId, claimToken, {
        errorCode: "TASK_EXECUTION_FAILED",
        errorMessage: "Task definition missing from plan",
        failureClass: "fatal",
        retryable: false,
      });
      return;
    }

    const cap = taskDef.requiredCapabilities[0];
    if (!cap || !this.deps.capabilityRegistry.exists(asCapabilityId(cap))) {
      await this.failTask(ctx, taskId, claimToken, {
        errorCode: "CAPABILITY_UNRESOLVED",
        errorMessage: `Capability unresolved: ${cap}`,
        failureClass: "capability",
        retryable: false,
      });
      return;
    }

    const upstreamPreviews = predecessorsOf(plan, taskId)
      .map((pid) => {
        const n = claimedSnap.tasks.find((t) => t.taskId === pid);
        return n?.outputRef?.preview
          ? `[${n.taskKey}] ${n.outputRef.preview}`
          : undefined;
      })
      .filter((x): x is string => Boolean(x));

    const abort = this.abortByExecution.get(ctx.executionId)?.signal;
    const result = await this.deps.runner.run({
      executionId: ctx.executionId,
      organizationId: ctx.organizationId,
      requestId: ctx.requestId,
      planId: plan.id,
      planVersion: plan.planVersion,
      task: taskDef,
      attempt,
      upstreamPreviews,
      briefObjective: ctx.briefObjective,
      brandTone: ctx.brandTone,
      knowledgeFactSummary: ctx.knowledgeFactSummary,
      brandId: ctx.brandId,
      abortSignal: abort,
    });

    if (result.asyncPending || result.executionMode === "ASYNC") {
      await this.markTaskAsyncPending(ctx, taskId, claimToken, {
        externalJobRef: result.externalJobRef ?? `ext_${taskId}_${attempt}`,
      });
      return;
    }

    if (result.ok) {
      const gov = this.governance;
      if (gov && !ctx.skipGovernance) {
        const finalized = gov.finalizeTask({
          organizationId: ctx.organizationId,
          executionId: ctx.executionId,
          planId: plan.id,
          planVersion: plan.planVersion,
          taskId,
          taskKey: taskDef.taskKey,
          taskType: taskDef.type,
          objective: taskDef.objective,
          outputContractId: taskDef.outputRequirements.outputContractId,
          preview: result.preview ?? "",
          briefObjective: ctx.briefObjective,
          brandTone: ctx.brandTone,
          brandVoice: ctx.brandVoice,
          brandAvoidTerms: ctx.brandAvoidTerms,
          prohibitedPatterns: ctx.prohibitedPatterns,
          requiredSections: taskDef.outputRequirements.requiredSections,
          nowIso: ctx.nowIso,
        });

        if (finalized.signal === "RETRY") {
          await this.failTask(ctx, taskId, claimToken, {
            errorCode: "GOVERNANCE_RETRY",
            errorMessage: finalized.decision.reason,
            failureClass: "validation",
            retryable: true,
            providerId: result.providerId,
            modelId: result.modelId,
          });
          return;
        }
        if (finalized.signal === "BLOCK" || finalized.signal === "REJECT") {
          await this.failTask(ctx, taskId, claimToken, {
            errorCode:
              finalized.signal === "BLOCK"
                ? "GOVERNANCE_BLOCK"
                : "GOVERNANCE_REJECT",
            errorMessage: finalized.decision.reason,
            failureClass: "validation",
            retryable: false,
            providerId: result.providerId,
            modelId: result.modelId,
          });
          return;
        }
        if (finalized.signal === "PAUSE_HUMAN_REVIEW") {
          await this.succeedTask(ctx, taskId, claimToken, {
            preview: result.preview ?? "",
            outputContractId: taskDef.outputRequirements.outputContractId,
            artifactIds: result.artifactIds,
            providerId: result.providerId,
            modelId: result.modelId,
          });
          await this.markRunPaused(ctx, finalized.decision.decisionId, "HUMAN_REVIEW");
          this.abortByExecution.get(ctx.executionId)?.abort();
          return;
        }
      }

      await this.succeedTask(ctx, taskId, claimToken, {
        preview: result.preview ?? "",
        outputContractId: taskDef.outputRequirements.outputContractId,
        artifactIds: result.artifactIds,
        providerId: result.providerId,
        modelId: result.modelId,
      });
      return;
    }

    await this.failTask(ctx, taskId, claimToken, {
      errorCode: result.errorCode ?? "TASK_EXECUTION_FAILED",
      errorMessage: result.errorMessage ?? "task failed",
      failureClass: result.failureClass ?? "transient",
      retryable: result.retryable,
      providerId: result.providerId,
      modelId: result.modelId,
    });
  }

  private async markTaskAsyncPending(
    ctx: {
      organizationId: string;
      executionId: string;
      requestId: string;
      nowIso: () => string;
    },
    taskId: string,
    claimToken: string,
    pending: { externalJobRef: string }
  ): Promise<void> {
    for (let i = 0; i < 8; i++) {
      const at = ctx.nowIso();
      const snap = await this.store.get(ctx.executionId, ctx.organizationId);
      if (!snap) return;
      const idx = snap.tasks.findIndex((t) => t.taskId === taskId);
      if (idx < 0) return;
      const node = snap.tasks[idx]!;
      if (node.claimToken !== claimToken || node.status !== "RUNNING") return;
      const tasks = [...snap.tasks];
      tasks[idx] = {
        ...node,
        executionMode: "ASYNC",
        externalJobRef: pending.externalJobRef,
        heartbeatAt: at,
        updatedAt: at,
      };
      const events = [...snap.events];
      pushEvent(events, "task.async_pending", at, taskId, pending.externalJobRef);
      const next: TaskGraphRunSnapshot = {
        ...snap,
        tasks,
        events,
        status: "RUNNING",
        updatedAt: at,
        stateVersion: snap.stateVersion + 1,
      };
      const ok = await this.store.compareAndSet(next, snap.stateVersion);
      if (!ok) continue;
      logOsExecutionEvent("task_graph.task.async_pending", {
        requestId: ctx.requestId,
        executionId: ctx.executionId,
        organizationId: ctx.organizationId,
        taskId,
        status: "RUNNING",
        planId: snap.planId,
      });
      return;
    }
  }

  private async succeedTask(
    ctx: {
      organizationId: string;
      executionId: string;
      requestId: string;
      nowIso: () => string;
    },
    taskId: string,
    claimToken: string,
    output: {
      preview: string;
      outputContractId: string;
      artifactIds?: readonly string[];
      providerId?: string;
      modelId?: string;
    }
  ): Promise<void> {
    for (let i = 0; i < 8; i++) {
      const at = ctx.nowIso();
      const snap = await this.store.get(ctx.executionId, ctx.organizationId);
      if (!snap) return;
      const idx = snap.tasks.findIndex((t) => t.taskId === taskId);
      if (idx < 0) return;
      const node = snap.tasks[idx]!;
      if (node.claimToken !== claimToken || node.status !== "RUNNING") {
        return;
      }

      const outputRef: TaskOutputReference = {
        outputRefId: `out_${taskId}_${node.attempt}`,
        taskId,
        executionId: ctx.executionId,
        outputContractId: output.outputContractId,
        preview: output.preview.slice(0, 2000),
        artifactIds: output.artifactIds,
        createdAt: at,
      };

      const attempts = [...node.attempts];
      const last = attempts[attempts.length - 1];
      if (last) {
        attempts[attempts.length - 1] = {
          ...last,
          finishedAt: at,
          status: "SUCCEEDED",
          providerId: output.providerId,
          modelId: output.modelId,
        };
      }

      const tasks = [...snap.tasks];
      tasks[idx] = transitionNode(node, "SUCCEEDED", at, {
        finishedAt: at,
        outputRef,
        claimedBy: undefined,
        claimToken: undefined,
        attempts,
        errorCode: undefined,
        errorMessage: undefined,
      });
      const events = [...snap.events];
      pushEvent(events, "task.succeeded", at, taskId);
      const status = deriveRunStatus(tasks);
      const next: TaskGraphRunSnapshot = {
        ...snap,
        tasks,
        events,
        status: status === "PENDING" ? "RUNNING" : status,
        updatedAt: at,
        stateVersion: snap.stateVersion + 1,
        completedAt: status !== "RUNNING" && status !== "PENDING" ? at : undefined,
      };
      const ok = await this.store.compareAndSet(next, snap.stateVersion);
      if (!ok) continue;

      logOsExecutionEvent("task_graph.task.succeeded", {
        requestId: ctx.requestId,
        executionId: ctx.executionId,
        organizationId: ctx.organizationId,
        taskId,
        status: "SUCCEEDED",
        planId: snap.planId,
      });
      return;
    }
  }

  private async failTask(
    ctx: {
      organizationId: string;
      executionId: string;
      requestId: string;
      nowIso: () => string;
    },
    taskId: string,
    claimToken: string,
    failure: {
      errorCode: string;
      errorMessage: string;
      failureClass: TaskNodeState["failureClass"];
      retryable: boolean;
      providerId?: string;
      modelId?: string;
    }
  ): Promise<void> {
    for (let i = 0; i < 8; i++) {
      const at = ctx.nowIso();
      const snap = await this.store.get(ctx.executionId, ctx.organizationId);
      if (!snap) return;
      if (snap.cancelRequested) return;

      const idx = snap.tasks.findIndex((t) => t.taskId === taskId);
      if (idx < 0) return;
      const node = snap.tasks[idx]!;
      if (node.claimToken !== claimToken || node.status !== "RUNNING") return;

      const attempts = [...node.attempts];
      const last = attempts[attempts.length - 1];
      if (last) {
        attempts[attempts.length - 1] = {
          ...last,
          finishedAt: at,
          status: "FAILED",
          errorCode: failure.errorCode,
          errorMessage: failure.errorMessage,
          failureClass: failure.failureClass,
          providerId: failure.providerId,
          modelId: failure.modelId,
        };
      }

      let nextNode = transitionNode(node, "FAILED", at, {
        finishedAt: at,
        errorCode: failure.errorCode,
        errorMessage: failure.errorMessage,
        failureClass: failure.failureClass,
        claimedBy: undefined,
        claimToken: undefined,
        attempts,
      });

      const events = [...snap.events];
      pushEvent(events, "task.failed", at, taskId, failure.errorCode);

      const canRetry =
        failure.retryable &&
        nextNode.attempt < nextNode.maxAttempts &&
        (failure.errorCode === "GOVERNANCE_RETRY" ||
          (failure.failureClass !== "contract" &&
            failure.failureClass !== "tenant" &&
            failure.failureClass !== "capability" &&
            failure.failureClass !== "validation" &&
            failure.failureClass !== "fatal" &&
            failure.failureClass !== "cancelled"));

      if (canRetry) {
        nextNode = transitionNode(nextNode, "RETRYING", at);
        pushEvent(events, "task.retrying", at, taskId, `attempt=${nextNode.attempt}`);
        logOsExecutionEvent("task_graph.task.retrying", {
          requestId: ctx.requestId,
          executionId: ctx.executionId,
          organizationId: ctx.organizationId,
          taskId,
          status: "RETRYING",
          planId: snap.planId,
          errorCode: failure.errorCode,
        });
      } else {
        logOsExecutionEvent("task_graph.task.failed", {
          requestId: ctx.requestId,
          executionId: ctx.executionId,
          organizationId: ctx.organizationId,
          taskId,
          status: "FAILED",
          planId: snap.planId,
          errorCode: failure.errorCode,
        });
      }

      const tasks = [...snap.tasks];
      tasks[idx] = nextNode;
      const status = deriveRunStatus(tasks);
      const next: TaskGraphRunSnapshot = {
        ...snap,
        tasks,
        events,
        status: status === "PENDING" ? "RUNNING" : status,
        updatedAt: at,
        stateVersion: snap.stateVersion + 1,
        completedAt:
          status !== "RUNNING" && status !== "PENDING" ? at : undefined,
      };
      const ok = await this.store.compareAndSet(next, snap.stateVersion);
      if (!ok) continue;
      return;
    }
  }

  private async markRunPaused(
    ctx: RunLoopCtx,
    decisionId: string,
    reason: string
  ): Promise<void> {
    for (let i = 0; i < 8; i++) {
      const snap = await this.store.get(ctx.executionId, ctx.organizationId);
      if (!snap) return;
      if (snap.status === "PAUSED") return;
      const at = ctx.nowIso();
      const events = [...snap.events];
      pushEvent(events, "execution.paused_human_review", at, undefined, reason);
      const next: TaskGraphRunSnapshot = {
        ...snap,
        status: "PAUSED",
        approvalStatus: "HUMAN_REVIEW",
        lastGovernanceAction: "HUMAN_REVIEW",
        lastGovernanceDecisionId: decisionId,
        events,
        updatedAt: at,
        stateVersion: snap.stateVersion + 1,
      };
      const ok = await this.store.compareAndSet(next, snap.stateVersion);
      if (ok) {
        logOsExecutionEvent("task_graph.execution.paused", {
          requestId: ctx.requestId,
          executionId: ctx.executionId,
          organizationId: ctx.organizationId,
          status: "PAUSED",
          planId: snap.planId,
        });
        return;
      }
    }
  }

  private async applyExecutionLevelGovernance(
    plan: ExecutionPlan,
    ctx: RunLoopCtx,
    snap: TaskGraphRunSnapshot
  ): Promise<TaskGraphRunSnapshot> {
    const gov = this.governance;
    if (!gov) return snap;

    const taskResults = snap.tasks
      .filter((t) => t.status === "SUCCEEDED" && t.outputRef)
      .map((t) => ({
        taskId: t.taskId,
        taskKey: t.taskKey,
        preview: t.outputRef!.preview ?? "",
        outputContractId: t.outputRef!.outputContractId,
      }));

    const finalized = gov.finalizeExecution({
      organizationId: ctx.organizationId,
      executionId: ctx.executionId,
      planId: plan.id,
      planVersion: plan.planVersion,
      objective: ctx.briefObjective ?? plan.objective ?? "execution",
      taskResults,
      brandTone: ctx.brandTone,
      nowIso: ctx.nowIso,
    });

    let approvalStatus: ExecutionApprovalStatus = "PENDING";
    let status = snap.status;
    if (finalized.signal === "APPROVE" || finalized.signal === "CONTINUE") {
      approvalStatus = "APPROVED";
    } else if (finalized.signal === "BLOCK") {
      approvalStatus = "BLOCKED";
      status = "BLOCKED";
    } else if (finalized.signal === "REJECT") {
      approvalStatus = "REJECTED";
      status = "FAILED";
    } else if (finalized.signal === "PAUSE_HUMAN_REVIEW") {
      approvalStatus = "HUMAN_REVIEW";
      status = "PAUSED";
    }

    const at = ctx.nowIso();
    const events = [...snap.events];
    pushEvent(
      events,
      "execution.governance",
      at,
      undefined,
      `${finalized.decision.action}:${finalized.decision.reason}`
    );

    const next: TaskGraphRunSnapshot = {
      ...snap,
      status,
      approvalStatus,
      lastGovernanceAction: finalized.decision.action,
      lastGovernanceDecisionId: finalized.decision.decisionId,
      events,
      updatedAt: at,
      stateVersion: snap.stateVersion + 1,
      completedAt:
        status === "PAUSED" ? undefined : snap.completedAt ?? at,
    };
    const ok = await this.store.compareAndSet(next, snap.stateVersion);
    if (!ok) {
      return (await this.store.get(ctx.executionId, ctx.organizationId)) ?? next;
    }
    return next;
  }

  async applyHumanReviewDecision(input: {
    readonly organizationId: string;
    readonly executionId: string;
    readonly reviewId: string;
    readonly decision: "APPROVED" | "REJECTED" | "REQUEST_CHANGES";
    readonly reviewer: string;
    readonly comments?: string;
    readonly plan: ExecutionPlan;
    readonly requestId?: string;
    readonly nowIso?: () => string;
  }): Promise<TaskGraphRunSnapshot> {
    this.assertTenant({
      organizationId: input.organizationId,
      executionId: input.executionId,
      plan: input.plan,
    });
    const gov = this.governance;
    if (!gov) {
      throw new TaskGraphExecutorError(
        "GOVERNANCE_DISABLED",
        "Human review requires governance finalize service"
      );
    }
    const nowIso = input.nowIso ?? (() => new Date().toISOString());
    const review = await gov.getHumanReviewStore().decide({
      reviewId: input.reviewId,
      organizationId: input.organizationId,
      decision: input.decision,
      reviewer: input.reviewer,
      comments: input.comments,
      nowIso,
    });

    const snap = await this.store.get(input.executionId, input.organizationId);
    if (!snap) {
      throw new TaskGraphExecutorError("RUN_NOT_FOUND", "No run for review");
    }

    const at = nowIso();
    const events = [...snap.events];
    pushEvent(events, "human_review.decided", at, review.taskId, review.status);

    if (input.decision === "REJECTED") {
      const next: TaskGraphRunSnapshot = {
        ...snap,
        status: "FAILED",
        approvalStatus: "REJECTED",
        lastGovernanceAction: "REJECT",
        events,
        updatedAt: at,
        completedAt: at,
        stateVersion: snap.stateVersion + 1,
      };
      await this.store.compareAndSet(next, snap.stateVersion);
      return (await this.store.get(input.executionId, input.organizationId))!;
    }

    if (input.decision === "REQUEST_CHANGES") {
      if (review.taskId) {
        gov.invalidateTaskFinalization({
          organizationId: input.organizationId,
          executionId: input.executionId,
          taskId: review.taskId,
        });
      }
      let tasks = [...snap.tasks];
      if (review.taskId) {
        const idx = tasks.findIndex((t) => t.taskId === review.taskId);
        if (idx >= 0 && tasks[idx]!.status === "SUCCEEDED") {
          const n = tasks[idx]!;
          tasks[idx] = transitionNode(n, "RETRYING", at, {
            attempt: Math.max(0, n.attempt - 1),
            errorCode: "REQUEST_CHANGES",
            errorMessage: input.comments ?? "Human requested changes",
            outputRef: undefined,
            finishedAt: undefined,
            claimedBy: undefined,
            claimToken: undefined,
          });
        }
      }
      const next: TaskGraphRunSnapshot = {
        ...snap,
        status: "RUNNING",
        approvalStatus: "PENDING",
        tasks,
        events,
        updatedAt: at,
        completedAt: undefined,
        stateVersion: snap.stateVersion + 1,
      };
      await this.store.compareAndSet(next, snap.stateVersion);
      return this.resume({
        organizationId: input.organizationId,
        executionId: input.executionId,
        requestId: input.requestId ?? input.executionId,
        plan: input.plan,
        nowIso,
      });
    }

    // APPROVED — if work already complete, seal approval; else resume remaining tasks
    const pendingWork = snap.tasks.some(
      (t) =>
        t.status === "PENDING" ||
        t.status === "READY" ||
        t.status === "RETRYING" ||
        t.status === "RUNNING"
    );
    if (!pendingWork) {
      const sealed: TaskGraphRunSnapshot = {
        ...snap,
        status: "SUCCEEDED",
        approvalStatus: "APPROVED",
        lastGovernanceAction: "APPROVE",
        events,
        updatedAt: at,
        completedAt: at,
        stateVersion: snap.stateVersion + 1,
      };
      await this.store.compareAndSet(sealed, snap.stateVersion);
      return (await this.store.get(input.executionId, input.organizationId))!;
    }

    const next: TaskGraphRunSnapshot = {
      ...snap,
      status: "RUNNING",
      approvalStatus: "APPROVED",
      lastGovernanceAction: "APPROVE",
      events,
      updatedAt: at,
      completedAt: undefined,
      stateVersion: snap.stateVersion + 1,
    };
    await this.store.compareAndSet(next, snap.stateVersion);
    return this.resume({
      organizationId: input.organizationId,
      executionId: input.executionId,
      requestId: input.requestId ?? input.executionId,
      plan: input.plan,
      nowIso,
    });
  }

  private logTerminal(
    ctx: { requestId: string; executionId: string; organizationId: string },
    final: TaskGraphRunSnapshot
  ): void {
    const type =
      final.status === "SUCCEEDED"
        ? "task_graph.execution.succeeded"
        : final.status === "CANCELLED"
          ? "task_graph.execution.cancelled"
          : final.status === "PAUSED"
            ? "task_graph.execution.paused"
            : "task_graph.execution.failed";
    logOsExecutionEvent(type, {
      requestId: ctx.requestId,
      executionId: ctx.executionId,
      organizationId: ctx.organizationId,
      status: final.status,
      planId: final.planId,
      planVersion: final.planVersion,
      taskCount: final.tasks.length,
    });
  }
}

export function createTaskGraphExecutorEngine(options: {
  readonly runner: ITaskCapabilityRunner;
  readonly capabilityRegistry: ICapabilityRegistry;
  readonly outputContractRegistry?: IOutputContractRegistry;
  readonly store?: ITaskGraphRunStore;
  readonly defaultMaxConcurrency?: number;
  readonly defaultMaxAttempts?: number;
  readonly governanceFinalize?: GovernanceFinalizeService;
  readonly enableGovernance?: boolean;
  readonly executeMode?: "in_process" | "queued";
  readonly onTasksReady?: (input: {
    readonly snapshot: TaskGraphRunSnapshot;
    readonly readyTaskIds: readonly string[];
  }) => Promise<void>;
}): ITaskGraphExecutorEngine {
  return new TaskGraphExecutorEngine(options);
}
