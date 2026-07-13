/**
 * Placeholder middleware for logging, metrics, security, tracing, auditing.
 * No side effects beyond optional logger callbacks.
 */

import type { ILogger } from "../../shared/interfaces";
import type { Result } from "../../shared/result";
import type { OrchestratorContext } from "../contracts/orchestrator-context";
import type { OrchestrationResult } from "../contracts/orchestration-result";
import type {
  IOrchestrationMiddleware,
  MiddlewareNext,
} from "./middleware";

function createPassthrough(
  name: string,
  kind: IOrchestrationMiddleware["kind"],
  logger?: ILogger
): IOrchestrationMiddleware {
  return {
    name,
    kind,
    async invoke(
      context: OrchestratorContext,
      next: MiddlewareNext
    ): Promise<Result<OrchestrationResult>> {
      logger?.debug(`orchestrator.middleware.${name}.before`, {
        orchestrationId: context.orchestrationId,
        planId: context.plan.planId,
      });
      const result = await next();
      logger?.debug(`orchestrator.middleware.${name}.after`, {
        orchestrationId: context.orchestrationId,
        ok: result.ok,
      });
      return result;
    },
  };
}

export function createLoggingMiddleware(logger?: ILogger): IOrchestrationMiddleware {
  return createPassthrough("logging", "logging", logger);
}

export function createMetricsMiddleware(logger?: ILogger): IOrchestrationMiddleware {
  return createPassthrough("metrics", "metrics", logger);
}

export function createSecurityMiddleware(logger?: ILogger): IOrchestrationMiddleware {
  return createPassthrough("security", "security", logger);
}

export function createTracingMiddleware(logger?: ILogger): IOrchestrationMiddleware {
  return createPassthrough("tracing", "tracing", logger);
}

export function createAuditingMiddleware(logger?: ILogger): IOrchestrationMiddleware {
  return createPassthrough("auditing", "auditing", logger);
}
