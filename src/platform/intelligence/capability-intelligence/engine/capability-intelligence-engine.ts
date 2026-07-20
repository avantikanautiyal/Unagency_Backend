/**
 * Capability Intelligence Engine
 *
 * Business Goal → Discovery → Composition → Dependencies → Graph → Bundle → Execution Plan
 */

import { failure, success, type Result } from "../../shared/result";
import { ValidationError } from "../../shared/errors";
import type { CapabilityIntelligenceRequest } from "../contracts/request";
import type { CapabilityIntelligenceReport } from "../contracts/result";
import type { CapabilityDefinitionRecord } from "../contracts/capability";
import { asCapabilityIntelligenceResultId } from "../contracts/identifiers";
import type {
  ICapabilityIntelligenceEngine,
  ICapabilityRegistry,
  ICapabilityDiscoverer,
  ICapabilityComposer,
  IDependencyResolver,
  ICapabilityScorer,
  IRecommendationBuilder,
  ICompatibilityChecker,
  IExecutionPlanBuilder,
} from "../interfaces/capability-intelligence";
import { buildMaturityReport, defaultEvolution } from "../lifecycle/lifecycle";

export interface CapabilityIntelligenceEngineDeps {
  readonly registry: ICapabilityRegistry;
  readonly discoverer: ICapabilityDiscoverer;
  readonly composer: ICapabilityComposer;
  readonly dependencies: IDependencyResolver;
  readonly scorer: ICapabilityScorer;
  readonly recommendations: IRecommendationBuilder;
  readonly compatibility: ICompatibilityChecker;
  readonly planBuilder: IExecutionPlanBuilder;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export class CapabilityIntelligenceEngine implements ICapabilityIntelligenceEngine {
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;
  private readonly createId: (prefix: string) => string;

  constructor(private readonly deps: CapabilityIntelligenceEngineDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
    this.createId = deps.createId ?? ((p) => `${p}_${Date.now()}`);
  }

  async plan(
    request: CapabilityIntelligenceRequest
  ): Promise<Result<CapabilityIntelligenceReport>> {
    const start = this.clockMs();
    const invalid = this.validate(request);
    if (invalid) return failure(invalid);

    const discovered = this.deps.discoverer.discover(this.deps.registry, request);
    if (!discovered.ok) return discovered;
    if (discovered.value.length === 0) {
      return failure(
        new ValidationError(
          "no capabilities discovered for business objective — refine objective or preferredCapabilityIds"
        )
      );
    }

    // Select top capabilities then expand dependencies into full set.
    const selectedSeeds = selectCapabilities(discovered.value, request);
    const depResult = this.deps.dependencies.resolve(selectedSeeds, this.deps.registry);
    if (!depResult.ok) return depResult;

    const expanded: CapabilityDefinitionRecord[] = [];
    for (const id of depResult.value.resolved) {
      const got = this.deps.registry.get(id);
      if (!got.ok) return got;
      if (got.value) expanded.push(got.value);
    }

    if (expanded.length === 0) {
      return failure(new ValidationError("dependency resolution produced empty capability set"));
    }

    const composed = this.deps.composer.compose(expanded);
    if (!composed.ok) return composed;

    const scorecards = [];
    for (const cap of expanded) {
      const scored = this.deps.scorer.score(
        cap,
        defaultEvolution(cap.capabilityId, cap.version)
      );
      if (!scored.ok) return scored;
      scorecards.push(scored.value);
    }

    const allListed = this.deps.registry.list();
    if (!allListed.ok) return allListed;

    const recommendations = this.deps.recommendations.build(
      composed.value.bundle.members,
      discovered.value,
      scorecards
    );
    if (!recommendations.ok) return recommendations;

    const compatibility = this.deps.compatibility.check(expanded, depResult.value);
    if (!compatibility.ok) return compatibility;

    const executionPlan = this.deps.planBuilder.build(
      request,
      composed.value.bundle,
      composed.value.graph
    );
    if (!executionPlan.ok) return executionPlan;

    const maturityReports = expanded.map(buildMaturityReport);

    return success({
      resultId: asCapabilityIntelligenceResultId(this.createId("cap_intel")),
      requestId: request.requestId,
      request,
      bundle: composed.value.bundle,
      graph: composed.value.graph,
      dependencies: depResult.value,
      executionPlan: executionPlan.value,
      recommendations: recommendations.value,
      maturityReports,
      compatibility: compatibility.value,
      scorecards,
      durationMs: Math.max(0, this.clockMs() - start),
      createdAt: this.nowIso(),
    });
  }

  private validate(request: CapabilityIntelligenceRequest): ValidationError | undefined {
    if (!request.requestId?.trim()) {
      return new ValidationError("requestId is required");
    }
    if (!request.businessObjective?.trim()) {
      return new ValidationError("businessObjective is required");
    }
    return undefined;
  }
}

function selectCapabilities(
  discovered: readonly CapabilityDefinitionRecord[],
  request: CapabilityIntelligenceRequest
): CapabilityDefinitionRecord[] {
  const preferred = new Set(request.preferredCapabilityIds ?? []);
  if (preferred.size > 0) {
    const hits = discovered.filter((d) => preferred.has(d.capabilityId));
    if (hits.length > 0) return hits;
  }

  // Prefer non-deprecated; take top matches for a coherent bundle (up to 4 seeds).
  return discovered.filter((d) => d.maturity !== "deprecated").slice(0, 4);
}
