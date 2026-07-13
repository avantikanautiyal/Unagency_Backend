/**
 * Placeholder planning strategies.
 *
 * Purpose: Deterministic defaults for M1.4 without AI or SDK calls.
 * Responsibilities: Resolve capability, select provider, estimate cost, build linear graph.
 * Usage: Wired via ExecutionPlanningEngine factory.
 * Future Extension: Replace with learned/policy-driven strategies.
 */

import type { ICapabilityRegistry } from "../../../capability-registry/interfaces/capability-registry";
import type { CapabilityDefinition } from "../../../capability-registry/contracts/capability-definition";
import type { IProviderRegistry } from "../../../providers/registry/provider-registry";
import type { IProviderCapabilityMatrix } from "../../../providers/capability-matrix/interfaces/provider-capability-matrix";
import type { IPolicyEngine } from "../../../policies/interfaces/policies";
import type { ProviderId } from "../../../shared/identifiers";
import { failure, success } from "../../../shared/result";
import type { Result } from "../../../shared/result";
import type { CapabilityRequest } from "../../contracts/capability-request";
import type {
  ExecutionEdge,
  ExecutionGraph,
  ExecutionNode,
  ExecutionStage,
} from "../../contracts/execution-graph";
import type { ExecutionCostEstimate } from "../../contracts/execution-metadata";
import type {
  BudgetPlan,
  EvaluationPlan,
  ExecutionPolicyPlan,
  HumanReviewPlan,
  ProviderSelectionPlan,
  RetryPlan,
  RoutingConstraintsPlan,
  TimeoutPlan,
} from "../../contracts/execution-plan";
import type { ExecutionMode } from "../../contracts/execution-mode";
import type { ExecutionStrategy } from "../../contracts/execution-strategy";
import type { PlanningContext } from "../../contracts/planning-context";
import { PlanningError, PlanningValidationError } from "../../errors";
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
} from "../interfaces/strategies";

export class DefaultCapabilityResolver implements ICapabilityResolver {
  constructor(private readonly registry: ICapabilityRegistry) {}

  async resolve(
    request: CapabilityRequest
  ): Promise<Result<CapabilityDefinition>> {
    const resolved = this.registry.resolve(request.capabilityId, {
      version: request.capabilityVersion,
      channel: request.capabilityVersion ? undefined : "latest",
    });
    if (!resolved.ok) {
      return resolved;
    }
    if (resolved.value.status === "disabled") {
      return failure(
        new PlanningValidationError("Capability is disabled", {
          capabilityId: request.capabilityId,
        })
      );
    }
    if (resolved.value.status === "archived") {
      return failure(
        new PlanningValidationError("Capability is archived", {
          capabilityId: request.capabilityId,
        })
      );
    }
    return resolved;
  }
}

export class DefaultPolicyResolver implements IPolicyResolver {
  constructor(private readonly policies?: IPolicyEngine) {}

  async resolve(context: PlanningContext): Promise<Result<PlanningContext>> {
    if (!this.policies || !context.capability) {
      return success({
        ...context,
        policyDecisions: [{ allowed: true, reason: "no_policy_engine" }],
      });
    }

    const policyContext = {
      organizationId: context.request.organizationId,
      workspaceId: context.request.workspaceId,
      attributes: context.request.inputHints,
    };

    const capabilityDecision = await this.policies.capabilities.evaluate(
      policyContext,
      context.capability.id
    );
    const executionDecision = await this.policies.execution.evaluate(
      policyContext,
      context.request.inputHints
    );

    if (!capabilityDecision.allowed || !executionDecision.allowed) {
      return failure(
        new PlanningValidationError("Policy denied capability execution", {
          capabilityDecision,
          executionDecision,
        })
      );
    }

    return success({
      ...context,
      policyDecisions: [capabilityDecision, executionDecision],
    });
  }
}

export class DefaultProviderSelectionStrategy
  implements IProviderSelectionStrategy
{
  constructor(
    private readonly providers: IProviderRegistry,
    private readonly matrix: IProviderCapabilityMatrix
  ) {}

  async select(
    context: PlanningContext
  ): Promise<Result<ProviderSelectionPlan>> {
    const capability = context.capability;
    if (!capability) {
      return failure(new PlanningError("Capability not resolved"));
    }

    const healthy = this.providers.listHealthyProviders();
    const compatible = capability.providerCompatibility.compatibleProviderIds;
    const requiredFeatures =
      capability.constraints.requiredProviderFeatures?.features ?? [];

    let candidates = healthy;
    if (compatible.length > 0) {
      const allowed = new Set(compatible.map(String));
      candidates = candidates.filter((p) => allowed.has(String(p.id)));
    }

    if (capability.defaultProvider) {
      const preferred = candidates.find(
        (p) => String(p.id) === String(capability.defaultProvider)
      );
      if (preferred) {
        candidates = [
          preferred,
          ...candidates.filter((p) => p.id !== preferred.id),
        ];
      }
    }

    if (requiredFeatures.length > 0) {
      candidates = candidates.filter((provider) => {
        const profile = this.matrix.get(provider.id);
        if (!profile.ok) return false;
        return requiredFeatures.every((feature) => {
          const key = feature as keyof typeof profile.value.features;
          return profile.value.features[key] === true;
        });
      });
    }

    if (candidates.length === 0) {
      return failure(
        new PlanningError("No healthy compatible provider available", {
          capabilityId: capability.id,
        })
      );
    }

    const primary = candidates[0]!;
    const fallbacks = [
      ...capability.fallbackProviders,
      ...candidates.slice(1).map((c) => c.id),
    ].filter(
      (id, index, all) =>
        String(id) !== String(primary.id) &&
        all.findIndex((x) => String(x) === String(id)) === index
    ) as ProviderId[];

    return success({
      primaryProviderId: primary.id,
      fallbackProviderIds: fallbacks,
      selectionReason: "healthy_compatible_default_first",
    });
  }
}

export class DefaultModelSelectionStrategy implements IModelSelectionStrategy {
  async select(
    context: PlanningContext
  ): Promise<Result<string | undefined>> {
    const modelId =
      typeof context.capability?.metadata.defaultModelId === "string"
        ? context.capability.metadata.defaultModelId
        : undefined;
    return success(modelId);
  }
}

export class DefaultCostEstimationStrategy implements ICostEstimationStrategy {
  async estimate(
    context: PlanningContext
  ): Promise<Result<ExecutionCostEstimate>> {
    const maxCost = context.capability?.costLimit.maxCost;
    const maxTokens = context.capability?.costLimit.maxTokens;
    return success({
      estimatedCost: maxCost,
      estimatedTokens: maxTokens,
      currency: context.capability?.costLimit.currency ?? "USD",
      confidence: 0.3,
    });
  }
}

export class DefaultRetryStrategy implements IRetryStrategy {
  async plan(context: PlanningContext): Promise<Result<RetryPlan>> {
    const retry = context.capability?.retryPolicy;
    return success({
      maxAttempts: retry?.maxAttempts ?? 0,
      backoffMs: retry?.backoffMs ?? 0,
      strategy: retry?.strategy ?? "none",
    });
  }
}

export class DefaultTimeoutStrategy implements ITimeoutStrategy {
  async plan(context: PlanningContext): Promise<Result<TimeoutPlan>> {
    return success({
      timeoutMs: context.capability?.timeout.timeoutMs ?? 60_000,
    });
  }
}

export class DefaultHumanReviewStrategy implements IHumanReviewStrategy {
  async plan(context: PlanningContext): Promise<Result<HumanReviewPlan>> {
    const review = context.capability?.humanReviewPolicy;
    const constraintRequired =
      context.capability?.constraints.humanReviewRequired?.required === true;
    return success({
      required: review?.required === true || constraintRequired,
      reason:
        review?.reason ??
        context.capability?.constraints.humanReviewRequired?.reason,
    });
  }
}

export class DefaultEvaluationStrategy implements IEvaluationStrategy {
  async plan(context: PlanningContext): Promise<Result<EvaluationPlan>> {
    const evaluation = context.capability?.evaluationStrategy;
    return success({
      enabled: evaluation?.enabled ?? false,
      sampleRate: evaluation?.sampleRate,
      criteria: evaluation?.criteria,
    });
  }
}

export class DefaultRoutingStrategy implements IRoutingStrategy {
  async plan(context: PlanningContext): Promise<
    Result<{
      routingConstraints: RoutingConstraintsPlan;
      executionStrategy: ExecutionStrategy;
      executionMode: ExecutionMode;
      budget: BudgetPlan;
      executionPolicy: ExecutionPolicyPlan;
    }>
  > {
    const humanReviewRequired =
      context.humanReview?.required === true ||
      context.capability?.humanReviewPolicy.required === true;

    const hasFallbacks =
      (context.providerSelection?.fallbackProviderIds.length ?? 0) > 0;

    const executionStrategy: ExecutionStrategy = humanReviewRequired
      ? "human_gated"
      : hasFallbacks
        ? "fallback_chain"
        : "direct";

    const policyRefs = [
      context.capability?.policies.executionPolicy?.policyId,
      context.capability?.policies.retryPolicy?.policyId,
      context.capability?.policies.costPolicy?.policyId,
    ].filter((value): value is string => Boolean(value));

    return success({
      routingConstraints: {
        requiredFeatures:
          context.capability?.constraints.requiredProviderFeatures?.features ??
          [],
        excludedProviderIds: [],
      },
      executionStrategy,
      executionMode: "sequential",
      budget: {
        maxCost: context.capability?.costLimit.maxCost,
        maxTokens: context.capability?.costLimit.maxTokens,
        currency: context.capability?.costLimit.currency,
      },
      executionPolicy: {
        policyRefs,
      },
    });
  }
}

export class DefaultExecutionGraphBuilder implements IExecutionGraphBuilder {
  async build(context: PlanningContext): Promise<Result<ExecutionGraph>> {
    if (!context.providerSelection || !context.capability) {
      return failure(
        new PlanningError("Cannot build graph without provider selection")
      );
    }

    const providerId = context.providerSelection.primaryProviderId;
    const capabilityNodeId = "node_capability";
    const providerNodeId = "node_provider";
    const reviewNodeId = "node_human_review";
    const exitNodeId = "node_exit";

    const nodes: ExecutionNode[] = [
      {
        id: capabilityNodeId,
        kind: "capability",
        label: context.capability.name,
        stageId: "stage_main",
        order: 0,
      },
      {
        id: providerNodeId,
        kind: "provider",
        label: String(providerId),
        providerId,
        stageId: "stage_main",
        order: 1,
      },
    ];

    const edges: ExecutionEdge[] = [
      {
        id: "edge_cap_to_provider",
        fromNodeId: capabilityNodeId,
        toNodeId: providerNodeId,
      },
    ];

    let lastNodeId = providerNodeId;
    let order = 2;

    if (context.humanReview?.required) {
      nodes.push({
        id: reviewNodeId,
        kind: "human_review",
        label: "human_review",
        stageId: "stage_review",
        order,
      });
      edges.push({
        id: "edge_provider_to_review",
        fromNodeId: providerNodeId,
        toNodeId: reviewNodeId,
      });
      lastNodeId = reviewNodeId;
      order += 1;
    }

    nodes.push({
      id: exitNodeId,
      kind: "gate",
      label: "exit",
      stageId: "stage_exit",
      order,
    });
    edges.push({
      id: "edge_to_exit",
      fromNodeId: lastNodeId,
      toNodeId: exitNodeId,
    });

    const stages: ExecutionStage[] = [
      {
        id: "stage_main",
        name: "main",
        mode: "sequential",
        order: 0,
        nodeIds: [capabilityNodeId, providerNodeId],
      },
    ];

    if (context.humanReview?.required) {
      stages.push({
        id: "stage_review",
        name: "review",
        mode: "sequential",
        order: 1,
        nodeIds: [reviewNodeId],
      });
    }

    stages.push({
      id: "stage_exit",
      name: "exit",
      mode: "sequential",
      order: stages.length,
      nodeIds: [exitNodeId],
    });

    return success({
      entryNodeId: capabilityNodeId,
      exitNodeId,
      nodes,
      edges,
      stages,
    });
  }
}
