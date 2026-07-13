/**
 * Execution runtime.
 *
 * Purpose: Platform-level execution session manager for approved plans.
 * Responsibilities: create/execute/monitor/cancel/pause/resume/get/dispose.
 * Usage: Constructed with store, events, id/clock ports.
 * Future Extension: Orchestrator integration (still no provider SDKs here).
 */

import { randomUUID } from "crypto";
import type { ExecutionPlan } from "../../execution-planning/contracts/execution-plan";
import { asExecutionId } from "../../shared/identifiers";
import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { ExecutionMetrics } from "../contracts/execution-metrics";
import type { ExecutionSnapshot } from "../contracts/execution-snapshot";
import type { IExecutionSession } from "../contracts/execution-session";
import { ExecutionNotFoundError, ExecutionRuntimeError } from "../errors";
import type { IExecutionEventPublisher } from "../events/execution-event-publisher";
import { ExecutionEventTypes } from "../events/execution-event-types";
import type {
  CreateSessionInput,
  IExecutionRuntime,
} from "../interfaces/execution-runtime";
import { ExecutionMonitor } from "../monitor/execution-monitor";
import { ExecutionSession } from "../session/execution-session";
import type { IExecutionStore } from "../store/execution-store";

export interface ExecutionRuntimeDependencies {
  readonly store: IExecutionStore;
  readonly events: IExecutionEventPublisher;
  readonly nowIso?: () => string;
  readonly createSessionId?: () => string;
}

export class ExecutionRuntime implements IExecutionRuntime {
  private readonly sessions = new Map<string, ExecutionSession>();
  private disposed = false;
  private readonly nowIso: () => string;
  private readonly createSessionId: () => string;

  constructor(private readonly deps: ExecutionRuntimeDependencies) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.createSessionId =
      deps.createSessionId ?? (() => `exec_${randomUUID()}`);
  }

  async createSession(
    input: CreateSessionInput
  ): Promise<Result<IExecutionSession>> {
    this.assertNotDisposed();
    const planCheck = this.validatePlan(input.plan);
    if (!planCheck.ok) {
      return planCheck;
    }

    const sessionId = this.createSessionId();
    const context = {
      ...input.context,
      executionId: input.context.executionId || asExecutionId(sessionId),
    };

    const session = new ExecutionSession({
      sessionId,
      context,
      plan: input.plan,
      store: this.deps.store,
      events: this.deps.events,
      monitor: new ExecutionMonitor(this.nowIso),
      nowIso: this.nowIso,
    });

    this.sessions.set(sessionId, session);

    await this.deps.events.publish(ExecutionEventTypes.EXECUTION_CREATED, {
      sessionId,
      executionId: String(context.executionId),
      state: session.state,
      planId: input.plan.planId,
    });

    return success(session);
  }

  async executePlan(
    input: CreateSessionInput
  ): Promise<Result<IExecutionSession>> {
    const created = await this.createSession(input);
    if (!created.ok) {
      return created;
    }

    try {
      await created.value.start();
      await created.value.runToCompletion();
      return success(created.value);
    } catch (error) {
      return failure(
        error instanceof ExecutionRuntimeError
          ? error
          : new ExecutionRuntimeError("Failed to execute plan", {
              cause: error,
            })
      );
    }
  }

  async monitorExecution(
    sessionId: string
  ): Promise<Result<ExecutionMetrics>> {
    const session = this.requireSession(sessionId);
    if (!session.ok) {
      return session;
    }
    return success(session.value.metrics);
  }

  async cancelExecution(
    sessionId: string,
    reason?: string
  ): Promise<Result<void>> {
    const session = this.requireSession(sessionId);
    if (!session.ok) {
      return session;
    }
    try {
      await session.value.cancel(reason);
      return success(undefined);
    } catch (error) {
      return failure(
        error instanceof ExecutionRuntimeError
          ? error
          : new ExecutionRuntimeError("Failed to cancel execution", {
              cause: error,
            })
      );
    }
  }

  async pauseExecution(sessionId: string): Promise<Result<void>> {
    const session = this.requireSession(sessionId);
    if (!session.ok) {
      return session;
    }
    try {
      // Pause only works mid-flight; placeholder start completes immediately.
      // Transition to running then pause is not applicable after complete.
      // For tests: if already completed, fail with clear error.
      await session.value.pause();
      return success(undefined);
    } catch (error) {
      return failure(
        error instanceof ExecutionRuntimeError
          ? error
          : new ExecutionRuntimeError("Failed to pause execution", {
              cause: error,
            })
      );
    }
  }

  async resumeExecution(sessionId: string): Promise<Result<void>> {
    const session = this.requireSession(sessionId);
    if (!session.ok) {
      return session;
    }
    try {
      await session.value.resume();
      return success(undefined);
    } catch (error) {
      return failure(
        error instanceof ExecutionRuntimeError
          ? error
          : new ExecutionRuntimeError("Failed to resume execution", {
              cause: error,
            })
      );
    }
  }

  async getExecution(sessionId: string): Promise<Result<ExecutionSnapshot>> {
    if (this.disposed) {
      return failure(
        new ExecutionRuntimeError("Execution runtime has been disposed")
      );
    }
    const session = this.requireSession(sessionId);
    if (!session.ok) {
      return session;
    }
    return success(session.value.snapshot());
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const session of this.sessions.values()) {
      if (
        session.state !== "completed" &&
        session.state !== "failed" &&
        session.state !== "cancelled" &&
        session.state !== "timed_out"
      ) {
        await session.cancel("runtime_disposed");
      }
    }
    this.sessions.clear();
    this.deps.store.clear();
  }

  private requireSession(
    sessionId: string
  ): Result<ExecutionSession> {
    this.assertNotDisposed();
    const session = this.sessions.get(sessionId);
    if (!session) {
      return failure(
        new ExecutionNotFoundError("Execution session not found", {
          sessionId,
        })
      );
    }
    return success(session);
  }

  private validatePlan(plan: ExecutionPlan): Result<ExecutionPlan> {
    if (!plan.planId || !plan.graph?.nodes?.length) {
      return failure(
        new ExecutionRuntimeError("Invalid execution plan", {
          planId: plan.planId,
        })
      );
    }
    return success(plan);
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new ExecutionRuntimeError("Execution runtime has been disposed");
    }
  }
}
