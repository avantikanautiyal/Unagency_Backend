/**
 * Provider routing engine.
 *
 * Purpose: Decide which provider(s) should execute — never executes providers.
 * Responsibilities: filter → score → rank → failover → experiments → plan.
 * Usage: Public entry point for routing decisions.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ValidationError } from "../../../shared/errors";
import { asRoutingDecisionId, asRoutingPlanId } from "../contracts/identifiers";
import type { RoutingRecommendation } from "../contracts/candidate";
import type { RoutingDecision, RoutingPlan } from "../contracts/plan";
import type { RoutingRequest } from "../contracts/request";
import type {
  IProviderRoutingEngine,
  IRoutingComplianceEngine,
  IRoutingDiagnostics,
  IRoutingEventPublisher,
  IRoutingExperimentEngine,
  IRoutingFailoverEngine,
  IRoutingLoadBalancer,
  IRoutingPreferenceResolver,
  IRoutingRanker,
  IRoutingScorer,
  IRoutingShadowEngine,
} from "../interfaces/routing";

export interface RoutingEngineDeps {
  readonly scorer: IRoutingScorer;
  readonly ranker: IRoutingRanker;
  readonly compliance: IRoutingComplianceEngine;
  readonly preferences: IRoutingPreferenceResolver;
  readonly failover: IRoutingFailoverEngine;
  readonly experiments: IRoutingExperimentEngine;
  readonly shadow: IRoutingShadowEngine;
  readonly loadBalancer: IRoutingLoadBalancer;
  readonly diagnostics: IRoutingDiagnostics;
  readonly eventPublisher?: IRoutingEventPublisher;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export class ProviderRoutingEngine implements IProviderRoutingEngine {
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;
  private readonly createId: (prefix: string) => string;

  constructor(private readonly deps: RoutingEngineDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
    this.createId = deps.createId ?? ((p) => `${p}_${Math.random().toString(36).slice(2)}`);
  }

  async route(request: RoutingRequest): Promise<Result<RoutingDecision>> {
    const start = this.clockMs();
    const invalid = this.validate(request);
    if (invalid) return failure(invalid);

    const pref = this.deps.preferences.resolve(
      request.candidates,
      request.preferences
    );
    if (!pref.ok) return pref;

    const filtered = this.deps.compliance.filter(
      pref.value,
      request.constraints
    );
    if (!filtered.ok) return filtered;
    if (filtered.value.length === 0) {
      return failure(
        new ValidationError("no routing candidates remain after filtering")
      );
    }

    const filteredRequest = { ...request, candidates: filtered.value };
    const scored = this.deps.scorer.scoreAll(filtered.value, filteredRequest);
    if (!scored.ok) return scored;

    const ranked = this.deps.ranker.rank(
      scored.value,
      request.strategy,
      filteredRequest
    );
    if (!ranked.ok) return ranked;

    const recommendations = this.toRecommendations(ranked.value, request.strategy);

    const primary =
      request.strategy === "multi_provider"
        ? (() => {
            const balanced = this.deps.loadBalancer.select(
              recommendations,
              filteredRequest
            );
            if (!balanced.ok) throw balanced.error;
            return balanced.value;
          })()
        : recommendations[0];

    const fallbacks = recommendations.filter(
      (r) => r.providerId !== primary.providerId
    );

    const failoverChain = this.deps.failover.buildChain(
      [primary, ...fallbacks],
      filteredRequest
    );
    if (!failoverChain.ok) return failoverChain;

    const experimentAssign = this.deps.experiments.assign(
      primary,
      fallbacks,
      filteredRequest
    );
    if (!experimentAssign.ok) return experimentAssign;

    const experiments = [...experimentAssign.value.experiments];
    const warnings = [...experimentAssign.value.warnings];

    if (request.strategy === "shadow") {
      const shadow = this.deps.shadow.assignShadow(primary, filtered.value);
      if (shadow.ok && shadow.value) {
        experiments.push(shadow.value);
      }
    }

    const durationMs = this.clockMs() - start;
    const plan: RoutingPlan = {
      planId: asRoutingPlanId(this.createId("plan")),
      requestId: request.requestId,
      capabilityId: request.capabilityId,
      primary,
      fallbacks,
      failoverChain: failoverChain.value,
      experiments,
      statistics: {
        candidatesEvaluated: request.candidates.length,
        candidatesFiltered: request.candidates.length - filtered.value.length,
        strategy: request.strategy,
        durationMs,
      },
      createdAt: this.nowIso(),
    };

    const decision: RoutingDecision = {
      decisionId: asRoutingDecisionId(this.createId("decision")),
      plan,
      strategy: request.strategy,
      scores: ranked.value,
      warnings,
      completedAt: this.nowIso(),
    };

    if (this.deps.eventPublisher) {
      await this.deps.eventPublisher.publishDecision(decision);
    }
    return success(decision);
  }

  async explain(request: RoutingRequest): Promise<Result<readonly import("../contracts/candidate").RoutingScore[]>> {
    const pref = this.deps.preferences.resolve(
      request.candidates,
      request.preferences
    );
    if (!pref.ok) return pref;
    const filtered = this.deps.compliance.filter(pref.value, request.constraints);
    if (!filtered.ok) return filtered;
    return this.deps.scorer.scoreAll(filtered.value, {
      ...request,
      candidates: filtered.value,
    });
  }

  private validate(request: RoutingRequest): ValidationError | undefined {
    if (!request.requestId) {
      return new ValidationError("routing request requires requestId");
    }
    if (!request.capabilityId) {
      return new ValidationError("routing request requires capabilityId");
    }
    if (!request.candidates.length) {
      return new ValidationError("routing request requires candidates");
    }
    return undefined;
  }

  private toRecommendations(
    ranked: readonly import("../contracts/candidate").RoutingScore[],
    strategy: RoutingRequest["strategy"]
  ): RoutingRecommendation[] {
    return ranked.map((score, i) => ({
      providerId: score.providerId,
      modelId: score.modelId,
      score,
      reason: `ranked #${score.rank ?? i + 1} via ${strategy}`,
      selected: i === 0,
    }));
  }
}
