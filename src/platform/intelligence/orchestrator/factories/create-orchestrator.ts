/**
 * Factory for IntelligenceOrchestrator.
 */

import type { IExecutionRuntime } from "../../execution-runtime/interfaces/execution-runtime";
import type { ILogger } from "../../shared/interfaces";
import { ResultAggregator } from "../aggregation/result-aggregator";
import { ExecutionDispatcher } from "../dispatcher/execution-dispatcher";
import { FailureCoordinator } from "../failure/failure-coordinator";
import { HookManager } from "../hooks/hook-manager";
import type { IIntelligenceOrchestrator } from "../interfaces/intelligence-orchestrator";
import { IntelligenceOrchestrator } from "../intelligence-orchestrator";
import { MiddlewarePipeline } from "../middleware/middleware-pipeline";
import {
  createAuditingMiddleware,
  createLoggingMiddleware,
  createMetricsMiddleware,
  createSecurityMiddleware,
  createTracingMiddleware,
} from "../middleware/placeholder-middleware";
import { ExecutionValidator } from "../pipeline/execution-validator";
import { RuntimeInitializer } from "../pipeline/runtime-initializer";

export interface CreateOrchestratorOptions {
  readonly runtime: IExecutionRuntime;
  readonly logger?: ILogger;
  readonly includeDefaultMiddleware?: boolean;
}

export function createIntelligenceOrchestrator(
  options: CreateOrchestratorOptions
): IIntelligenceOrchestrator {
  const middleware = new MiddlewarePipeline();
  if (options.includeDefaultMiddleware !== false) {
    middleware.use(createLoggingMiddleware(options.logger));
    middleware.use(createMetricsMiddleware(options.logger));
    middleware.use(createSecurityMiddleware(options.logger));
    middleware.use(createTracingMiddleware(options.logger));
    middleware.use(createAuditingMiddleware(options.logger));
  }

  return new IntelligenceOrchestrator({
    validator: new ExecutionValidator(),
    runtimeInitializer: new RuntimeInitializer(),
    dispatcher: new ExecutionDispatcher(options.runtime),
    runtime: options.runtime,
    aggregator: new ResultAggregator(),
    failureCoordinator: new FailureCoordinator(),
    middleware,
    hooks: new HookManager(),
  });
}

export interface CreateOrchestratorWithHooksOptions
  extends CreateOrchestratorOptions {
  readonly hooks?: HookManager;
}

export function createIntelligenceOrchestratorWithHooks(
  options: CreateOrchestratorWithHooksOptions
): { orchestrator: IIntelligenceOrchestrator; hooks: HookManager } {
  const hooks = options.hooks ?? new HookManager();
  const middleware = new MiddlewarePipeline();
  if (options.includeDefaultMiddleware !== false) {
    middleware.use(createLoggingMiddleware(options.logger));
    middleware.use(createMetricsMiddleware(options.logger));
    middleware.use(createSecurityMiddleware(options.logger));
    middleware.use(createTracingMiddleware(options.logger));
    middleware.use(createAuditingMiddleware(options.logger));
  }

  const orchestrator = new IntelligenceOrchestrator({
    validator: new ExecutionValidator(),
    runtimeInitializer: new RuntimeInitializer(),
    dispatcher: new ExecutionDispatcher(options.runtime),
    runtime: options.runtime,
    aggregator: new ResultAggregator(),
    failureCoordinator: new FailureCoordinator(),
    middleware,
    hooks,
  });

  return { orchestrator, hooks };
}
