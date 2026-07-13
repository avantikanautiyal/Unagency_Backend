/**
 * Orchestration middleware contracts.
 *
 * Purpose: Cross-cutting concerns around orchestration (logging, metrics, security, tracing, audit).
 * Responsibilities: Define middleware interface and pipeline.
 * Usage: Registered on MiddlewarePipeline; placeholders only in M1.6.
 * Future Extension: Real telemetry/security adapters.
 */

import type { Result } from "../../shared/result";
import type { OrchestratorContext } from "../contracts/orchestrator-context";
import type { OrchestrationResult } from "../contracts/orchestration-result";

export type MiddlewarePhase =
  | "before"
  | "after"
  | "onError";

export interface MiddlewareNext {
  (): Promise<Result<OrchestrationResult>>;
}

export interface IOrchestrationMiddleware {
  readonly name: string;
  readonly kind: "logging" | "metrics" | "security" | "tracing" | "auditing" | "custom";
  invoke(
    context: OrchestratorContext,
    next: MiddlewareNext
  ): Promise<Result<OrchestrationResult>>;
}

export interface IMiddlewarePipeline {
  use(middleware: IOrchestrationMiddleware): void;
  execute(
    context: OrchestratorContext,
    terminal: MiddlewareNext
  ): Promise<Result<OrchestrationResult>>;
}
