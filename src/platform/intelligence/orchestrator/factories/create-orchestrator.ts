/**
 * Factory for IntelligenceOrchestrator.
 */

import type { IExecutionRuntime } from "../../execution-runtime/interfaces/execution-runtime";
import type { IIntelligenceOsIntegrationEngine } from "../../integration/interfaces/integration";
import type { ILogger } from "../../shared/interfaces";
import { ResultAggregator } from "../aggregation/result-aggregator";
import { ExecutionDispatcher } from "../dispatcher/execution-dispatcher";
import { IntegrationDispatcher } from "../dispatcher/integration-dispatcher";
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
  /**
   * When provided, the orchestrator routes through the production 13-stage
   * integration pipeline instead of the placeholder runtime walker.
   */
  readonly integration?: IIntelligenceOsIntegrationEngine;
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

  // Use IntegrationDispatcher when a production pipeline is provided,
  // otherwise fall back to the placeholder ExecutionDispatcher.
  const dispatcher = options.integration
    ? new IntegrationDispatcher(options.integration, options.runtime)
    : new ExecutionDispatcher(options.runtime);

  return new IntelligenceOrchestrator({
    validator: new ExecutionValidator(),
    runtimeInitializer: new RuntimeInitializer(),
    dispatcher,
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

  const dispatcherWithHooks = options.integration
    ? new IntegrationDispatcher(options.integration, options.runtime)
    : new ExecutionDispatcher(options.runtime);

  const orchestrator = new IntelligenceOrchestrator({
    validator: new ExecutionValidator(),
    runtimeInitializer: new RuntimeInitializer(),
    dispatcher: dispatcherWithHooks,
    runtime: options.runtime,
    aggregator: new ResultAggregator(),
    failureCoordinator: new FailureCoordinator(),
    middleware,
    hooks,
  });

  return { orchestrator, hooks };
}
