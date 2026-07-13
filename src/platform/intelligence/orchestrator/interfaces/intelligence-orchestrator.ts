/**
 * Intelligence Orchestrator port.
 *
 * Purpose: Coordinate lifecycle of an approved ExecutionPlan.
 * Responsibilities: Validate, initialize runtime, dispatch, aggregate, handle failure hooks.
 * Usage: Future gateway entry after planning.
 * Future Extension: Multi-plan orchestration, saga compensation.
 */

import type { ExecutionPlan } from "../../execution-planning/contracts/execution-plan";
import type { ExecutionRuntimeContext } from "../../execution-runtime/contracts/execution-runtime-context";
import type { Result } from "../../shared/result";
import type { OrchestrationResult } from "../contracts/orchestration-result";

export interface OrchestrateInput {
  readonly plan: ExecutionPlan;
  readonly runtimeContext: ExecutionRuntimeContext;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface IIntelligenceOrchestrator {
  orchestrate(input: OrchestrateInput): Promise<Result<OrchestrationResult>>;
}
