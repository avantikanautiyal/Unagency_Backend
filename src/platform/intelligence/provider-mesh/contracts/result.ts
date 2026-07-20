/**
 * Provider Mesh snapshot + report.
 */

import type { MeshResultId, ProviderMeshSnapshotId } from "./identifiers";
import type { ProviderMeshRequest } from "./inputs";
import type { ProviderOperationalRecord } from "./state";
import type {
  RoutingHint,
  FailoverChain,
  CanaryPlan,
  ShadowRecommendation,
  ProviderCapacityReport,
} from "./recommendations";

export interface ProviderMeshTopology {
  readonly nodes: readonly string[];
  readonly edges: readonly { readonly from: string; readonly to: string; readonly kind: string }[];
}

export interface ProviderMeshSnapshot {
  readonly snapshotId: ProviderMeshSnapshotId;
  readonly providers: readonly ProviderOperationalRecord[];
  readonly topology: ProviderMeshTopology;
  readonly routingHints: readonly RoutingHint[];
  readonly failoverChains: readonly FailoverChain[];
  readonly canaryPlans: readonly CanaryPlan[];
  readonly shadowRecommendations: readonly ShadowRecommendation[];
  readonly capacityReports: readonly ProviderCapacityReport[];
  readonly capturedAt: string;
  readonly version: string;
}

export interface ProviderMeshReport {
  readonly resultId: MeshResultId;
  readonly requestId: string;
  readonly request: ProviderMeshRequest;
  readonly snapshot: ProviderMeshSnapshot;
  readonly eventsProcessed: number;
  readonly providersTracked: number;
  readonly durationMs: number;
  readonly createdAt: string;
}
