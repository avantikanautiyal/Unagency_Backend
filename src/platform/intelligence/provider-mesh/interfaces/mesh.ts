/**
 * Provider Mesh interfaces.
 */

import type { Result } from "../../shared/result";
import type { ProviderMeshRequest, ProviderMeshEvent } from "../contracts/inputs";
import type { ProviderMeshReport, ProviderMeshSnapshot } from "../contracts/result";
import type { ProviderOperationalRecord, ProviderTelemetryWindow } from "../contracts/state";
import type { ProviderScoreBreakdown } from "../contracts/state";
import type {
  RoutingHint,
  FailoverChain,
  CanaryPlan,
  ShadowRecommendation,
} from "../contracts/recommendations";

export interface IProviderMeshEngine {
  observe(request: ProviderMeshRequest): Promise<Result<ProviderMeshReport>>;
  snapshot(): Promise<Result<ProviderMeshSnapshot>>;
}

export interface IMeshRegistry {
  upsert(record: ProviderOperationalRecord): Result<ProviderOperationalRecord>;
  get(providerId: string): Result<ProviderOperationalRecord | undefined>;
  list(): Result<readonly ProviderOperationalRecord[]>;
  clear(): Result<void>;
}

export interface ITelemetryAggregator {
  aggregate(providerId: string, events: readonly ProviderMeshEvent[]): Result<ProviderTelemetryWindow>;
}

export interface IHealthEvaluator {
  evaluate(
    providerId: string,
    telemetry: ProviderTelemetryWindow,
    events: readonly ProviderMeshEvent[]
  ): Result<Pick<ProviderOperationalRecord, "state" | "healthScore" | "explanation">>;
}

export interface IProviderScorer {
  score(
    telemetry: ProviderTelemetryWindow,
    healthScore: number,
    certificationBoost: number
  ): Result<ProviderScoreBreakdown>;
}

export interface IRoutingHintBuilder {
  build(records: readonly ProviderOperationalRecord[]): Result<readonly RoutingHint[]>;
}

export interface IFailoverPlanner {
  plan(records: readonly ProviderOperationalRecord[]): Result<readonly FailoverChain[]>;
}

export interface ICanaryPlanner {
  plan(records: readonly ProviderOperationalRecord[]): Result<readonly CanaryPlan[]>;
}

export interface IShadowPlanner {
  plan(records: readonly ProviderOperationalRecord[]): Result<readonly ShadowRecommendation[]>;
}

/** Future consumers — interfaces only. */
export interface IRoutingMeshConsumer {
  consumeHints(hints: readonly RoutingHint[]): Promise<Result<void>>;
}

export interface INegotiationMeshConsumer {
  consumeHints(hints: readonly RoutingHint[]): Promise<Result<void>>;
}

export interface IExecutionIntelligenceMeshConsumer {
  consumeSnapshot(snapshot: ProviderMeshSnapshot): Promise<Result<void>>;
}

export interface IModelIntelligenceMeshConsumer {
  consumeSnapshot(snapshot: ProviderMeshSnapshot): Promise<Result<void>>;
}

export interface IConsensusMeshConsumer {
  consumeHints(hints: readonly RoutingHint[]): Promise<Result<void>>;
}
