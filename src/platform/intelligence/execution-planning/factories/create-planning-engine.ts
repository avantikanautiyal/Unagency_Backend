/**
 * Factory for ExecutionPlanningEngine with default placeholder strategies.
 *
 * Purpose: Wire planning engine using only ports (constructor injection).
 * Responsibilities: Compose default strategies from registry/matrix/policy ports.
 * Usage: Callers supply interface implementations from frozen modules.
 * Future Extension: Custom strategy overrides.
 */

import type { ICapabilityRegistry } from "../../capability-registry/interfaces/capability-registry";
import type { IPolicyEngine } from "../../policies/interfaces/policies";
import type { IProviderCapabilityMatrix } from "../../providers/capability-matrix/interfaces/provider-capability-matrix";
import type { IProviderRegistry } from "../../providers/registry/provider-registry";
import { ExecutionPlanningEngine } from "../engine/execution-planning-engine";
import type { IExecutionPlanningEngine } from "../interfaces/execution-planning-engine";
import {
  DefaultCapabilityResolver,
  DefaultCostEstimationStrategy,
  DefaultEvaluationStrategy,
  DefaultExecutionGraphBuilder,
  DefaultHumanReviewStrategy,
  DefaultModelSelectionStrategy,
  DefaultPolicyResolver,
  DefaultProviderSelectionStrategy,
  DefaultRetryStrategy,
  DefaultRoutingStrategy,
  DefaultTimeoutStrategy,
} from "../strategies/placeholders/default-strategies";

export interface CreatePlanningEngineOptions {
  readonly capabilityRegistry: ICapabilityRegistry;
  readonly providerRegistry: IProviderRegistry;
  readonly providerCapabilityMatrix: IProviderCapabilityMatrix;
  readonly policyEngine?: IPolicyEngine;
}

export function createExecutionPlanningEngine(
  options: CreatePlanningEngineOptions
): IExecutionPlanningEngine {
  return new ExecutionPlanningEngine({
    capabilityResolver: new DefaultCapabilityResolver(
      options.capabilityRegistry
    ),
    policyResolver: new DefaultPolicyResolver(options.policyEngine),
    providerSelectionStrategy: new DefaultProviderSelectionStrategy(
      options.providerRegistry,
      options.providerCapabilityMatrix
    ),
    modelSelectionStrategy: new DefaultModelSelectionStrategy(),
    costEstimationStrategy: new DefaultCostEstimationStrategy(),
    retryStrategy: new DefaultRetryStrategy(),
    timeoutStrategy: new DefaultTimeoutStrategy(),
    humanReviewStrategy: new DefaultHumanReviewStrategy(),
    evaluationStrategy: new DefaultEvaluationStrategy(),
    routingStrategy: new DefaultRoutingStrategy(),
    graphBuilder: new DefaultExecutionGraphBuilder(),
    providerRegistry: options.providerRegistry,
  });
}
