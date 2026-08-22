/**
 * Intelligence Orchestrator.
 *
 * Purpose: Coordinate approved ExecutionPlan lifecycle without planning or provider execution.
 * Responsibilities: Pipeline through validator → initializer → dispatcher → runtime → aggregator.
 * Usage: Constructed via createIntelligenceOrchestrator factory.
 * Future Extension: Parallel dispatch, real retry/fallback execution.
 *
 * PHASE 0 — NOT THE PRODUCTION HTTP ORCHESTRATOR.
 * Production requests travel: Enterprise Gateway → ExecutionApiService → IntegrationPipeline.
 * This class belongs to the Kernel / IntelligenceGateway control-plane stack and is not
 * bootstrapped by app.ts. Do not treat it as a competing production authority.
 */

import { randomUUID } from "crypto";
import type { IExecutionRuntime } from "../execution-runtime/interfaces/execution-runtime";
import { failure, success } from "../shared/result";
import type { Result } from "../shared/result";
import type { IResultAggregator } from "./aggregation/result-aggregator";
import type { OrchestratorContext } from "./contracts/orchestrator-context";
import type { OrchestrationResult } from "./contracts/orchestration-result";
import type { IExecutionDispatcher } from "./dispatcher/execution-dispatcher";
import { OrchestratorError } from "./errors";
import type { IFailureCoordinator } from "./failure/failure-coordinator";
import type { IHookManager } from "./hooks/hooks";
import type {
  IIntelligenceOrchestrator,
  OrchestrateInput,
} from "./interfaces/intelligence-orchestrator";
import type { IMiddlewarePipeline } from "./middleware/middleware";
import type { IExecutionValidator } from "./pipeline/execution-validator";
import type { IRuntimeInitializer } from "./pipeline/runtime-initializer";

export interface IntelligenceOrchestratorDependencies {
  readonly validator: IExecutionValidator;
  readonly runtimeInitializer: IRuntimeInitializer;
  readonly dispatcher: IExecutionDispatcher;
  readonly runtime: IExecutionRuntime;
  readonly aggregator: IResultAggregator;
  readonly failureCoordinator: IFailureCoordinator;
  readonly middleware: IMiddlewarePipeline;
  readonly hooks: IHookManager;
  readonly nowIso?: () => string;
  readonly createOrchestrationId?: () => string;
}

export class IntelligenceOrchestrator implements IIntelligenceOrchestrator {
  private readonly nowIso: () => string;
  private readonly createOrchestrationId: () => string;

  constructor(private readonly deps: IntelligenceOrchestratorDependencies) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.createOrchestrationId =
      deps.createOrchestrationId ?? (() => `orch_${randomUUID()}`);
  }

  async orchestrate(
    input: OrchestrateInput
  ): Promise<Result<OrchestrationResult>> {
    const context: OrchestratorContext = {
      orchestrationId: this.createOrchestrationId(),
      plan: input.plan,
      runtimeContext: input.runtimeContext,
      attributes: input.attributes,
      startedAt: this.nowIso(),
    };

    await this.deps.hooks.emit("beforePlanExecution", { context });

    return this.deps.middleware.execute(context, async () =>
      this.runPipeline(context)
    );
  }

  private async runPipeline(
    context: OrchestratorContext
  ): Promise<Result<OrchestrationResult>> {
    const validated = this.deps.validator.validate(context.plan);
    if (!validated.ok) {
      await this.deps.hooks.emit("onFailure", {
        context,
        error: validated.error,
      });
      return validated;
    }

    const initialized = this.deps.runtimeInitializer.initialize({
      ...context,
      plan: validated.value,
    });
    if (!initialized.ok) {
      await this.deps.hooks.emit("onFailure", {
        context,
        error: initialized.error,
      });
      return initialized;
    }

    await this.deps.hooks.emit("beforeDispatch", { context });
    await this.deps.hooks.emit("beforeRuntime", { context });

    const dispatched = await this.deps.dispatcher.dispatch({
      plan: initialized.value.plan,
      runtimeContext: initialized.value.runtimeContext,
    });

    if (!dispatched.ok) {
      const decision = this.deps.failureCoordinator.coordinate({
        context,
        plan: context.plan,
        error: dispatched.error,
        attempt: 0,
      });

      await this.deps.hooks.emit("onFailure", {
        context,
        error: dispatched.error,
        attempt: 0,
      });

      if (decision.ok && decision.value.action === "retry") {
        await this.deps.hooks.emit("onRetry", {
          context,
          error: dispatched.error,
          attempt: decision.value.attempt,
        });
      }

      return failure(
        dispatched.error instanceof OrchestratorError
          ? dispatched.error
          : new OrchestratorError("Orchestration dispatch failed", {
              cause: dispatched.error,
              failureDecision: decision.ok ? decision.value : undefined,
            })
      );
    }

    const session = dispatched.value;
    const snapshotResult = await this.deps.runtime.getExecution(
      session.sessionId
    );
    const snapshot = snapshotResult.ok ? snapshotResult.value : undefined;
    const metricsResult = await this.deps.runtime.monitorExecution(
      session.sessionId
    );
    const metrics = metricsResult.ok ? metricsResult.value : undefined;

    await this.deps.hooks.emit("afterRuntime", { context, snapshot });

    const contributions = snapshot?.result ? [snapshot.result] : [];
    const aggregated = this.deps.aggregator.aggregate({
      orchestrationId: context.orchestrationId,
      planId: context.plan.planId,
      contributions,
      snapshot,
      metrics,
      completedAt: this.nowIso(),
    });

    if (!aggregated.ok) {
      await this.deps.hooks.emit("onFailure", {
        context,
        error: aggregated.error,
      });
      return aggregated;
    }

    await this.deps.hooks.emit("afterAggregation", {
      context,
      snapshot,
      result: aggregated.value,
    });
    await this.deps.hooks.emit("onComplete", {
      context,
      snapshot,
      result: aggregated.value,
    });

    return success(aggregated.value);
  }
}
