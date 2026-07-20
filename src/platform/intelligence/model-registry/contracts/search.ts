/**
 * Discovery and search contracts.
 */

import type { ProviderId } from "../../shared/identifiers";
import type {
  AvailabilityState,
  DepartmentKind,
  LatencyTier,
  ModalityKind,
  ModelLifecycleState,
  QualityTier,
} from "./enums";
import type { CanonicalModel } from "./model";
import type { CanonicalProvider } from "./provider";

export interface ModelDiscoveryResult {
  readonly providers: readonly CanonicalProvider[];
  readonly models: readonly CanonicalModel[];
  readonly capabilities: readonly string[];
  readonly discoveredAt: string;
  readonly totalProviders: number;
  readonly totalModels: number;
}

export interface ModelSearchRequest {
  readonly query?: string;
  readonly providerId?: ProviderId;
  readonly department?: DepartmentKind;
  readonly capability?: string;
  readonly modality?: ModalityKind;
  readonly latencyTier?: LatencyTier;
  readonly qualityTier?: QualityTier;
  readonly maxInputCostPer1k?: number;
  readonly region?: string;
  readonly lifecycle?: ModelLifecycleState;
  readonly availability?: AvailabilityState;
  readonly limit?: number;
  readonly offset?: number;
}

export interface ModelSearchResult {
  readonly models: readonly CanonicalModel[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly query?: string;
}
