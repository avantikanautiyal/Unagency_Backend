/**
 * Execution session.
 *
 * Purpose: Own lifecycle transitions for a single plan execution.
 * Responsibilities: start/pause/resume/cancel/fail/complete/snapshot.
 * Usage: Created by ExecutionRuntime; does not call providers.
 * Future Extension: Node-level progress callbacks.
 */

import type { ExecutionPlan } from "../../execution-planning/contracts/execution-plan";
import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import { CancellationSource } from "../cancellation/cancellation-source";
import type { CancellationToken } from "../contracts/cancellation-token";
import type { ExecutionLifecyclePhase } from "../contracts/execution-lifecycle";
import type { ExecutionMetrics } from "../contracts/execution-metrics";
import type { ExecutionResult } from "../contracts/execution-result";
import type { ExecutionRuntimeContext } from "../contracts/execution-runtime-context";
import type {
  ExecutionSessionRecord,
  IExecutionSession,
} from "../contracts/execution-session";
import type { ExecutionSnapshot } from "../contracts/execution-snapshot";
import type { ExecutionState } from "../contracts/execution-state";
import { isTerminalExecutionState } from "../contracts/execution-state";
import { ExecutionRuntimeError } from "../errors";
import type { IExecutionEventPublisher } from "../events/execution-event-publisher";
import { ExecutionEventTypes } from "../events/execution-event-types";
import type { IExecutionMonitor } from "../monitor/execution-monitor";
import { ExecutionStateMachine } from "../state-machine/execution-state-machine";
import type { IExecutionStore } from "../store/execution-store";

export interface ExecutionSessionDependencies {
  readonly sessionId: string;
  readonly context: ExecutionRuntimeContext;
  readonly plan: ExecutionPlan;
  readonly store: IExecutionStore;
  readonly events: IExecutionEventPublisher;
  readonly monitor: IExecutionMonitor;
  readonly nowIso: () => string;
}

export class ExecutionSession implements IExecutionSession {
  readonly sessionId: string;
  readonly context: ExecutionRuntimeContext;
  readonly plan: ExecutionPlan;

  private readonly stateMachine: ExecutionStateMachine;
  private readonly cancellationSource: CancellationSource;
  private readonly store: IExecutionStore;
  private readonly events: IExecutionEventPublisher;
  private readonly monitor: IExecutionMonitor;
  private readonly nowIso: () => string;
  private lifecyclePhase: ExecutionLifecyclePhase = "idle";
  private result?: ExecutionResult;
  private currentNodeId?: string;
  private readonly createdAt: string;

  constructor(deps: ExecutionSessionDependencies) {
    this.sessionId = deps.sessionId;
    this.context = deps.context;
    this.plan = deps.plan;
    this.store = deps.store;
    this.events = deps.events;
    this.monitor = deps.monitor;
    this.nowIso = deps.nowIso;
    this.stateMachine = new ExecutionStateMachine("created");
    this.cancellationSource = new CancellationSource();
    this.createdAt = deps.nowIso();
    this.currentNodeId = deps.plan.graph.entryNodeId;
    this.monitor.setState("created");
    this.persist();
  }

  get state(): ExecutionState {
    return this.stateMachine.state;
  }

  get metrics(): ExecutionMetrics {
    return this.monitor.metrics;
  }

  get cancellation(): CancellationToken {
    return this.cancellationSource.token;
  }

  async start(): Promise<void> {
    this.assertNotTerminal();
    this.lifecyclePhase = "starting";
    this.transition("queued");
    this.transition("preparing");
    this.transition("running");
    this.lifecyclePhase = "active";
    this.monitor.markStarted();
    this.monitor.setProgress(0.1);
    this.currentNodeId = this.plan.graph.entryNodeId;
    this.persist();

    await this.events.publish(ExecutionEventTypes.EXECUTION_STARTED, {
      sessionId: this.sessionId,
      executionId: String(this.context.executionId),
      state: this.state,
      planId: this.plan.planId,
    });
  }

  /**
   * Placeholder run: walk plan nodes without provider calls, then complete.
   */
  async runToCompletion(): Promise<void> {
    if (this.state !== "running") {
      throw new ExecutionRuntimeError(
        "runToCompletion requires a running session",
        { state: this.state }
      );
    }
    await this.runPlaceholder();
  }

  async pause(): Promise<void> {
    this.assertNotTerminal();
    if (this.state !== "running" && this.state !== "waiting") {
      throw new ExecutionRuntimeError("Can only pause running or waiting sessions", {
        state: this.state,
      });
    }
    this.lifecyclePhase = "pausing";
    this.transition("paused");
    this.lifecyclePhase = "active";
    this.persist();
    await this.events.publish(ExecutionEventTypes.EXECUTION_PAUSED, {
      sessionId: this.sessionId,
      executionId: String(this.context.executionId),
      state: this.state,
      planId: this.plan.planId,
    });
  }

  async resume(): Promise<void> {
    this.assertNotTerminal();
    if (this.state !== "paused") {
      throw new ExecutionRuntimeError("Can only resume paused sessions", {
        state: this.state,
      });
    }
    this.lifecyclePhase = "resuming";
    this.transition("running");
    this.lifecyclePhase = "active";
    this.persist();
    await this.events.publish(ExecutionEventTypes.EXECUTION_RESUMED, {
      sessionId: this.sessionId,
      executionId: String(this.context.executionId),
      state: this.state,
      planId: this.plan.planId,
    });
    await this.runPlaceholder();
  }

  async cancel(reason?: string): Promise<void> {
    if (isTerminalExecutionState(this.state)) {
      return;
    }
    this.lifecyclePhase = "cancelling";
    this.cancellationSource.cancel(reason);
    this.transition("cancelled");
    this.lifecyclePhase = "finishing";
    this.monitor.markCompleted();
    this.monitor.setHealth("degraded");
    this.result = {
      sessionId: this.sessionId,
      state: "cancelled",
      success: false,
      message: reason ?? "cancelled",
      completedAt: this.nowIso(),
    };
    this.persist();
    await this.events.publish(ExecutionEventTypes.EXECUTION_CANCELLED, {
      sessionId: this.sessionId,
      executionId: String(this.context.executionId),
      state: this.state,
      planId: this.plan.planId,
      message: reason,
    });
  }

  async fail(
    message: string,
    errorCode?: string,
    output?: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    if (isTerminalExecutionState(this.state)) {
      return;
    }
    this.lifecyclePhase = "finishing";
    this.transition("failed");
    this.monitor.markCompleted();
    this.monitor.setHealth("unhealthy");
    this.result = {
      sessionId: this.sessionId,
      state: "failed",
      success: false,
      message,
      errorCode,
      ...(output ? { output } : {}),
      completedAt: this.nowIso(),
    };
    this.persist();
    await this.events.publish(ExecutionEventTypes.EXECUTION_FAILED, {
      sessionId: this.sessionId,
      executionId: String(this.context.executionId),
      state: this.state,
      planId: this.plan.planId,
      message,
    });
  }

  async complete(output?: Readonly<Record<string, unknown>>): Promise<void> {
    if (isTerminalExecutionState(this.state)) {
      return;
    }
    this.lifecyclePhase = "finishing";
    this.transition("completed");
    this.monitor.setProgress(1);
    this.monitor.markCompleted();
    this.currentNodeId = this.plan.graph.exitNodeId;
    this.result = {
      sessionId: this.sessionId,
      state: "completed",
      success: true,
      message: "placeholder_completed",
      output: output ?? { placeholder: true },
      completedAt: this.nowIso(),
    };
    this.persist();
    await this.events.publish(ExecutionEventTypes.EXECUTION_COMPLETED, {
      sessionId: this.sessionId,
      executionId: String(this.context.executionId),
      state: this.state,
      planId: this.plan.planId,
    });
  }

  snapshot(): ExecutionSnapshot {
    return {
      sessionId: this.sessionId,
      state: this.state,
      context: this.context,
      plan: this.plan,
      metrics: this.metrics,
      result: this.result,
      currentNodeId: this.currentNodeId,
      capturedAt: this.nowIso(),
    };
  }

  toRecord(): ExecutionSessionRecord {
    return {
      sessionId: this.sessionId,
      context: this.context,
      plan: this.plan,
      state: this.state,
      lifecyclePhase: this.lifecyclePhase,
      metrics: this.metrics,
      cancellation: this.cancellation,
      result: this.result,
      currentNodeId: this.currentNodeId,
      createdAt: this.createdAt,
      updatedAt: this.metrics.updatedAt,
    };
  }

  private async runPlaceholder(): Promise<void> {
    if (this.shouldStopPlaceholder()) {
      return;
    }

    const nodes = [...this.plan.graph.nodes].sort((a, b) => a.order - b.order);
    for (const node of nodes) {
      if (this.shouldStopPlaceholder()) {
        return;
      }
      this.currentNodeId = node.id;
      this.monitor.setProgress((node.order + 1) / Math.max(nodes.length, 1));
      this.persist();
    }

    if (!this.shouldStopPlaceholder() && this.stateMachine.state === "running") {
      await this.complete({ placeholder: true, nodesVisited: nodes.length });
    }
  }

  private shouldStopPlaceholder(): boolean {
    const state = this.stateMachine.state;
    return this.cancellationSource.token.cancelled || state === "paused";
  }

  private transition(to: ExecutionState): void {
    const result = this.stateMachine.transition(to);
    if (!result.ok) {
      throw result.error;
    }
    this.monitor.setState(to);
  }

  private persist(): void {
    this.store.save(this.toRecord());
  }

  private assertNotTerminal(): void {
    if (isTerminalExecutionState(this.state)) {
      throw new ExecutionRuntimeError("Session is already terminal", {
        state: this.state,
        sessionId: this.sessionId,
      });
    }
  }
}

export function tryStartSession(
  session: ExecutionSession
): Promise<Result<void>> {
  return session
    .start()
    .then(() => success(undefined))
    .catch((error: unknown) =>
      failure(
        error instanceof ExecutionRuntimeError
          ? error
          : new ExecutionRuntimeError("Failed to start session", {
              cause: error,
            })
      )
    );
}
