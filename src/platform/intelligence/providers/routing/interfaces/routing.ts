/**
 * Routing interfaces barrel.
 */

import type { Result } from "../../../shared/result";
import type { CapabilityId, ProviderId } from "../../../shared/identifiers";
import type {
  RoutingCandidate,
  RoutingRecommendation,
  RoutingScore,
} from "../contracts/candidate";
import type { RoutingConstraint } from "../contracts/policy";
import type {
  RoutingDecision,
  RoutingExperiment,
  RoutingHealthSnapshot,
  RoutingHistory,
  FailoverStep,
  RoutingTopology,
} from "../contracts/plan";
import type { RoutingPreferences, RoutingRequest } from "../contracts/request";
import type { LoadBalancingKind, RoutingStrategyKind } from "../contracts/enums";

export interface IProviderRoutingEngine {
  route(request: RoutingRequest): Promise<Result<RoutingDecision>>;
  explain(request: RoutingRequest): Promise<Result<readonly RoutingScore[]>>;
}

export interface IRoutingStrategy {
  readonly kind: RoutingStrategyKind;
  rank(
    scores: readonly RoutingScore[],
    request: RoutingRequest
  ): Result<readonly RoutingScore[]>;
}

export interface IRoutingPolicy {
  readonly policyId: string;
  apply(request: RoutingRequest): Result<RoutingRequest>;
}

export interface IRoutingScorer {
  score(
    candidate: RoutingCandidate,
    request: RoutingRequest
  ): Result<RoutingScore>;
  scoreAll(
    candidates: readonly RoutingCandidate[],
    request: RoutingRequest
  ): Result<readonly RoutingScore[]>;
}

export interface IRoutingRanker {
  rank(
    scores: readonly RoutingScore[],
    strategy: RoutingStrategyKind,
    request: RoutingRequest
  ): Result<readonly RoutingScore[]>;
}

export interface IRoutingHistory {
  record(entry: RoutingHistory["entries"][number]): void;
  forCapability(capabilityId: CapabilityId): RoutingHistory;
  qualityScore(providerId: ProviderId, capabilityId: CapabilityId): number;
  latencyScore(providerId: ProviderId, capabilityId: CapabilityId): number;
}

export interface IRoutingHealthProvider {
  snapshot(providerId: ProviderId): RoutingHealthSnapshot;
  isHealthy(providerId: ProviderId): boolean;
}

export interface IRoutingPreferenceResolver {
  resolve(
    candidates: readonly RoutingCandidate[],
    preferences?: RoutingPreferences
  ): Result<readonly RoutingCandidate[]>;
}

export interface ComplianceOutcome {
  readonly allowed: boolean;
  readonly score: number;
  readonly reasons: readonly string[];
}

export interface IRoutingComplianceEngine {
  evaluate(
    candidate: RoutingCandidate,
    constraints?: readonly RoutingConstraint[]
  ): Result<ComplianceOutcome>;
  filter(
    candidates: readonly RoutingCandidate[],
    constraints?: readonly RoutingConstraint[]
  ): Result<readonly RoutingCandidate[]>;
}

export interface IRoutingFailoverEngine {
  buildChain(
    ranked: readonly RoutingRecommendation[],
    request: RoutingRequest
  ): Result<readonly FailoverStep[]>;
}

export interface ExperimentAssignment {
  readonly experiments: readonly RoutingExperiment[];
  readonly warnings: readonly string[];
}

export interface IRoutingExperimentEngine {
  assign(
    primary: RoutingRecommendation,
    fallbacks: readonly RoutingRecommendation[],
    request: RoutingRequest
  ): Result<ExperimentAssignment>;
}

export interface IRoutingLoadBalancer {
  readonly kind: LoadBalancingKind;
  select(
    recommendations: readonly RoutingRecommendation[],
    request: RoutingRequest
  ): Result<RoutingRecommendation>;
}

export interface IRoutingShadowEngine {
  assignShadow(
    primary: RoutingRecommendation,
    candidates: readonly RoutingCandidate[]
  ): Result<RoutingExperiment | undefined>;
}

export interface RoutingDiagnosticReport {
  readonly missingProviders: readonly string[];
  readonly constraintViolations: readonly string[];
  readonly unhealthyProviders: readonly string[];
  readonly experimentConflicts: readonly string[];
}

export interface IRoutingDiagnostics {
  analyze(request: RoutingRequest, decision?: RoutingDecision): RoutingDiagnosticReport;
  topology(request: RoutingRequest): RoutingTopology;
}

export interface IRoutingEventPublisher {
  publishDecision(decision: RoutingDecision): Promise<void>;
}
