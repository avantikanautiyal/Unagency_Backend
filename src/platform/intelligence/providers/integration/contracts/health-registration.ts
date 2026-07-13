/**
 * Integration health, statistics, snapshot, and registration contracts.
 *
 * Purpose: Observability + registration records for integrated providers.
 * Responsibilities: Aggregate health across subsystems.
 * Usage: Produced by health monitor, registry, engine.
 * Future Extension: SLO fields.
 */

import type { ProviderId } from "../../../shared/identifiers";
import type { IntegrationHealthState, IntegrationLifecycleState } from "./enums";
import type { IntegrationId } from "./identifiers";
import type { ProviderManifest } from "../../adapters/contracts/provider-manifest";

export interface ProviderRegistrationRecord {
  readonly integrationId: IntegrationId;
  readonly providerId: ProviderId;
  readonly vendor: string;
  readonly manifest: ProviderManifest;
  readonly lifecycleState: IntegrationLifecycleState;
  readonly registeredAt: string;
  readonly updatedAt: string;
}

export interface ProviderIntegrationHealth {
  readonly state: IntegrationHealthState;
  readonly registryHealthy: boolean;
  readonly manifestHealthy: boolean;
  readonly compatibilityHealthy: boolean;
  readonly synchronizationHealthy: boolean;
  readonly lifecycleHealthy: boolean;
  readonly checkedAt: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface ProviderIntegrationStatistics {
  readonly totalProviders: number;
  readonly registered: number;
  readonly installed: number;
  readonly activated: number;
  readonly paused: number;
  readonly disabled: number;
  readonly deprecated: number;
  readonly removed: number;
}

export interface ProviderIntegrationSnapshot {
  readonly integrationId: IntegrationId;
  readonly providerId: ProviderId;
  readonly lifecycleState: IntegrationLifecycleState;
  readonly health: ProviderIntegrationHealth;
  readonly statistics: ProviderIntegrationStatistics;
  readonly capturedAt: string;
}
