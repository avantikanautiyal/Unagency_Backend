/**
 * Capability Intelligence interfaces.
 */

import type { Result } from "../../shared/result";
import type { CapabilityDefinitionRecord, CapabilityEvolutionMetrics } from "../contracts/capability";
import type { CapabilityIntelligenceRequest } from "../contracts/request";
import type { CapabilityIntelligenceReport, CapabilityExecutionPlan } from "../contracts/result";
import type {
  CapabilityBundle,
  CapabilityDependencies,
  CapabilityGraph,
} from "../contracts/graph";
import type {
  CapabilityCompatibilityReport,
  CapabilityRecommendations,
  CapabilityScorecard,
} from "../contracts/scoring";
import type { CapabilityDiscoveryHints } from "../contracts/request";
import type { CompositionShape } from "../contracts/enums";

export interface ICapabilityIntelligenceEngine {
  plan(request: CapabilityIntelligenceRequest): Promise<Result<CapabilityIntelligenceReport>>;
}

export interface ICapabilityRegistry {
  register(def: CapabilityDefinitionRecord): Result<CapabilityDefinitionRecord>;
  get(capabilityId: string): Result<CapabilityDefinitionRecord | undefined>;
  list(): Result<readonly CapabilityDefinitionRecord[]>;
  search(hints: CapabilityDiscoveryHints, objective: string): Result<readonly CapabilityDefinitionRecord[]>;
}

export interface ICapabilityDiscoverer {
  discover(
    registry: ICapabilityRegistry,
    request: CapabilityIntelligenceRequest
  ): Result<readonly CapabilityDefinitionRecord[]>;
}

export interface ICapabilityComposer {
  compose(
    capabilities: readonly CapabilityDefinitionRecord[],
    preferredShape?: CompositionShape
  ): Result<{
    readonly graph: CapabilityGraph;
    readonly bundle: CapabilityBundle;
    readonly shape: CompositionShape;
  }>;
}

export interface IDependencyResolver {
  resolve(
    capabilities: readonly CapabilityDefinitionRecord[],
    registry: ICapabilityRegistry
  ): Result<CapabilityDependencies>;
}

export interface ICapabilityScorer {
  score(
    capability: CapabilityDefinitionRecord,
    evolution?: CapabilityEvolutionMetrics
  ): Result<CapabilityScorecard>;
}

export interface IRecommendationBuilder {
  build(
    selected: readonly CapabilityDefinitionRecord[],
    candidates: readonly CapabilityDefinitionRecord[],
    scorecards: readonly CapabilityScorecard[]
  ): Result<CapabilityRecommendations>;
}

export interface ICompatibilityChecker {
  check(
    capabilities: readonly CapabilityDefinitionRecord[],
    dependencies: CapabilityDependencies
  ): Result<CapabilityCompatibilityReport>;
}

export interface IExecutionPlanBuilder {
  build(
    request: CapabilityIntelligenceRequest,
    bundle: CapabilityBundle,
    graph: CapabilityGraph
  ): Result<CapabilityExecutionPlan>;
}

/** Future consumers — interfaces only. */
export interface IExecutionIntelligenceCapabilityConsumer {
  consumePlan(plan: CapabilityExecutionPlan): Promise<Result<void>>;
}

export interface IModelIntelligenceCapabilityConsumer {
  consumePlan(plan: CapabilityExecutionPlan): Promise<Result<void>>;
}

export interface INegotiationCapabilityConsumer {
  consumePlan(plan: CapabilityExecutionPlan): Promise<Result<void>>;
}

export interface IRoutingCapabilityConsumer {
  consumePlan(plan: CapabilityExecutionPlan): Promise<Result<void>>;
}

export interface IProviderMeshCapabilityConsumer {
  consumePlan(plan: CapabilityExecutionPlan): Promise<Result<void>>;
}

export interface IProviderConsensusCapabilityConsumer {
  consumePlan(plan: CapabilityExecutionPlan): Promise<Result<void>>;
}
