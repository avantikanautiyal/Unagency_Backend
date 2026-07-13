/**
 * Execution planning engine.
 *
 * Purpose: Produce an immutable ExecutionPlan from a CapabilityRequest.
 * Responsibilities: Run the planning pipeline via injected strategies.
 * Usage: Constructed with strategy interfaces only (constructor injection).
 * Future Extension: Parallel strategy evaluation, plan explainability.
 */

import { randomUUID } from "crypto";
import type { CapabilityDefinition } from "../../capability-registry/contracts/capability-definition";
import type { ProviderDefinition } from "../../providers/metadata/provider-definition";
import type { IProviderRegistry } from "../../providers/registry/provider-registry";
import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { CapabilityRequest } from "../contracts/capability-request";
import type { ExecutionPlan } from "../contracts/execution-plan";
import type { PlanningContext } from "../contracts/planning-context";
import { PlanningValidationError } from "../errors";
import type { IExecutionPlanningEngine } from "../interfaces/execution-planning-engine";
import type {
  ICapabilityResolver,
  ICostEstimationStrategy,
  IEvaluationStrategy,
  IExecutionGraphBuilder,
  IHumanReviewStrategy,
  IModelSelectionStrategy,
  IPolicyResolver,
  IProviderSelectionStrategy,
  IRetryStrategy,
  IRoutingStrategy,
  ITimeoutStrategy,
} from "../strategies/interfaces/strategies";
import { validateExecutionPlan } from "./graph-validation";

export interface ExecutionPlanningEngineDependencies {
  readonly capabilityResolver: ICapabilityResolver;
  readonly policyResolver: IPolicyResolver;
  readonly providerSelectionStrategy: IProviderSelectionStrategy;
  readonly modelSelectionStrategy: IModelSelectionStrategy;
  readonly costEstimationStrategy: ICostEstimationStrategy;
  readonly retryStrategy: IRetryStrategy;
  readonly timeoutStrategy: ITimeoutStrategy;
  readonly humanReviewStrategy: IHumanReviewStrategy;
  readonly evaluationStrategy: IEvaluationStrategy;
  readonly routingStrategy: IRoutingStrategy;
  readonly graphBuilder: IExecutionGraphBuilder;
  readonly providerRegistry: IProviderRegistry;
  readonly nowIso?: () => string;
  readonly createPlanId?: () => string;
}

export class ExecutionPlanningEngine implements IExecutionPlanningEngine {
  private readonly nowIso: () => string;
  private readonly createPlanId: () => string;

  constructor(private readonly deps: ExecutionPlanningEngineDependencies) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.createPlanId = deps.createPlanId ?? (() => `plan_${randomUUID()}`);
  }

  validateRequest(request: CapabilityRequest): Result<CapabilityRequest> {
    const issues: string[] = [];
    if (!request.capabilityId) issues.push("capabilityId is required");
    if (!request.organizationId) issues.push("organizationId is required");
    if (!request.workspaceId) issues.push("workspaceId is required");

    if (issues.length > 0) {
      return failure(
        new PlanningValidationError("Invalid capability request", { issues })
      );
    }
    return success(request);
  }

  createPlanningContext(request: CapabilityRequest): PlanningContext {
    return {
      request,
      candidateProviders: [],
      policyDecisions: [],
      priority: request.priority ?? "normal",
      createdAt: this.nowIso(),
    };
  }

  async resolveCapability(
    request: CapabilityRequest
  ): Promise<Result<CapabilityDefinition>> {
    return this.deps.capabilityResolver.resolve(request);
  }

  async applyPolicies(
    context: PlanningContext
  ): Promise<Result<PlanningContext>> {
    return this.deps.policyResolver.resolve(context);
  }

  async selectProvider(
    context: PlanningContext
  ): Promise<Result<PlanningContext>> {
    const selection = await this.deps.providerSelectionStrategy.select(context);
    if (!selection.ok) {
      return selection;
    }

    const model = await this.deps.modelSelectionStrategy.select({
      ...context,
      providerSelection: selection.value,
    });
    if (!model.ok) {
      return model;
    }

    return success({
      ...context,
      providerSelection: {
        ...selection.value,
        modelId: model.value,
      },
      modelId: model.value,
      candidateProviders: this.resolveCandidateProviders(selection.value),
    });
  }

  async estimateCost(
    context: PlanningContext
  ): Promise<Result<PlanningContext>> {
    const estimate = await this.deps.costEstimationStrategy.estimate(context);
    if (!estimate.ok) {
      return estimate;
    }
    return success({ ...context, costEstimate: estimate.value });
  }

  async determineExecutionMode(
    context: PlanningContext
  ): Promise<Result<PlanningContext>> {
    const retry = await this.deps.retryStrategy.plan(context);
    if (!retry.ok) return retry;

    const timeout = await this.deps.timeoutStrategy.plan(context);
    if (!timeout.ok) return timeout;

    const humanReview = await this.deps.humanReviewStrategy.plan(context);
    if (!humanReview.ok) return humanReview;

    const evaluation = await this.deps.evaluationStrategy.plan(context);
    if (!evaluation.ok) return evaluation;

    const routing = await this.deps.routingStrategy.plan({
      ...context,
      retry: retry.value,
      timeout: timeout.value,
      humanReview: humanReview.value,
      evaluation: evaluation.value,
    });
    if (!routing.ok) return routing;

    return success({
      ...context,
      retry: retry.value,
      timeout: timeout.value,
      humanReview: humanReview.value,
      evaluation: evaluation.value,
      routingConstraints: routing.value.routingConstraints,
      executionStrategy: routing.value.executionStrategy,
      executionMode: routing.value.executionMode,
      budget: routing.value.budget,
      executionPolicy: routing.value.executionPolicy,
    });
  }

  async buildExecutionGraph(
    context: PlanningContext
  ): Promise<Result<PlanningContext>> {
    const graph = await this.deps.graphBuilder.build(context);
    if (!graph.ok) {
      return graph;
    }
    return success({
      ...context,
      // graph carried only into final plan; context stays strategy-focused
    });
  }

  async produceExecutionPlan(
    request: CapabilityRequest
  ): Promise<Result<ExecutionPlan>> {
    const validated = this.validateRequest(request);
    if (!validated.ok) {
      return validated;
    }

    let context = this.createPlanningContext(validated.value);

    const capability = await this.resolveCapability(validated.value);
    if (!capability.ok) {
      return capability;
    }
    context = { ...context, capability: capability.value };

    const withPolicies = await this.applyPolicies(context);
    if (!withPolicies.ok) {
      return withPolicies;
    }
    context = withPolicies.value;

    const withProvider = await this.selectProvider(context);
    if (!withProvider.ok) {
      return withProvider;
    }
    context = withProvider.value;

    const withCost = await this.estimateCost(context);
    if (!withCost.ok) {
      return withCost;
    }
    context = withCost.value;

    const withMode = await this.determineExecutionMode(context);
    if (!withMode.ok) {
      return withMode;
    }
    context = withMode.value;

    const graph = await this.deps.graphBuilder.build(context);
    if (!graph.ok) {
      return graph;
    }

    const planId = this.createPlanId();
    const plan: ExecutionPlan = {
      planId,
      capabilityId: capability.value.id,
      capabilityVersion: capability.value.version,
      executionStrategy: context.executionStrategy ?? "direct",
      executionMode: context.executionMode ?? "sequential",
      priority: context.priority,
      providerSelection: context.providerSelection!,
      retry: context.retry!,
      timeout: context.timeout!,
      budget: context.budget!,
      evaluation: context.evaluation!,
      humanReview: context.humanReview!,
      executionPolicy: context.executionPolicy!,
      routingConstraints: context.routingConstraints!,
      graph: graph.value,
      metadata: {
        planId,
        capabilityId: capability.value.id,
        capabilityVersion: capability.value.version,
        primaryProviderId: context.providerSelection!.primaryProviderId,
        fallbackProviderIds: context.providerSelection!.fallbackProviderIds,
        strategy: context.executionStrategy ?? "direct",
        priority: context.priority,
        costEstimate: context.costEstimate ?? {},
        createdAt: context.createdAt,
        correlationId: request.correlationId,
      },
    };

    return validateExecutionPlan(plan);
  }

  private resolveCandidateProviders(
    selection: NonNullable<PlanningContext["providerSelection"]>
  ): readonly ProviderDefinition[] {
    const ids = [
      selection.primaryProviderId,
      ...selection.fallbackProviderIds,
    ];
    const providers: ProviderDefinition[] = [];
    for (const id of ids) {
      const resolved = this.deps.providerRegistry.resolveProvider(id);
      if (resolved.ok) {
        providers.push(resolved.value);
      }
    }
    return providers;
  }
}
